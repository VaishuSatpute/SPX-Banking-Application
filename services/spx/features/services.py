from flask import Blueprint, jsonify, request
from spx.common import db_connection, token_required

blueprint = Blueprint("services", __name__)
CATALOG=[{"code":"ADDRESS_CHANGE","name":"Change registered address"},{"code":"CHEQUE_BOOK","name":"Request cheque book"},{"code":"KYC_UPDATE","name":"Update KYC details"}]

@blueprint.get("/api/services/catalog")
def catalog(): return jsonify(success=True,services=CATALOG)

@blueprint.get("/api/services/requests")
@token_required()
def requests_list():
    connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True);cursor.execute("SELECT id,service_code,details,status,created_at FROM service_requests WHERE user_id=%s ORDER BY id DESC",(int(request.identity["sub"]),));rows=cursor.fetchall()
        for row in rows: row["created_at"]=row["created_at"].isoformat()
        return jsonify(success=True,requests=rows)
    finally: connection.close()

@blueprint.post("/api/services/requests")
@token_required()
def create_request():
    body=request.get_json(silent=True) or {};code=str(body.get("service_code","")).upper()
    if code not in {item["code"] for item in CATALOG}: return jsonify(success=False,message="Unknown service_code"),400
    connection=db_connection()
    try:
        cursor=connection.cursor();cursor.execute("INSERT INTO service_requests(user_id,service_code,details) VALUES(%s,%s,%s)",(int(request.identity["sub"]),code,str(body.get("details",""))[:1000]));connection.commit();return jsonify(success=True,request_id=cursor.lastrowid,status="OPEN"),201
    finally: connection.close()


