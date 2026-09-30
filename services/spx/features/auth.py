import bcrypt
from flask import Blueprint, jsonify, request, make_response, redirect

from spx.common import create_token, create_scoped_token, db_connection, ensure_customer_schema, send_otp, verify_otp

blueprint = Blueprint("auth", __name__)


def find_user(login_name):
    connection = db_connection()
    try:
        ensure_customer_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id,email,first_name,last_name,password_hash,account_number,balance,account_status "
            "FROM users WHERE email=%s OR username=%s OR account_number=%s LIMIT 1",
            (login_name.lower(), login_name, login_name),
        )
        return cursor.fetchone()
    finally:
        connection.close()


@blueprint.post("/api/login")
def legacy_login():
    body = request.get_json(silent=True) or {}
    user = find_user(str(body.get("username", "")).strip())
    password = str(body.get("password", "")).encode()
    if not user or not bcrypt.checkpw(password, user["password_hash"].encode()):
        return jsonify(success=False, message="Invalid username or password"), 401
    if user["account_status"] != "ACTIVE":
        return jsonify(success=False, message=f"Account is {user['account_status']}"), 403
    return jsonify(success=True, email=user["email"], user={"username":user["email"], "name":f"{user['first_name']} {user['last_name']}", "email":user["email"], "accountType":"Savings Account", "accountNumber":user["account_number"], "balance":f"{user['balance']:,.2f}"})


@blueprint.post("/api/send-otp")
def legacy_send_otp():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    action = str(body.get("action", "")).upper()
    if not email or action not in {"LOGIN", "REGISTER", "RESET_PASSWORD"}:
        return jsonify(success=False, message="Invalid OTP request"), 400
    user = find_user(email)
    if action in {"LOGIN", "RESET_PASSWORD"} and not user:
        return jsonify(success=False, message="No account found with this email address"), 404
    if action == "REGISTER" and user:
        return jsonify(success=False, message="Email already exists"), 409
    send_otp(email, action, (user or {}).get("first_name") or body.get("username") or "Customer")
    return jsonify(success=True, message="OTP sent")


@blueprint.post("/api/verify-otp")
def legacy_verify_otp():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    action = str(body.get("action") or "LOGIN").upper()
    if not verify_otp(email, action, body.get("otp", "")):
        return jsonify(success=False, message="Invalid or expired OTP"), 400
    if action != "LOGIN":
        return jsonify(success=True)
    user = find_user(email)
    if not user or user["account_status"] != "ACTIVE":
        return jsonify(success=False, message="Account is not active"), 403
    response = make_response(jsonify(success=True, user={"username":user["email"], "name":f"{user['first_name']} {user['last_name']}", "email":user["email"], "accountType":"Savings Account", "accountNumber":user["account_number"], "balance":f"{user['balance']:,.2f}", "lastLogin":"Just now"}))
    response.set_cookie("spx_token", create_token(user["id"]), httponly=True, samesite="Lax", secure=request.is_secure, max_age=3600)
    return response


@blueprint.post("/api/logout")
def logout():
    response = make_response(jsonify(success=True))
    response.delete_cookie("spx_token")
    return response


@blueprint.get("/logout")
def browser_logout():
    response=make_response(redirect("/registration/welcome"));response.delete_cookie("spx_token");return response


@blueprint.post("/api/reset-password")
def legacy_reset_password():
    body = request.get_json(silent=True) or {}
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if len(password) < 10:
        return jsonify(success=False, message="Password must contain at least 10 characters"), 400
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id FROM otps WHERE email=%s AND action='RESET_PASSWORD' AND used=TRUE AND created_at >= NOW()-INTERVAL 15 MINUTE ORDER BY id DESC LIMIT 1", (email,))
        if not cursor.fetchone():
            return jsonify(success=False, message="OTP verification required"), 403
        cursor.execute("UPDATE users SET password_hash=%s WHERE email=%s", (bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode(),email))
        connection.commit()
        return jsonify(success=True, message="Password reset successful")
    finally:
        connection.close()


@blueprint.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    email = body.get("email", "").strip().lower()
    password = body.get("password", "").encode()
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, email, first_name, password_hash, account_status "
            "FROM users WHERE email=%s",
            (email,),
        )
        user = cursor.fetchone()
        if not user or not bcrypt.checkpw(password, user["password_hash"].encode()):
            return jsonify(success=False, message="Invalid credentials"), 401
        if user["account_status"] != "ACTIVE":
            return jsonify(success=False, message="Account is not active"), 403
        send_otp(user["email"], "LOGIN", user["first_name"])
        return jsonify(success=True, otp_required=True, email=user["email"], message="OTP sent to your registered email")
    finally:
        connection.close()


@blueprint.post("/api/auth/verify-otp")
def verify_login_otp():
    body=request.get_json(silent=True) or {}; email=str(body.get("email","")).strip().lower()
    if not verify_otp(email,"LOGIN",body.get("otp","")): return jsonify(success=False,message="Invalid or expired OTP"),400
    connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True);cursor.execute("SELECT id,email,first_name FROM users WHERE email=%s AND account_status='ACTIVE'",(email,));user=cursor.fetchone()
        if not user:return jsonify(success=False,message="Account not found or inactive"),404
        return jsonify(success=True,token=create_token(user["id"]),user={"id":user["id"],"email":user["email"],"name":user["first_name"]})
    finally:connection.close()


@blueprint.post("/api/auth/resend-otp")
def resend_login_otp():
    body=request.get_json(silent=True) or {};email=str(body.get("email","")).strip().lower();connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True);cursor.execute("SELECT first_name FROM users WHERE email=%s",(email,));user=cursor.fetchone()
        if not user:return jsonify(success=False,message="Account not found"),404
        send_otp(email,"LOGIN",user["first_name"]);return jsonify(success=True,message="OTP resent")
    finally:connection.close()


@blueprint.post("/api/auth/password-reset/request")
def request_reset():
    email=str((request.get_json(silent=True) or {}).get("email","")).strip().lower();connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True);cursor.execute("SELECT first_name FROM users WHERE email=%s",(email,));user=cursor.fetchone()
        if user:send_otp(email,"RESET_PASSWORD",user["first_name"])
        return jsonify(success=True,message="If the account exists, an OTP has been sent")
    finally:connection.close()


@blueprint.post("/api/auth/password-reset/verify")
def verify_reset():
    body=request.get_json(silent=True) or {};email=str(body.get("email","")).lower()
    if not verify_otp(email,"RESET_PASSWORD",body.get("otp","")):return jsonify(success=False,message="Invalid or expired OTP"),400
    return jsonify(success=True,reset_token=create_scoped_token(email,"PASSWORD_RESET"))


@blueprint.post("/api/auth/password-reset/complete")
def complete_reset():
    import jwt
    from spx.common import decode_scoped_token
    body=request.get_json(silent=True) or {};password=str(body.get("password",""))
    if len(password)<10:return jsonify(success=False,message="Password must contain at least 10 characters"),400
    try:email=decode_scoped_token(body.get("reset_token",""),"PASSWORD_RESET")["sub"]
    except jwt.PyJWTError:return jsonify(success=False,message="Invalid or expired reset token"),400
    connection=db_connection()
    try:
        cursor=connection.cursor();cursor.execute("UPDATE users SET password_hash=%s WHERE email=%s",(bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode(),email));connection.commit();return jsonify(success=True,message="Password updated")
    finally:connection.close()

