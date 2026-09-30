import random
import bcrypt
from flask import Blueprint, jsonify, request

from spx.common import create_scoped_token, decode_scoped_token, db_connection, ensure_customer_schema, send_otp, verify_otp

blueprint = Blueprint("registration", __name__)


@blueprint.post("/api/register")
def legacy_register():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    first_name = str(body.get("firstName", "")).strip()
    last_name = str(body.get("lastName", "")).strip()
    if not all((email, username, password, first_name, last_name)):
        return jsonify(success=False, message="Missing fields"), 400
    if len(password) < 10:
        return jsonify(success=False, message="Password must contain at least 10 characters"), 400
    connection = db_connection()
    try:
        ensure_customer_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id FROM otps WHERE email=%s AND action='REGISTER' AND used=TRUE AND created_at >= NOW()-INTERVAL 10 MINUTE ORDER BY id DESC LIMIT 1", (email,))
        if not cursor.fetchone():
            return jsonify(success=False, message="OTP verification required"), 403
        cursor.execute("SELECT id FROM users WHERE email=%s OR username=%s", (email, username))
        if cursor.fetchone():
            return jsonify(success=False, message="Username or email already exists"), 409
        account = "884901" + str(random.randint(100000, 999999))
        mid = str(random.randint(10_000_000_000, 99_999_999_999))
        cursor.execute("INSERT INTO users(username,email,password_hash,first_name,last_name,account_number,mid_number,balance) VALUES(%s,%s,%s,%s,%s,%s,%s,25000.00)", (username,email,bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode(),first_name,last_name,account,mid))
        user_id = cursor.lastrowid
        cursor.execute("INSERT IGNORE INTO add_info(user_id) VALUES(%s)", (user_id,))
        cursor.execute("INSERT IGNORE INTO user_privileges(user_id,fund_transfer) VALUES(%s,TRUE)", (user_id,))
        connection.commit()
        return jsonify(success=True,message="Registration successful",user={"username":username,"name":f"{first_name} {last_name}","email":email,"accountType":"Savings Account","accountNumber":account,"balance":"25,000.00"}),201
    except Exception:
        connection.rollback()
        return jsonify(success=False,message="Unable to create account"),500
    finally:
        connection.close()


@blueprint.post("/api/registration/users")
def register():
    body = request.get_json(silent=True) or {}
    required = ("email", "password", "first_name", "last_name")
    if any(not str(body.get(key, "")).strip() for key in required):
        return jsonify(success=False, message="email, password, first_name and last_name are required"), 400
    email = body["email"].strip().lower()
    try:
        verified=decode_scoped_token(body.get("verification_token",""),"REGISTRATION")
        if verified.get("sub") != email: raise ValueError("Email mismatch")
    except Exception:
        return jsonify(success=False,message="Email OTP verification is required"),403
    if len(body["password"]) < 10:
        return jsonify(success=False, message="Password must contain at least 10 characters"), 400
    password_hash = bcrypt.hashpw(body["password"].encode(), bcrypt.gensalt()).decode()
    account = str(random.randint(10_000_000_000, 99_999_999_999))
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO users(email,password_hash,first_name,last_name,account_number) "
            "VALUES(%s,%s,%s,%s,%s)",
            (email, password_hash, body["first_name"].strip(), body["last_name"].strip(), account),
        )
        connection.commit()
        return jsonify(success=True, user_id=cursor.lastrowid, account_number=account), 201
    except Exception as error:
        connection.rollback()
        if getattr(error, "errno", None) == 1062:
            return jsonify(success=False, message="Email or account already exists"), 409
        raise
    finally:
        connection.close()


@blueprint.post("/api/registration/send-otp")
def send_registration_otp():
    body=request.get_json(silent=True) or {};email=str(body.get("email","")).strip().lower()
    if not email:return jsonify(success=False,message="Email is required"),400
    connection=db_connection()
    try:
        cursor=connection.cursor();cursor.execute("SELECT id FROM users WHERE email=%s",(email,))
        if cursor.fetchone():return jsonify(success=False,message="Email already exists"),409
    finally:connection.close()
    send_otp(email,"REGISTER",str(body.get("first_name","Customer")));return jsonify(success=True,message="OTP sent")


@blueprint.post("/api/registration/verify-otp")
def verify_registration_otp():
    body=request.get_json(silent=True) or {};email=str(body.get("email","")).strip().lower()
    if not verify_otp(email,"REGISTER",body.get("otp","")):return jsonify(success=False,message="Invalid or expired OTP"),400
    return jsonify(success=True,verification_token=create_scoped_token(email,"REGISTRATION"))

