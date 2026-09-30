import uuid
from datetime import datetime
from flask import Blueprint, jsonify, request

from spx.common import db_connection, money, token_required

blueprint = Blueprint("payments", __name__)


@blueprint.post("/api/beneficiaries/verify")
@token_required()
def verify_beneficiary():
    body=request.get_json(silent=True) or {};account=str(body.get("accountNumber","")).strip().replace("#","").replace("-","");confirm=str(body.get("confirmAccountNumber","")).strip().replace("#","").replace("-","")
    if not account or account!=confirm:return jsonify(success=False,message="Account numbers do not match."),400
    connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True);cursor.execute("SELECT id,first_name,last_name,account_number,account_status FROM users WHERE account_number=%s",(account,));user=cursor.fetchone()
        if not user or user["account_status"]!="ACTIVE":return jsonify(success=False,message="Active recipient account not found."),404
        if user["id"]==int(request.identity["sub"]):return jsonify(success=False,message="You cannot send money to your own account."),400
        return jsonify(success=True,recipient={"firstName":user["first_name"],"lastName":user["last_name"],"accountNumber":user["account_number"]})
    finally:connection.close()


@blueprint.post("/api/transfer")
@token_required()
def legacy_transfer():
    body=request.get_json(silent=True) or {}
    translated={"destination_account":body.get("toAccount"),"amount":body.get("amount")};request._cached_json=(translated,translated)
    response=transfer()
    payload,status=response if isinstance(response,tuple) else (response,201)
    if status>=400:return response
    data=payload.get_json();return jsonify(success=True,message="Transfer completed successfully",referenceId=data["reference_id"],date=datetime.now().strftime("%d %b %Y, %I:%M %p"),recipient=body.get("toAccount"),amount=f"{float(body.get('amount')):,.2f}",newBalance=f"{data['balance']:,.2f}")


@blueprint.post("/api/payments/transfers")
@token_required()
def transfer():
    body = request.get_json(silent=True) or {}
    try:
        amount = money(body.get("amount"))
    except ValueError as error:
        return jsonify(success=False, message=str(error)), 400
    destination = str(body.get("destination_account", "")).strip()
    if not destination:
        return jsonify(success=False, message="destination_account is required"), 400
    source_id = int(request.identity["sub"])
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        connection.start_transaction()
        cursor.execute("SELECT id, account_number, balance FROM users WHERE id=%s FOR UPDATE", (source_id,))
        source = cursor.fetchone()
        cursor.execute("SELECT id, account_number, balance FROM users WHERE account_number=%s FOR UPDATE", (destination,))
        target = cursor.fetchone()
        if not source or not target:
            connection.rollback()
            return jsonify(success=False, message="Account not found"), 404
        if source["id"] == target["id"]:
            connection.rollback()
            return jsonify(success=False, message="Source and destination must differ"), 400
        if source["balance"] < amount:
            connection.rollback()
            return jsonify(success=False, message="Insufficient funds"), 409
        reference = "SPX-" + uuid.uuid4().hex[:12].upper()
        source_balance = source["balance"] - amount
        target_balance = target["balance"] + amount
        cursor.execute("UPDATE users SET balance=%s WHERE id=%s", (source_balance, source["id"]))
        cursor.execute("UPDATE users SET balance=%s WHERE id=%s", (target_balance, target["id"]))
        cursor.execute(
            "INSERT INTO transactions(user_id,type,amount,counterparty_account,balance_after,reference_id) VALUES(%s,'DEBIT',%s,%s,%s,%s)",
            (source["id"], amount, target["account_number"], source_balance, reference),
        )
        cursor.execute(
            "INSERT INTO transactions(user_id,type,amount,counterparty_account,balance_after,reference_id) VALUES(%s,'CREDIT',%s,%s,%s,%s)",
            (target["id"], amount, source["account_number"], target_balance, reference),
        )
        connection.commit()
        return jsonify(success=True, reference_id=reference, balance=float(source_balance)), 201
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

