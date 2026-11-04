"""Offline, synthetic tests: never open a live account or connect to Firebase."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from tools.backup.check_identity_links import analyze, load_auth_uids


class IdentityLinkTests(unittest.TestCase):
    def test_aggregate_counts_hide_uid_values(self):
        scope1 = "U_PRIVATE_ONE"
        scope2 = "U_PRIVATE_TWO"
        scope3 = "U_PRIVATE_THREE"
        docs = [
            (f"artifacts/reflect-8fdc8/users/{scope1}/profiles/userProfile", {}),
            (f"artifacts/reflect-8fdc8/users/{scope1}/diaryNotes/N1", {}),
            (f"artifacts/reflect-8fdc8/users/{scope2}/goals/G1", {}),
        ]
        result = analyze(docs, {scope1, scope3}, {"sha256": "synthetic"})
        self.assertEqual(result["firestore_document_count"], 3)
        self.assertEqual(result["firestore_user_scopes"], 2)
        self.assertEqual(result["auth_account_count"], 2)
        self.assertEqual(result["matched_uid_scopes"], 1)
        self.assertEqual(result["firestore_scopes_without_exported_auth"], 1)
        self.assertEqual(result["auth_accounts_without_exported_firestore"], 1)
        self.assertFalse(result["all_firestore_scopes_have_auth_records"])
        self.assertEqual(result["collection_counts"], {"diaryNotes": 1, "goals": 1, "profiles": 1})
        rendered = json.dumps(result)
        for private_uid in (scope1, scope2, scope3):
            self.assertNotIn(private_uid, rendered)

    def test_full_uid_match_does_not_prove_browser_access(self):
        docs = [("artifacts/reflect-8fdc8/users/ANON_1/moods/M1", {})]
        result = analyze(docs, {"ANON_1"}, {"sha256": "synthetic"})
        self.assertTrue(result["all_firestore_scopes_have_auth_records"])
        self.assertEqual(result["matched_uid_scopes"], 1)
        self.assertFalse(result["auth_browser_sessions_restored"])

    def test_rejects_unexpected_document_scope(self):
        with self.assertRaises(ValueError):
            analyze([("other/data/N1", {})], {"X"}, {"sha256": "synthetic"})

    def test_reads_auth_export_privately_with_no_uid_output(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp) / "private"
            directory.mkdir(mode=0o700)
            directory.chmod(0o700)
            path = directory / "auth.json"
            source = {"users": [{"localId": "ANON_A"}, {"localId": "ANON_B"}]}
            raw = json.dumps(source).encode("utf-8")
            path.write_bytes(raw)
            path.chmod(0o600)
            user_ids, digest = load_auth_uids(path)
            self.assertEqual(user_ids, {"ANON_A", "ANON_B"})
            self.assertEqual(digest, hashlib.sha256(raw).hexdigest())

    def test_rejects_duplicate_auth_uids(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            root.chmod(0o700)
            path = root / "auth.json"
            path.write_text(json.dumps({"users": [{"localId": "X"}, {"localId": "X"}]}))
            path.chmod(0o600)
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                load_auth_uids(path)

    def test_rejects_insecure_auth_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            root.chmod(0o700)
            path = root / "auth.json"
            path.write_text(json.dumps({"users": [{"localId": "X"}]}))
            path.chmod(0o644)
            with self.assertRaises(PermissionError):
                load_auth_uids(path)


if __name__ == "__main__":
    unittest.main()
