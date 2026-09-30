#!/usr/bin/env bash
set -euo pipefail

namespace="${SPX_NAMESPACE:-spx-banking}"
deployment="${SPX_ADMIN_DEPLOYMENT:-spx-admin}"
secret_name="${SPX_SECRET_NAME:-spx-secrets}"

for command in kubectl python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is not available: $command" >&2
    exit 1
  fi
done

kubectl get namespace "$namespace" >/dev/null
kubectl get deployment "$deployment" -n "$namespace" >/dev/null
kubectl get secret "$secret_name" -n "$namespace" >/dev/null

read -r -p "Administrator email: " admin_email
read -r -s -p "New administrator password: " admin_password
echo
read -r -s -p "Confirm administrator password: " admin_password_confirm
echo

if [[ -z "$admin_email" || "$admin_email" != *@* ]]; then
  echo "A valid administrator email is required." >&2
  exit 1
fi

if [[ ${#admin_password} -lt 12 ]]; then
  echo "The administrator password must contain at least 12 characters." >&2
  exit 1
fi

if [[ "$admin_password" != "$admin_password_confirm" ]]; then
  echo "The passwords do not match." >&2
  exit 1
fi

admin_password_hash="$(printf '%s' "$admin_password" | kubectl exec -i -n "$namespace" deployment/"$deployment" -- python -c \
  'import bcrypt,sys; print(bcrypt.hashpw(sys.stdin.buffer.read(), bcrypt.gensalt(rounds=12)).decode("utf-8"))')"

unset admin_password admin_password_confirm

if [[ ${#admin_password_hash} -ne 60 || ! "$admin_password_hash" =~ ^\$2[aby]\$ ]]; then
  echo "Generated administrator password hash failed validation." >&2
  exit 1
fi

kubectl patch secret "$secret_name" -n "$namespace" --type merge \
  -p "$(ADMIN_EMAIL_INPUT="$admin_email" ADMIN_HASH_INPUT="$admin_password_hash" python3 - <<'PY'
import base64
import json
import os

encode = lambda value: base64.b64encode(value.encode("utf-8")).decode("ascii")
print(json.dumps({"data": {
    "admin-email": encode(os.environ["ADMIN_EMAIL_INPUT"]),
    "admin-password-hash": encode(os.environ["ADMIN_HASH_INPUT"]),
}}))
PY
)"

unset admin_password_hash

kubectl rollout restart deployment/"$deployment" -n "$namespace"
kubectl rollout status deployment/"$deployment" -n "$namespace" --timeout=5m

kubectl exec -n "$namespace" deployment/"$deployment" -- python -c \
  'import os; value=os.environ["ADMIN_PASSWORD_HASH"]; assert len(value)==60 and value[:4] in {"$2a$","$2b$","$2y$"}; print("Administrator bcrypt configuration is valid.")'

echo "Administrator login repair completed successfully."
