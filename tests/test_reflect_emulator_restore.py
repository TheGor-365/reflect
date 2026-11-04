"""Offline-only tests for isolated Firestore restoration (no credentials)."""
import hashlib
import json
from pathlib import Path
import stat
import tempfile
import unittest

from tools.backup.verify_emulator_restore import (
    DEMO_PROJECT, SOURCE_PREFIX, load_and_validate, path_in_archive,
    relocate_references, restore_to_emulator,
)

REL = "artifacts/reflect-8fdc8/users/U01/diaryNotes/D01"
SAMPLE = {
    "name": SOURCE_PREFIX + REL,
    "fields": {
        "name": {"stringValue": "synthetic"},
        "count": {"integerValue": "17"},
        "createdAt": {"timestampValue": "2025-07-08T12:00:01.123456789Z"},
        "parent": {"referenceValue": SOURCE_PREFIX + "artifacts/reflect-8fdc8/users/U01"},
        "nested": {"mapValue": {"fields": {"ok": {"booleanValue": True}}}},
    }
}


class FakeResponse:
    def __init__(self, status, body=None):
        self.status_code = status
        self.body = body or {}
    def json(self):
        return self.body


class FakeEmulatorSession:
    def __init__(self, seeded=False):
        self.storage = {REL: {"fields": {}}} if seeded else {}
        self.requests = []
        self.trust_env = True
        self.headers = {}

    def _key(self, url):
        marker = "/documents/"
        if marker not in url:
            raise AssertionError("Not emulator documents endpoint")
        if not url.startswith("http://127.0.0.1:18080/v1/projects/demo-reflect-restore/"):
            raise AssertionError("Unexpected destination host/project")
        return url.split(marker, 1)[-1]

    def get(self, url, timeout):
        self.requests.append(("GET", url))
        if self.headers.get("Authorization") != "Bearer owner":
            return FakeResponse(403)
        relative = self._key(url)
        # Mirror Firestore's reserved __.*__ document-ID rejection.
        if any(part.startswith("__") and part.endswith("__")
               for part in relative.split("/")):
            return FakeResponse(400)
        return (FakeResponse(200, {"name": "projects/" + DEMO_PROJECT +
                             "/databases/(default)/documents/" + relative,
                             **self.storage[relative]}) if relative in self.storage
                else FakeResponse(404))

    def patch(self, url, params, json, timeout):
        self.requests.append(("PATCH", url))
        if self.headers.get("Authorization") != "Bearer owner":
            return FakeResponse(403)
        if params != {"currentDocument.exists": "false"}:
            raise AssertionError("Missing no-overwrite precondition")
        relative = self._key(url)
        if relative in self.storage:
            return FakeResponse(412)
        self.storage[relative] = json
        return FakeResponse(200, {"name": "local", **json})


class RestoreOfflineTests(unittest.TestCase):
    def test_reference_relocation_preserves_other_values(self):
        replaced = relocate_references(SAMPLE["fields"])
        self.assertIn("demo-reflect-restore", replaced["parent"]["referenceValue"])
        self.assertEqual(replaced["createdAt"], SAMPLE["fields"]["createdAt"])
        self.assertEqual(replaced["count"], SAMPLE["fields"]["count"])

    def test_restores_only_into_local_demo_and_verifies_readback(self):
        session = FakeEmulatorSession()
        self.assertEqual(restore_to_emulator(session, [(REL, SAMPLE)]), 1)
        self.assertFalse(session.trust_env)
        self.assertEqual(session.headers.get("Authorization"), "Bearer owner")
        self.assertEqual(len(session.storage), 1)
        self.assertFalse(any("__probe__" in url for _, url in session.requests))
        self.assertEqual(session.requests[-1][0], "GET")
        self.assertEqual(len([x for x in session.requests if x[0] == "PATCH"]), 1)

    def test_preflight_rejects_existing_document_without_write(self):
        session = FakeEmulatorSession(seeded=True)
        with self.assertRaises(RuntimeError):
            restore_to_emulator(session, [(REL, SAMPLE)])
        self.assertFalse(any(op == "PATCH" for op, _ in session.requests))

    def test_preflight_400_stops_before_any_write(self):
        class BadRequestSession(FakeEmulatorSession):
            def get(self, url, timeout):
                self.requests.append(("GET", url))
                return FakeResponse(400)
        session = BadRequestSession()
        with self.assertRaisesRegex(RuntimeError, "preflight HTTP 400"):
            restore_to_emulator(session, [(REL, SAMPLE)])
        self.assertEqual(session.headers.get("Authorization"), "Bearer owner")
        self.assertFalse(any(op == "PATCH" for op, _ in session.requests))

    def test_preflight_403_stops_before_any_write(self):
        class DeniedSession(FakeEmulatorSession):
            def get(self, url, timeout):
                self.requests.append(("GET", url))
                return FakeResponse(403)
        session = DeniedSession()
        with self.assertRaisesRegex(RuntimeError, "preflight HTTP 403"):
            restore_to_emulator(session, [(REL, SAMPLE)])
        self.assertFalse(any(op == "PATCH" for op, _ in session.requests))

    def test_rejects_cross_project_and_bad_path(self):
        with self.assertRaises(ValueError):
            path_in_archive({"name": SAMPLE["name"].replace("reflect-8fdc8", "elsewhere")})
        with self.assertRaises(ValueError):
            path_in_archive({"name": SOURCE_PREFIX + "other/collection"})

    def _save(self, tmp, corrupt=False):
        folder = Path(tmp) / "private"
        folder.mkdir(mode=0o700)
        output = folder / "safe.jsonl"
        raw = (json.dumps(SAMPLE) + "\n").encode()
        output.write_bytes(raw if not corrupt else raw + b"x")
        output.chmod(0o600)
        details = {
            "format": "reflect-firestore-rest-jsonl-v1",
            "project": "reflect-8fdc8", "root": "artifacts/reflect-8fdc8",
            "auth_accounts_included": False,
            "documents": 1, "by_collection": {"diaryNotes": 1},
            "sha256": hashlib.sha256(raw).hexdigest()
        }
        manifest = folder / "safe.manifest.json"
        manifest.write_text(json.dumps(details))
        manifest.chmod(0o600)
        return output

    def test_manifest_checked_before_any_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._save(tmp)
            docs, manifest = load_and_validate(archive)
            self.assertEqual(len(docs), 1)
            self.assertEqual(manifest["documents"], 1)

    def test_checksum_tampering_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._save(tmp, corrupt=True)
            with self.assertRaises(ValueError):
                load_and_validate(archive)

    def test_rejects_world_readable_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = self._save(tmp)
            archive.chmod(0o644)
            with self.assertRaises(PermissionError):
                load_and_validate(archive)


if __name__ == "__main__":
    unittest.main()
