import uuid
from decimal import Decimal
from flask import Blueprint, jsonify, request
from spx.common import db_connection, money, send_otp, token_required, verify_otp

blueprint = Blueprint("loans", __name__)
RATES={"PERSONAL":Decimal("12.50"),"HOME":Decimal("8.50"),"CAR":Decimal("9.25"),"EDUCATION":Decimal("10.00"),"BUSINESS":Decimal("13.50")}

@blueprint.post("/api/loans/send-otp")
@token_required()
def send_application_otp():
    connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True)
        cursor.execute("SELECT email,first_name,account_status FROM users WHERE id=%s",(int(request.identity["sub"]),))
        user=cursor.fetchone()
        if not user or user["account_status"]!="ACTIVE":
            return jsonify(status="error",message="Active customer account not found."),403
        send_otp(user["email"],"LOAN_APPLICATION",user["first_name"])
        return jsonify(status="success",message="OTP sent to your registered email address.")
    except Exception as error:
        return jsonify(status="error",message=f"Unable to send OTP: {error}"),502
    finally:connection.close()

@blueprint.post("/api/loans/verify-otp")
@token_required()
def verify_application_otp():
    otp=str((request.get_json(silent=True) or {}).get("otp","")).strip()
    connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True)
        cursor.execute("SELECT email FROM users WHERE id=%s",(int(request.identity["sub"]),))
        user=cursor.fetchone()
        if not user or not verify_otp(user["email"],"LOAN_APPLICATION",otp):
            return jsonify(status="error",message="Invalid or expired OTP."),400
        return jsonify(status="success",message="Email verified for loan application.")
    finally:connection.close()

def ensure_loan_schema(connection):
    cursor=connection.cursor()
    cursor.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='loans'");existing={row[0] for row in cursor.fetchall()}
    columns={"interest_rate":"DECIMAL(5,2) NOT NULL DEFAULT 12.50","emi":"DECIMAL(15,2) NULL","employment_type":"VARCHAR(50) NULL","monthly_income":"DECIMAL(15,2) NULL","existing_emi":"DECIMAL(15,2) DEFAULT 0","outstanding_principal":"DECIMAL(15,2) DEFAULT 0","reference_id":"VARCHAR(50) NULL","admin_notes":"TEXT NULL"}
    for name,definition in columns.items():
        if name not in existing:
            try:cursor.execute(f"ALTER TABLE loans ADD COLUMN {name} {definition}")
            except Exception as error:
                if getattr(error,"errno",None)!=1060:raise
    cursor.execute("CREATE TABLE IF NOT EXISTS loan_payments(id BIGINT AUTO_INCREMENT PRIMARY KEY,loan_id BIGINT NOT NULL,user_id INT NOT NULL,amount DECIMAL(15,2) NOT NULL,principal_component DECIMAL(15,2) NOT NULL,interest_component DECIMAL(15,2) NOT NULL,balance_after DECIMAL(15,2) NOT NULL,reference_id VARCHAR(50) NOT NULL,paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
    connection.commit();cursor.close()

def loan_terms(amount,rate,months):
    monthly=rate/Decimal("1200")
    emi=(amount*monthly*(1+monthly)**months/((1+monthly)**months-1)).quantize(Decimal("0.01")) if monthly else (amount/months).quantize(Decimal("0.01"))
    return emi,(emi*months).quantize(Decimal("0.01"))

@blueprint.post("/api/loans/calculate")
@token_required()
def calculate():
    body=request.get_json(silent=True) or {}
    try:amount=Decimal(str(body.get("amount",0)));months=int(body.get("tenure_months",0))
    except Exception:return jsonify(success=False,message="Enter a valid amount and tenure."),400
    kind=str(body.get("loan_type","PERSONAL")).upper();rate=RATES.get(kind,Decimal("12.50"))
    if amount<10000 or amount>10000000 or months<6 or months>360:return jsonify(success=False,message="Loan amount must be between ₹10,000 and ₹1 Crore and tenure between 6 and 360 months."),400
    emi,total=loan_terms(amount,rate,months);return jsonify(success=True,loan_type=kind,interest_rate=float(rate),emi=float(emi),total_payable=float(total),total_interest=float(total-amount))

@blueprint.post("/api/loans/apply")
@token_required()
def legacy_apply():
    body=request.get_json(silent=True) or {};kind=str(body.get("loan_type","PERSONAL")).upper()
    try:amount=money(body.get("amount"));months=int(body.get("tenure_months",0));income=Decimal(str(body.get("monthly_income",0)))
    except Exception:return jsonify(success=False,message="Enter valid loan details."),400
    if kind not in RATES or months<6 or months>360 or income<=0:return jsonify(success=False,message="Complete all required loan details."),400
    emi,total=loan_terms(amount,RATES[kind],months);ref="SPXPL"+uuid.uuid4().hex[:10].upper();connection=db_connection()
    try:
        ensure_loan_schema(connection);cursor=connection.cursor();cursor.execute("INSERT INTO loans(user_id,loan_type,amount,interest_rate,tenure_months,emi,purpose,employment_type,monthly_income,existing_emi,outstanding_principal,reference_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(int(request.identity["sub"]),kind,amount,RATES[kind],months,emi,str(body.get("purpose",""))[:255],str(body.get("employment_type",""))[:50],income,body.get("existing_emi",0),amount,ref));connection.commit();return jsonify(success=True,loan_id=cursor.lastrowid,reference_id=ref,emi=float(emi),interest_rate=float(RATES[kind]),status="PENDING"),201
    finally:connection.close()

@blueprint.get("/api/loans")
@token_required()
def list_loans():
    connection = db_connection()
    try:
        ensure_loan_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id,loan_type,amount,interest_rate,tenure_months,emi,status,purpose,employment_type,monthly_income,existing_emi,outstanding_principal,reference_id,admin_notes,created_at AS applied_at FROM loans WHERE user_id=%s ORDER BY id DESC", (int(request.identity["sub"]),))
        rows = cursor.fetchall()
        for row in rows:
            for key in ("amount","interest_rate","emi","monthly_income","existing_emi","outstanding_principal"):
                row[key]=float(row[key] or 0)
            row["applied_at"] = row["applied_at"].isoformat()
        return jsonify(success=True, loans=rows)
    finally:
        connection.close()

@blueprint.post("/api/loans")
@token_required()
def apply():
    body = request.get_json(silent=True) or {}
    try: amount = money(body.get("amount"))
    except ValueError as error: return jsonify(success=False, message=str(error)), 400
    loan_type = str(body.get("loan_type", "")).strip().upper()
    tenure = int(body.get("tenure_months", 0))
    if not loan_type or tenure < 1 or tenure > 360:
        return jsonify(success=False, message="Valid loan_type and tenure_months are required"), 400
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("INSERT INTO loans(user_id,loan_type,amount,tenure_months,purpose) VALUES(%s,%s,%s,%s,%s)", (int(request.identity["sub"]), loan_type, amount, tenure, str(body.get("purpose", ""))[:255]))
        connection.commit()
        return jsonify(success=True, loan_id=cursor.lastrowid, status="PENDING"), 201
    finally: connection.close()


@blueprint.get("/api/loans/<int:loan_id>/payments")
@token_required()
def payment_history(loan_id):
    connection=db_connection()
    try:
        ensure_loan_schema(connection);cursor=connection.cursor(dictionary=True);cursor.execute("SELECT amount,principal_component,interest_component,balance_after,reference_id,paid_at FROM loan_payments WHERE loan_id=%s AND user_id=%s ORDER BY id DESC",(loan_id,int(request.identity["sub"])));rows=cursor.fetchall()
        for row in rows:
            for key in ("amount","principal_component","interest_component","balance_after"):row[key]=float(row[key])
            row["paid_at"]=row["paid_at"].isoformat()
        return jsonify(success=True,payments=rows)
    finally:connection.close()


@blueprint.post("/api/loans/<int:loan_id>/pay")
@token_required()
def pay_loan(loan_id):
    try:amount=money((request.get_json(silent=True) or {}).get("amount"))
    except ValueError as error:return jsonify(success=False,message=str(error)),400
    uid=int(request.identity["sub"]);connection=db_connection()
    try:
        ensure_loan_schema(connection);cursor=connection.cursor(dictionary=True);connection.start_transaction();cursor.execute("SELECT * FROM loans WHERE id=%s AND user_id=%s FOR UPDATE",(loan_id,uid));loan=cursor.fetchone();cursor.execute("SELECT balance FROM users WHERE id=%s FOR UPDATE",(uid,));user=cursor.fetchone()
        if not loan or loan["status"]!="ACTIVE":connection.rollback();return jsonify(success=False,message="Only active loans can be repaid."),400
        outstanding=Decimal(str(loan["outstanding_principal"] or loan["amount"]));balance=Decimal(str(user["balance"]));amount=min(amount,outstanding)
        if amount>balance:connection.rollback();return jsonify(success=False,message="Insufficient account balance."),400
        interest=min((outstanding*Decimal(str(loan["interest_rate"]))/Decimal("1200")).quantize(Decimal("0.01")),amount);principal=amount-interest;remaining=outstanding-principal;new_balance=balance-amount;ref="LNP-"+uuid.uuid4().hex[:12].upper();status="CLOSED" if remaining<=0 else "ACTIVE"
        cursor.execute("UPDATE users SET balance=%s WHERE id=%s",(new_balance,uid));cursor.execute("UPDATE loans SET outstanding_principal=%s,status=%s WHERE id=%s",(remaining,status,loan_id));cursor.execute("INSERT INTO loan_payments(loan_id,user_id,amount,principal_component,interest_component,balance_after,reference_id) VALUES(%s,%s,%s,%s,%s,%s,%s)",(loan_id,uid,amount,principal,interest,remaining,ref));cursor.execute("INSERT INTO transactions(user_id,type,amount,counterparty_account,balance_after,reference_id) VALUES(%s,'LOAN_PAYMENT',%s,'SPX BANK LOAN',%s,%s)",(uid,amount,new_balance,ref));connection.commit();return jsonify(success=True,referenceId=ref,newBalance=f"{new_balance:,.2f}",outstanding=f"{remaining:,.2f}",status=status)
    except Exception:connection.rollback();raise
    finally:connection.close()

