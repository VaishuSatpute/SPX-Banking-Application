from flask import Blueprint, jsonify, request
from spx.common import db_connection, money, token_required

blueprint = Blueprint("investments", __name__)
PRODUCTS = [{"code":"FD12","name":"12-month Fixed Deposit","risk":"LOW"},{"code":"MFIDX","name":"Index Mutual Fund","risk":"MARKET"}]

@blueprint.get("/api/investments/products")
def products(): return jsonify(success=True, products=PRODUCTS)

@blueprint.get("/api/investments/holdings")
@token_required()
def holdings():
    connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True); cursor.execute("SELECT id,product_code,amount,status,created_at FROM investments WHERE user_id=%s ORDER BY id DESC",(int(request.identity["sub"]),)); rows=cursor.fetchall()
        for row in rows: row["amount"]=float(row["amount"]); row["created_at"]=row["created_at"].isoformat()
        return jsonify(success=True,holdings=rows)
    finally: connection.close()

@blueprint.post("/api/investments/holdings")
@token_required()
def subscribe():
    body=request.get_json(silent=True) or {}; code=str(body.get("product_code","")).upper()
    if code not in {p["code"] for p in PRODUCTS}: return jsonify(success=False,message="Unknown product_code"),400
    try: amount=money(body.get("amount"))
    except ValueError as error: return jsonify(success=False,message=str(error)),400
    connection=db_connection()
    try:
        cursor=connection.cursor(); cursor.execute("INSERT INTO investments(user_id,product_code,amount) VALUES(%s,%s,%s)",(int(request.identity["sub"]),code,amount)); connection.commit(); return jsonify(success=True,investment_id=cursor.lastrowid,status="PENDING"),201
    finally: connection.close()


