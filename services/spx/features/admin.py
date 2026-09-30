import os, secrets, uuid
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
import bcrypt
from flask import Blueprint, current_app, jsonify, redirect, request, send_from_directory
from spx.common import create_token, db_connection, send_otp, token_required, verify_otp

blueprint=Blueprint("admin",__name__);PORTAL=Path(__file__).resolve().parent.parent/"admin_portal"

def ensure_schema(conn):
    cur=conn.cursor();cur.execute("CREATE TABLE IF NOT EXISTS admin_audit_logs(id BIGINT AUTO_INCREMENT PRIMARY KEY,admin_email VARCHAR(255) NOT NULL,action VARCHAR(100) NOT NULL,target_type VARCHAR(50),target_id VARCHAR(100),details TEXT,prev_value TEXT,new_value TEXT,status VARCHAR(20) DEFAULT 'SUCCESS',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    additions={"users":{"last_login":"TIMESTAMP NULL","failed_attempts":"INT NOT NULL DEFAULT 0","lockout_until":"DATETIME NULL"},"loans":{"approved_at":"TIMESTAMP NULL","disbursed_at":"TIMESTAMP NULL","next_emi_date":"DATE NULL"},"cards":{"issued_at":"TIMESTAMP NULL","expires_at":"DATE NULL"},"transactions":{"description":"VARCHAR(255) NULL","status":"VARCHAR(20) DEFAULT 'COMPLETED'"}}
    for table,columns in additions.items():
        cur.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s",(table,));existing={r[0] for r in cur.fetchall()}
        for name,definition in columns.items():
            if name not in existing:cur.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
    conn.commit();cur.close()

def clean(rows):
    for row in rows:
        for key,value in list(row.items()):
            if isinstance(value,Decimal):row[key]=float(value)
            elif hasattr(value,"isoformat"):row[key]=value.isoformat(sep=" ") if isinstance(value,datetime) else value.isoformat()
    return rows

def audit(action,target_type="SYSTEM",target_id=None,details="",prev=None,new=None,status="SUCCESS"):
    conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor();cur.execute("INSERT INTO admin_audit_logs(admin_email,action,target_type,target_id,details,prev_value,new_value,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",(os.environ["ADMIN_EMAIL"],action,target_type,str(target_id) if target_id else None,details,str(prev) if prev is not None else None,str(new) if new is not None else None,status));conn.commit()
    finally:conn.close()

@blueprint.get("/admin")
@blueprint.get("/admin/")
def root():return redirect("/admin/login")
@blueprint.get("/admin/static/<path:name>")
def static_file(name):return send_from_directory(PORTAL,name)
@blueprint.get("/admin/login")
def login_page():return send_from_directory(PORTAL,"admin_login.html")
@blueprint.get("/admin/dashboard")
def dashboard_page():return send_from_directory(PORTAL,"admin_dashboard.html")
@blueprint.get("/admin/users")
def users_page():return send_from_directory(PORTAL,"admin_users.html")
@blueprint.get("/admin/users/<int:user_id>")
def user_page(user_id):return send_from_directory(PORTAL,"admin_user_detail.html")
@blueprint.get("/admin/loans")
def loans_page():return send_from_directory(PORTAL,"admin_loans.html")
@blueprint.get("/admin/cards")
def cards_page():return send_from_directory(PORTAL,"admin_cards.html")
@blueprint.get("/admin/transactions")
def transactions_page():return send_from_directory(PORTAL,"admin_transactions.html")
@blueprint.get("/admin/audit-logs")
def logs_page():return send_from_directory(PORTAL,"admin_audit_logs.html")
@blueprint.get("/admin/logout")
def logout_page():return redirect("/admin/login")

@blueprint.post("/api/admin/login")
def login():
    body=request.get_json(silent=True) or {};email=str(body.get("email","")).strip().lower();password=str(body.get("password","")).encode();admin_email=os.getenv("ADMIN_EMAIL","").strip().lower();password_hash=os.getenv("ADMIN_PASSWORD_HASH","").strip()
    if not admin_email or not password_hash:
        current_app.logger.error("Admin login is unavailable: ADMIN_EMAIL or ADMIN_PASSWORD_HASH is not configured")
        return jsonify(success=False,message="Administrator login is temporarily unavailable"),503
    try:password_matches=bcrypt.checkpw(password,password_hash.encode())
    except ValueError:
        current_app.logger.error("Admin login is unavailable: ADMIN_PASSWORD_HASH is not a valid bcrypt hash")
        return jsonify(success=False,message="Administrator login is temporarily unavailable"),503
    if email not in {admin_email,"admin"} or not password_matches:audit("FAILED_ADMIN_LOGIN",details=f"Failed login for {email}",status="FAILED");return jsonify(success=False,message="Invalid administrator credentials"),401
    try:send_otp(admin_email,"ADMIN_LOGIN",os.getenv("ADMIN_NAME","Bank Administrator"))
    except Exception as error:return jsonify(success=False,message=f"Unable to send administrator OTP: {error}"),502
    return jsonify(success=True,otp_required=True,message="OTP sent to administrator email")

@blueprint.post("/api/admin/verify-otp")
def verify_admin_otp():
    body=request.get_json(silent=True) or {};email=str(body.get("email","")).strip().lower();otp=str(body.get("otp","")).strip();admin_email=os.environ["ADMIN_EMAIL"].lower()
    if email not in {admin_email,"admin"} or not verify_otp(admin_email,"ADMIN_LOGIN",otp):return jsonify(success=False,message="Invalid or expired administrator OTP"),400
    audit("ADMIN_LOGIN",details="Master Admin authenticated with OTP");return jsonify(success=True,token=create_token(admin_email,"ADMIN"),user={"name":os.getenv("ADMIN_NAME","Bank Administrator"),"email":admin_email,"role":"MASTER_ADMIN"},redirect="/admin/dashboard")

@blueprint.get("/api/admin/dashboard")
@token_required("ADMIN")
def dashboard():
    conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT COUNT(*) total,SUM(account_status='ACTIVE') active,SUM(account_status='INACTIVE') inactive,SUM(account_status IN ('LOCKED','SUSPENDED')) locked FROM users");users=cur.fetchone();cur.execute("SELECT COALESCE(SUM(balance),0) total_deposits,COUNT(*) total_accounts FROM users");funds=cur.fetchone();cur.execute("SELECT COUNT(*) total_tx,COALESCE(SUM(amount),0) total_volume FROM transactions");tx=cur.fetchone();cur.execute("SELECT COUNT(*) total,SUM(status='PENDING') pending,SUM(status IN ('APPROVED','ACTIVE')) approved,SUM(status='REJECTED') rejected,COALESCE(SUM(amount),0) total_amount FROM loans");loans=cur.fetchone();cur.execute("SELECT COUNT(*) total,SUM(status='ACTIVE') active,SUM(status='BLOCKED') blocked,SUM(status IN ('REQUESTED','PENDING')) pending FROM cards");cards=cur.fetchone();cur.execute("SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 6");logs=clean(cur.fetchall());return jsonify(success=True,stats={"users":users,"funds":{"total_deposits":float(funds["total_deposits"]),"total_accounts":funds["total_accounts"]},"transactions":{"total_count":tx["total_tx"],"total_volume":float(tx["total_volume"])},"loans":clean([loans])[0],"cards":cards},recent_logs=logs)
    finally:conn.close()

@blueprint.get("/api/admin/users")
@token_required("ADMIN")
def users():
    conn=db_connection()
    try:ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT id,username,email,first_name,last_name,account_number,mid_number,balance,account_status,failed_attempts,created_at,last_login FROM users ORDER BY id DESC");return jsonify(success=True,users=clean(cur.fetchall()))
    finally:conn.close()

@blueprint.get("/api/admin/users/<int:user_id>")
@token_required("ADMIN")
def user_detail(user_id):
    conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT * FROM users WHERE id=%s",(user_id,));user=cur.fetchone()
        if not user:return jsonify(success=False,message="User not found"),404
        user.pop("password_hash",None);clean([user]);cur.execute("SELECT * FROM user_privileges WHERE user_id=%s",(user_id,));priv=cur.fetchone()
        if not priv:cur.execute("INSERT INTO user_privileges(user_id) VALUES(%s)",(user_id,));conn.commit();cur.execute("SELECT * FROM user_privileges WHERE user_id=%s",(user_id,));priv=cur.fetchone()
        cur.execute("SELECT * FROM loans WHERE user_id=%s ORDER BY id DESC",(user_id,));loans=clean(cur.fetchall());cur.execute("SELECT * FROM cards WHERE user_id=%s ORDER BY id DESC",(user_id,));cards=clean(cur.fetchall());cur.execute("SELECT * FROM add_info WHERE user_id=%s",(user_id,));info=cur.fetchone() or {};clean([info]);cur.execute("SELECT * FROM transactions WHERE user_id=%s ORDER BY id DESC LIMIT 20",(user_id,));transactions=clean(cur.fetchall());return jsonify(success=True,user=user,privileges=priv,loans=loans,cards=cards,transactions=transactions,add_info=info)
    finally:conn.close()

@blueprint.put("/api/admin/users/<int:user_id>/status")
@token_required("ADMIN")
def user_status(user_id):
    body=request.get_json(silent=True) or {};status=str(body.get("status","")).upper()
    if status not in {"ACTIVE","INACTIVE","SUSPENDED","LOCKED"}:return jsonify(success=False,message="Invalid status"),400
    conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT account_status FROM users WHERE id=%s",(user_id,));old=cur.fetchone()
        if not old:return jsonify(success=False,message="User not found"),404
        cur.execute("UPDATE users SET account_status=%s,failed_attempts=IF(%s='ACTIVE',0,failed_attempts),lockout_until=IF(%s='ACTIVE',NULL,lockout_until) WHERE id=%s",(status,status,status,user_id));conn.commit();audit("USER_STATUS_"+status,"USER",user_id,body.get("reason",""),old["account_status"],status);return jsonify(success=True,message=f"User account status updated to {status}")
    finally:conn.close()

@blueprint.put("/api/admin/users/<int:user_id>/privileges")
@token_required("ADMIN")
def privileges(user_id):
    b=request.get_json(silent=True) or {};vals=tuple(bool(b.get(k,k!="high_value_transfer")) for k in ("online_banking","fund_transfer","card_access","loan_application","high_value_transfer"));conn=db_connection()
    try:cur=conn.cursor();cur.execute("INSERT INTO user_privileges(user_id,online_banking,fund_transfer,card_access,loan_application,high_value_transfer) VALUES(%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE online_banking=VALUES(online_banking),fund_transfer=VALUES(fund_transfer),card_access=VALUES(card_access),loan_application=VALUES(loan_application),high_value_transfer=VALUES(high_value_transfer)",(user_id,*vals));conn.commit();audit("UPDATE_USER_PRIVILEGES","USER",user_id);return jsonify(success=True,message="User privileges updated successfully")
    finally:conn.close()

@blueprint.post("/api/admin/users/<int:user_id>/funds")
@token_required("ADMIN")
def funds(user_id):
    b=request.get_json(silent=True) or {};amount=Decimal(str(b.get("amount",0)));kind=str(b.get("type","CREDIT")).upper()
    if amount<=0 or kind not in {"CREDIT","DEBIT"}:return jsonify(success=False,message="Invalid adjustment"),400
    conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor(dictionary=True);conn.start_transaction();cur.execute("SELECT balance,account_number FROM users WHERE id=%s FOR UPDATE",(user_id,));user=cur.fetchone()
        if not user:return jsonify(success=False,message="User not found"),404
        old=Decimal(str(user["balance"]));new=old+amount if kind=="CREDIT" else old-amount
        if new<0:return jsonify(success=False,message="Insufficient funds"),400
        ref="ADM-"+uuid.uuid4().hex[:10].upper();cur.execute("UPDATE users SET balance=%s WHERE id=%s",(new,user_id));cur.execute("INSERT INTO transactions(user_id,type,amount,counterparty_account,balance_after,reference_id,description,status) VALUES(%s,%s,%s,'SPX ADMIN',%s,%s,%s,'COMPLETED')",(user_id,"ADMIN_"+kind,amount,new,ref,str(b.get("reason","Administrative adjustment"))[:255]));conn.commit();audit("FUND_ADJUSTMENT_"+kind,"USER",user_id,b.get("reason",""),old,new);return jsonify(success=True,message=f"Funds {kind}ED successfully. New Balance: ₹{new:,.2f}",new_balance=float(new))
    except Exception:conn.rollback();raise
    finally:conn.close()

@blueprint.get("/api/admin/loans")
@token_required("ADMIN")
def loans():
    conn=db_connection()
    try:ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT l.*,l.created_at applied_at,u.username,u.first_name,u.last_name,u.email,u.account_number FROM loans l JOIN users u ON u.id=l.user_id ORDER BY l.id DESC");return jsonify(success=True,loans=clean(cur.fetchall()))
    finally:conn.close()

@blueprint.put("/api/admin/loans/<int:item_id>/action")
@token_required("ADMIN")
def loan_action(item_id):
    b=request.get_json(silent=True) or {};action=str(b.get("action","")).upper();notes=str(b.get("notes",""))[:1000]
    if action not in {"APPROVE","REJECT","DISBURSE","ACTIVATE","CLOSE"}:return jsonify(success=False,message="Invalid loan action"),400
    conn=db_connection()
    try:
        ensure_schema(conn);cur=conn.cursor(dictionary=True);conn.start_transaction();cur.execute("SELECT * FROM loans WHERE id=%s FOR UPDATE",(item_id,));loan=cur.fetchone()
        if not loan:return jsonify(success=False,message="Loan application not found"),404
        old=loan["status"]
        if action=="APPROVE" and old=="PENDING":status="APPROVED";cur.execute("UPDATE loans SET status=%s,admin_notes=%s,approved_at=NOW() WHERE id=%s",(status,notes,item_id))
        elif action=="REJECT" and old in {"PENDING","APPROVED"}:status="REJECTED";cur.execute("UPDATE loans SET status=%s,admin_notes=%s WHERE id=%s",(status,notes,item_id))
        elif action=="DISBURSE" and old=="APPROVED":
            status="ACTIVE";cur.execute("SELECT balance FROM users WHERE id=%s FOR UPDATE",(loan["user_id"],));new=Decimal(str(cur.fetchone()["balance"]))+Decimal(str(loan["amount"]));ref="LND-"+uuid.uuid4().hex[:12].upper();next_date=(datetime.now().date().replace(day=1)+timedelta(days=32)).replace(day=5);cur.execute("UPDATE users SET balance=%s WHERE id=%s",(new,loan["user_id"]));cur.execute("UPDATE loans SET status='ACTIVE',admin_notes=%s,disbursed_at=NOW(),outstanding_principal=amount,next_emi_date=%s WHERE id=%s",(notes,next_date,item_id));cur.execute("INSERT INTO transactions(user_id,type,amount,counterparty_account,balance_after,reference_id,description,status) VALUES(%s,'ADMIN_CREDIT',%s,'SPX BANK LOAN',%s,%s,'Loan disbursement','COMPLETED')",(loan["user_id"],loan["amount"],new,ref))
        elif action=="CLOSE" and old in {"ACTIVE","APPROVED"}:status="CLOSED";cur.execute("UPDATE loans SET status=%s,admin_notes=%s WHERE id=%s",(status,notes,item_id))
        else:return jsonify(success=False,message=f"Cannot {action.lower()} a {old.lower()} loan"),409
        conn.commit();audit("LOAN_"+action,"LOAN",item_id,notes,old,status);return jsonify(success=True,message=f"Loan #{item_id} updated to {status}")
    except Exception:conn.rollback();raise
    finally:conn.close()

@blueprint.get("/api/admin/cards")
@token_required("ADMIN")
def cards():
    conn=db_connection()
    try:ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT c.*,u.username,u.first_name,u.last_name,u.email,u.account_number FROM cards c JOIN users u ON u.id=c.user_id ORDER BY c.id DESC");return jsonify(success=True,cards=clean(cur.fetchall()))
    finally:conn.close()

@blueprint.put("/api/admin/cards/<int:item_id>/action")
@token_required("ADMIN")
def card_action(item_id):
    action=str((request.get_json(silent=True) or {}).get("action","")).upper();mapping={"APPROVE":"ACTIVE","ISSUE":"ACTIVE","ACTIVATE":"ACTIVE","BLOCK":"BLOCKED","CANCEL":"CANCELLED"}
    if action not in mapping:return jsonify(success=False,message="Invalid card action"),400
    conn=db_connection()
    try:ensure_schema(conn);cur=conn.cursor();masked=f"XXXX XXXX XXXX {secrets.randbelow(10000):04d}";cur.execute("UPDATE cards SET status=%s,card_number_masked=IF(%s='ACTIVE',COALESCE(card_number_masked,%s),card_number_masked),issued_at=IF(%s='ACTIVE',COALESCE(issued_at,NOW()),issued_at),expires_at=IF(%s='ACTIVE',COALESCE(expires_at,DATE_ADD(CURDATE(),INTERVAL 5 YEAR)),expires_at) WHERE id=%s",(mapping[action],mapping[action],masked,mapping[action],mapping[action],item_id));conn.commit();audit("CARD_"+action,"CARD",item_id);return jsonify(success=True,message=f"Card #{item_id} updated to {mapping[action]}")
    finally:conn.close()

@blueprint.get("/api/admin/transactions")
@token_required("ADMIN")
def transactions():
    conn=db_connection()
    try:ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT t.*,u.username,u.first_name,u.last_name,u.email,u.account_number FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 100");return jsonify(success=True,transactions=clean(cur.fetchall()))
    finally:conn.close()
@blueprint.get("/api/admin/audit-logs")
@token_required("ADMIN")
def logs():
    conn=db_connection()
    try:ensure_schema(conn);cur=conn.cursor(dictionary=True);cur.execute("SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 200");return jsonify(success=True,audit_logs=clean(cur.fetchall()))
    finally:conn.close()
@blueprint.get("/api/admin/profile")
@token_required("ADMIN")
def profile():return jsonify(success=True,profile={"name":os.getenv("ADMIN_NAME","Bank Administrator"),"email":os.environ["ADMIN_EMAIL"],"role":"MASTER_ADMIN","system_status":"ACTIVE","permissions":["ALL_PERMISSIONS","MASTER_CONTROL"]})

