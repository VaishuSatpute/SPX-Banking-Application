import importlib
import os

from flask import Flask, jsonify

FEATURES = {
    "auth", "registration", "payments", "statements", "admin",
    "accounts", "loans", "cards", "investments", "insurance", "services",
}
feature = os.getenv("FEATURE", "").lower()
if feature not in FEATURES:
    raise RuntimeError(f"FEATURE must be one of {sorted(FEATURES)}")

app = Flask(f"spx-{feature}")
module = importlib.import_module(f"spx.features.{feature}")
app.register_blueprint(module.blueprint)


@app.get("/healthz")
def healthz():
    return jsonify(status="ok", feature=feature)

