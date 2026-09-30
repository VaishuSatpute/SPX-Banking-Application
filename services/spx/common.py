import os
import hashlib
import random
import smtplib
from functools import wraps
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import jwt
import mysql.connector
from flask import jsonify, request


def db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "spx-mysql"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "spxapp"),
        password=os.environ["DB_PASS"],
        database=os.getenv("DB_NAME", "spxbank"),
        autocommit=False,
    )


def ensure_customer_schema(connection):
    """Idempotent compatibility migration for databases created by older releases."""
    cursor = connection.cursor()
    cursor.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'")
    existing = {row[0] for row in cursor.fetchall()}
    columns = {
        "username": "VARCHAR(100) NULL",
        "mid_number": "VARCHAR(20) NULL",
    }
    for name, definition in columns.items():
        if name not in existing:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")
            except mysql.connector.Error as error:
                if error.errno != 1060:
                    raise
    statements = [
        "CREATE TABLE IF NOT EXISTS add_info (id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL UNIQUE,date_of_birth DATE NULL,mobile_number VARCHAR(20),pan VARCHAR(20),father_name VARCHAR(255),alternate_email VARCHAR(255),communication_address TEXT,permanent_address TEXT,marital_status VARCHAR(30),religion VARCHAR(80),category VARCHAR(80),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS user_privileges (id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL UNIQUE,online_banking BOOLEAN DEFAULT TRUE,fund_transfer BOOLEAN DEFAULT TRUE,card_access BOOLEAN DEFAULT TRUE,loan_application BOOLEAN DEFAULT TRUE,high_value_transfer BOOLEAN DEFAULT FALSE,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    ]
    for statement in statements:
        cursor.execute(statement)
    connection.commit()
    cursor.close()


def create_token(user_id, role="CUSTOMER"):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "role": role, "iat": now, "exp": now + timedelta(hours=1)},
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )


def create_scoped_token(subject, role, minutes=10):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(subject), "role": role, "iat": now, "exp": now + timedelta(minutes=minutes)},
        os.environ["JWT_SECRET"], algorithm="HS256"
    )


def decode_scoped_token(value, role):
    claims = jwt.decode(value, os.environ["JWT_SECRET"], algorithms=["HS256"])
    if claims.get("role") != role:
        raise jwt.InvalidTokenError("Incorrect token scope")
    return claims


def ensure_otp_schema(connection):
    cursor = connection.cursor()
    cursor.execute("""CREATE TABLE IF NOT EXISTS otps (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp_hash CHAR(64) NOT NULL,
        action VARCHAR(30) NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        attempts INT NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_otps_lookup (email, action, used, created_at)
    )""")
    connection.commit()
    cursor.close()


def _otp_hash(email, action, otp):
    value = f"{os.environ['JWT_SECRET']}:{email.lower()}:{action}:{otp}"
    return hashlib.sha256(value.encode()).hexdigest()


def send_otp(email, action, first_name="Customer"):
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    if not smtp_user or not smtp_password:
        raise RuntimeError("SMTP credentials are not configured")
    otp = str(random.SystemRandom().randint(100000, 999999))
    connection = db_connection()
    try:
        ensure_otp_schema(connection)
        cursor = connection.cursor()
        cursor.execute("UPDATE otps SET used=TRUE WHERE email=%s AND action=%s AND used=FALSE", (email.lower(), action))
        cursor.execute("INSERT INTO otps(email,otp_hash,action,expires_at) VALUES(%s,%s,%s,%s)",
                       (email.lower(), _otp_hash(email, action, otp), action, datetime.utcnow() + timedelta(minutes=2)))
        connection.commit()
    finally:
        connection.close()
    subject = {"LOGIN":"SPX Bank login verification","REGISTER":"Verify your SPX Bank account","RESET_PASSWORD":"SPX Bank password reset"}.get(action,"SPX Bank verification")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"SPX Bank <{smtp_user}>"
    message["To"] = email
    message.set_content(f"Hello {first_name},\n\nYour SPX Bank verification code is {otp}. It expires in 2 minutes.\n\nNever share this code with anyone.")
    message.add_alternative(f"<div style='font-family:Arial;max-width:520px;margin:auto;padding:32px'><h2>{subject}</h2><p>Hello {first_name},</p><p>Use this one-time verification code:</p><div style='font-size:34px;font-weight:800;letter-spacing:8px;padding:24px;background:#f3f6fb;text-align:center'>{otp}</div><p>This code expires in 2 minutes. Never share it with anyone.</p></div>", subtype="html")
    host = os.getenv("SMTP_SERVER", "smtp.hostinger.com")
    port = int(os.getenv("SMTP_PORT", "465"))
    with smtplib.SMTP_SSL(host, port, timeout=20) as server:
        server.login(smtp_user, smtp_password)
        server.send_message(message)


def verify_otp(email, action, otp):
    connection = db_connection()
    try:
        ensure_otp_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM otps WHERE email=%s AND action=%s AND used=FALSE ORDER BY id DESC LIMIT 1", (email.lower(), action))
        record = cursor.fetchone()
        if not record or record["expires_at"] < datetime.utcnow() or record["attempts"] >= 5:
            return False
        if record["otp_hash"] != _otp_hash(email, action, str(otp)):
            cursor.execute("UPDATE otps SET attempts=attempts+1 WHERE id=%s", (record["id"],)); connection.commit(); return False
        cursor.execute("UPDATE otps SET used=TRUE WHERE id=%s", (record["id"],)); connection.commit(); return True
    finally:
        connection.close()


def token_required(role=None):
    def decorator(function):
        @wraps(function)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            token = header[7:] if header.startswith("Bearer ") else request.cookies.get("spx_token", "")
            if not token:
                return jsonify(success=False, message="Bearer token required"), 401
            try:
                claims = jwt.decode(
                    token, os.environ["JWT_SECRET"], algorithms=["HS256"]
                )
            except jwt.PyJWTError:
                return jsonify(success=False, message="Invalid token"), 401
            if role and claims.get("role") != role:
                return jsonify(success=False, message="Forbidden"), 403
            request.identity = claims
            return function(*args, **kwargs)
        return wrapper
    return decorator


def money(value):
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError):
        raise ValueError("Invalid monetary amount")
    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    return amount

