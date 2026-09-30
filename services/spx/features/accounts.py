from flask import Blueprint, jsonify, request
from spx.common import db_connection, ensure_customer_schema, token_required

blueprint = Blueprint("accounts", __name__)


def customer_row(user_id):
    connection=db_connection()
    try:
        ensure_customer_schema(connection)
        cursor=connection.cursor(dictionary=True)
        cursor.execute("SELECT u.*,a.date_of_birth,a.mobile_number,a.pan,a.father_name,a.alternate_email,a.communication_address,a.permanent_address,a.marital_status,a.religion,a.category,COALESCE(p.fund_transfer,TRUE) fund_transfer FROM users u LEFT JOIN add_info a ON a.user_id=u.id LEFT JOIN user_privileges p ON p.user_id=u.id WHERE u.id=%s",(user_id,))
        return cursor.fetchone()
    finally:connection.close()


@blueprint.get("/api/me")
@token_required()
def legacy_me():
    row=customer_row(int(request.identity["sub"]))
    if not row:return jsonify(success=False,message="User not found"),404
    return jsonify(success=True,user={"id":row["id"],"username":row.get("username") or row["email"],"name":f"{row['first_name']} {row['last_name']}","email":row["email"],"accountType":"Savings Account","accountNumber":row["account_number"],"balance":f"{row['balance']:,.2f}","midNumber":row.get("mid_number"),"lastLogin":"Current session","fundTransferEnabled":bool(row.get("fund_transfer",True)),"accountStatus":row["account_status"]})


@blueprint.get("/api/profile")
@token_required()
def profile_get():
    row=customer_row(int(request.identity["sub"]))
    if not row:return jsonify(success=False,message="User not found"),404
    for key in ("date_of_birth","created_at"):
        if row.get(key):row[key]=row[key].isoformat()
    row["name"]=f"{row['first_name']} {row['last_name']}";row["last_login_display"]="Current session"
    row["balance"]=f"{row['balance']:,.2f}"
    return jsonify(success=True,profile=row)


@blueprint.put("/api/profile")
@token_required()
def profile_update():
    body=request.get_json(silent=True) or {}; fields=["date_of_birth","mobile_number","pan","father_name","alternate_email","communication_address","permanent_address","marital_status","religion","category"]
    connection=db_connection()
    try:
        ensure_customer_schema(connection);cursor=connection.cursor();uid=int(request.identity["sub"]);cursor.execute("INSERT IGNORE INTO add_info(user_id) VALUES(%s)",(uid,))
        cursor.execute("UPDATE add_info SET "+",".join(f"{field}=%s" for field in fields)+" WHERE user_id=%s",tuple((body.get(field) or None) for field in fields)+(uid,));connection.commit();return jsonify(success=True,message="Profile updated successfully")
    finally:connection.close()

@blueprint.get("/api/accounts/me")
@token_required()
def account():
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id,email,first_name,last_name,account_number,balance,account_status,created_at FROM users WHERE id=%s", (int(request.identity["sub"]),))
        row = cursor.fetchone()
        if not row:
            return jsonify(success=False, message="Account not found"), 404
        row["balance"] = float(row["balance"])
        row["created_at"] = row["created_at"].isoformat()
        return jsonify(success=True, account=row)
    finally:
        connection.close()

