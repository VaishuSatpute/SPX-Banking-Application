from flask import Blueprint, jsonify, request
from spx.common import db_connection, money, token_required

blueprint = Blueprint("insurance", __name__)
PRODUCTS=[{"code":"TERM","name":"Term Life Insurance"},{"code":"HEALTH","name":"Health Insurance"},{"code":"MOTOR","name":"Motor Insurance"}]

@blueprint.get("/api/insurance/products")
def products(): return jsonify(success=True,products=PRODUCTS)

@blueprint.get("/api/insurance/policies")
@token_required()
def policies():
    connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True);cursor.execute("SELECT id,product_code,coverage_amount,status,created_at FROM insurance_policies WHERE user_id=%s ORDER BY id DESC",(int(request.identity["sub"]),));rows=cursor.fetchall()
        for row in rows: row["coverage_amount"]=float(row["coverage_amount"]);row["created_at"]=row["created_at"].isoformat()
        return jsonify(success=True,policies=rows)
    finally: connection.close()

@blueprint.post("/api/insurance/policies")
@token_required()
def apply():
    body=request.get_json(silent=True) or {};code=str(body.get("product_code","")).upper()
    if code not in {p["code"] for p in PRODUCTS}: return jsonify(success=False,message="Unknown product_code"),400
    try: coverage=money(body.get("coverage_amount"))
    except ValueError as error: return jsonify(success=False,message=str(error)),400
    connection=db_connection()
    try:
        cursor=connection.cursor();cursor.execute("INSERT INTO insurance_policies(user_id,product_code,coverage_amount) VALUES(%s,%s,%s)",(int(request.identity["sub"]),code,coverage));connection.commit();return jsonify(success=True,policy_id=cursor.lastrowid,status="PENDING"),201
    finally: connection.close()


