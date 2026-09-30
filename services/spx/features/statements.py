import csv
import io
from flask import Blueprint, jsonify, request, Response

from spx.common import db_connection, token_required

blueprint = Blueprint("statements", __name__)


def transaction_rows(user_id,limit=200):
    connection=db_connection()
    try:
        cursor=connection.cursor(dictionary=True);cursor.execute("SELECT type,amount,counterparty_account,balance_after,reference_id,created_at FROM transactions WHERE user_id=%s ORDER BY id DESC LIMIT %s",(user_id,limit));return cursor.fetchall()
    finally:connection.close()


@blueprint.get("/api/transactions")
@token_required()
def legacy_transactions():
    rows=transaction_rows(int(request.identity["sub"]),min(request.args.get("limit",100,type=int),200));items=[]
    for row in rows:
        incoming=row["type"] in {"CREDIT","ADMIN_CREDIT"};items.append({"date":row["created_at"].strftime("%d %b %Y, %I:%M %p"),"title":"Money received" if incoming else "Money sent","typeLabel":row["type"].replace("_"," ").title(),"subtext":row.get("counterparty_account") or row.get("reference_id") or "SPX Bank","description":row.get("reference_id"),"direction":"IN" if incoming else "OUT","amount":f"{row['amount']:,.2f}","balanceAfter":f"{row['balance_after']:,.2f}","referenceId":row.get("reference_id")})
    return jsonify(success=True,transactions=items)


@blueprint.get("/api/transactions/statement")
@token_required()
def legacy_statement_download():
    rows=transaction_rows(int(request.identity["sub"]));output=io.StringIO();writer=csv.writer(output);writer.writerow(["Date","Type","Amount","Counterparty","Balance","Reference"])
    for row in rows:writer.writerow([row["created_at"].isoformat(),row["type"],row["amount"],row["counterparty_account"],row["balance_after"],row["reference_id"]])
    return Response(output.getvalue(),headers={"Content-Disposition":"attachment; filename=spx-statement.csv"},mimetype="text/csv")


@blueprint.get("/api/statements/transactions")
@token_required()
def statement():
    user_id = int(request.identity["sub"])
    limit = min(max(request.args.get("limit", 50, type=int), 1), 200)
    connection = db_connection()
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT type,amount,counterparty_account,balance_after,reference_id,created_at "
            "FROM transactions WHERE user_id=%s ORDER BY id DESC LIMIT %s",
            (user_id, limit),
        )
        rows = cursor.fetchall()
        for row in rows:
            row["amount"] = float(row["amount"])
            row["balance_after"] = float(row["balance_after"])
            row["created_at"] = row["created_at"].isoformat()
        return jsonify(success=True, transactions=rows)
    finally:
        connection.close()

