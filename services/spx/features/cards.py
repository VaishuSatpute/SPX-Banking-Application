from pathlib import Path
from flask import Blueprint, jsonify, request, send_from_directory
from spx.common import db_connection, money, token_required

blueprint=Blueprint("cards",__name__);PORTAL=Path(__file__).resolve().parent.parent/"card_portal"

def ensure_schema(conn):
    cur=conn.cursor();cur.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cards'");existing={r[0] for r in cur.fetchall()}
    columns={"variant":"VARCHAR(30) NOT NULL DEFAULT 'CLASSIC'","cardholder_name":"VARCHAR(150) NULL","delivery_address":"VARCHAR(500) NULL","requested_limit":"DECIMAL(15,2) NULL","daily_atm_limit":"DECIMAL(15,2) NOT NULL DEFAULT 25000","daily_pos_limit":"DECIMAL(15,2) NOT NULL DEFAULT 100000","online_enabled":"BOOLEAN NOT NULL DEFAULT TRUE","international_enabled":"BOOLEAN NOT NULL DEFAULT FALSE","contactless_enabled":"BOOLEAN NOT NULL DEFAULT TRUE"}
    for name,definition in columns.items():
        if name not in existing:cur.execute(f"ALTER TABLE cards ADD COLUMN {name} {definition}")
    conn.commit();cur.close()

@blueprint.get("/cards")
@blueprint.get("/cards/")
@blueprint.get("/home/landingPage/cards")
@blueprint.get("/home/landingPage/cards/")
def portal():return send_from_directory(PORTAL,"index.html")
@blueprint.get("/cards/static/<path:name>")
def asset(name):return send_from_directory(PORTAL,name)

@blueprint.get("/api/cards")
@token_required()
def list_cards():
    conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT id,card_type,variant,cardholder_name,card_number_masked,status,requested_limit,daily_atm_limit,daily_pos_limit,online_enabled,international_enabled,contactless_enabled,created_at FROM cards WHERE user_id=%s ORDER BY id DESC",(int(request.identity["sub"]),));rows=cur.fetchall()
        for row in rows:
            for key in ("requested_limit","daily_atm_limit","daily_pos_limit"):row[key]=float(row[key] or 0)
            for key in ("online_enabled","international_enabled","contactless_enabled"):row[key]=bool(row[key])
            row["created_at"]=row["created_at"].isoformat()
        return jsonify(success=True,cards=rows)
    finally:conn.close()

@blueprint.post("/api/cards")
@token_required()
def request_card():
    body=request.get_json(silent=True) or {};kind=str(body.get("card_type","")).upper();variant=str(body.get("variant","CLASSIC")).upper();address=str(body.get("delivery_address","")).strip()
    try:requested=money(body.get("requested_limit",50000)) if kind=="CREDIT" else None
    except ValueError as error:return jsonify(success=False,message=str(error)),400
    if kind not in {"DEBIT","CREDIT"} or variant not in {"CLASSIC","PLATINUM","SIGNATURE"}:return jsonify(success=False,message="Select a valid card type and variant."),400
    if len(address)<10:return jsonify(success=False,message="Enter a complete delivery address."),400
    if requested and requested>1000000:return jsonify(success=False,message="Requested credit limit cannot exceed ₹10,00,000."),400
    uid=int(request.identity["sub"]);conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT first_name,last_name,account_status FROM users WHERE id=%s",(uid,));user=cur.fetchone()
        if not user or user["account_status"]!="ACTIVE":return jsonify(success=False,message="An active customer account is required."),403
        cur.execute("SELECT id FROM cards WHERE user_id=%s AND card_type=%s AND status IN ('REQUESTED','PENDING','ACTIVE','ISSUED')",(uid,kind))
        if cur.fetchone():return jsonify(success=False,message=f"You already have an active or pending {kind.lower()} card."),409
        cur.execute("INSERT INTO cards(user_id,card_type,variant,cardholder_name,delivery_address,requested_limit) VALUES(%s,%s,%s,%s,%s,%s)",(uid,kind,variant,f"{user['first_name']} {user['last_name']}",address[:500],requested));conn.commit();return jsonify(success=True,card_id=cur.lastrowid,status="REQUESTED",message="Card request submitted for administrator approval."),201
    finally:conn.close()

@blueprint.patch("/api/cards/<int:card_id>/status")
@token_required()
def status(card_id):
    action=str((request.get_json(silent=True) or {}).get("action","")).upper()
    if action not in {"BLOCK","UNBLOCK"}:return jsonify(success=False,message="Action must be BLOCK or UNBLOCK."),400
    uid=int(request.identity["sub"]);conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT status FROM cards WHERE id=%s AND user_id=%s",(card_id,uid));card=cur.fetchone()
        if not card:return jsonify(success=False,message="Card not found."),404
        allowed=(action=="BLOCK" and card["status"] in {"ACTIVE","ISSUED"}) or (action=="UNBLOCK" and card["status"]=="BLOCKED")
        if not allowed:return jsonify(success=False,message="This action is not allowed for the current card status."),409
        new="BLOCKED" if action=="BLOCK" else "ACTIVE";cur.execute("UPDATE cards SET status=%s WHERE id=%s AND user_id=%s",(new,card_id,uid));conn.commit();return jsonify(success=True,status=new,message=f"Card {new.lower()} successfully.")
    finally:conn.close()

@blueprint.patch("/api/cards/<int:card_id>/controls")
@token_required()
def controls(card_id):
    body=request.get_json(silent=True) or {}
    try:atm=money(body.get("daily_atm_limit"));pos=money(body.get("daily_pos_limit"))
    except ValueError as error:return jsonify(success=False,message=str(error)),400
    if atm>100000 or pos>500000:return jsonify(success=False,message="ATM limit cannot exceed ₹1,00,000 and purchase limit cannot exceed ₹5,00,000."),400
    uid=int(request.identity["sub"]);conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor();cur.execute("UPDATE cards SET daily_atm_limit=%s,daily_pos_limit=%s,online_enabled=%s,international_enabled=%s,contactless_enabled=%s WHERE id=%s AND user_id=%s AND status IN ('ACTIVE','ISSUED','BLOCKED')",(atm,pos,bool(body.get("online_enabled")),bool(body.get("international_enabled")),bool(body.get("contactless_enabled")),card_id,uid))
        if cur.rowcount!=1:conn.rollback();return jsonify(success=False,message="An issued card is required to update controls."),409
        conn.commit();return jsonify(success=True,message="Card limits and controls updated.")
    finally:conn.close()
