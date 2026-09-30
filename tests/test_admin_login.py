import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import bcrypt


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))
os.environ.setdefault("FEATURE", "admin")
os.environ.setdefault("ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("ADMIN_PASSWORD_HASH", "invalid")

from spx.runtime import app  # noqa: E402


class AdminLoginTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_malformed_bcrypt_hash_returns_json_service_unavailable(self):
        with patch.dict(os.environ, {"ADMIN_PASSWORD_HASH": "not-a-bcrypt-hash"}):
            response = self.client.post(
                "/api/admin/login",
                json={"email": "admin@example.com", "password": "irrelevant"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertTrue(response.is_json)
        self.assertEqual(response.json["message"], "Administrator login is temporarily unavailable")

    def test_valid_credentials_request_an_otp(self):
        password_hash = bcrypt.hashpw(b"Correct-Horse-123!", bcrypt.gensalt()).decode()
        with (
            patch.dict(os.environ, {"ADMIN_PASSWORD_HASH": password_hash}),
            patch("spx.features.admin.send_otp") as send_otp,
        ):
            response = self.client.post(
                "/api/admin/login",
                json={"email": "admin@example.com", "password": "Correct-Horse-123!"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["success"])
        self.assertTrue(response.json["otp_required"])
        send_otp.assert_called_once()

    def test_wrong_password_returns_json_unauthorized(self):
        password_hash = bcrypt.hashpw(b"Correct-Horse-123!", bcrypt.gensalt()).decode()
        with (
            patch.dict(os.environ, {"ADMIN_PASSWORD_HASH": password_hash}),
            patch("spx.features.admin.audit") as audit,
        ):
            response = self.client.post(
                "/api/admin/login",
                json={"email": "admin@example.com", "password": "wrong-password"},
            )

        self.assertEqual(response.status_code, 401)
        self.assertTrue(response.is_json)
        self.assertEqual(response.json["message"], "Invalid administrator credentials")
        audit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
