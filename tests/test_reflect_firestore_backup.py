"""Offline tests. No Firebase credentials, networking or production writes."""
import hashlib
import json
from pathlib import Path
import stat
import tempfile
import unittest

from tools.backup.reflect_firestore_backup import collect, archive, relative_path

ROOT = "artifacts/reflect-8fdc8"
PREFIX = "projects/reflect-8fdc8/databases/(default)/documents/"

class Response:
    def __init__(self, data, status=200):
        self.data, self.status_code = data, status
    def json(self):
        return self.data

class Session:
    def __init__(self):
        self.calls = []
    def get(self, url, params=None, timeout=40):
        self.calls.append(("GET", url, params))
        if params is None:
            return Response({}, 404)
        if url.endswith("/users"):
            return Response({"documents": [{"name": PREFIX + ROOT + "/users/U1"}]})
        if url.endswith("/diaryNotes"):
            return Response({"documents": [{"name": PREFIX + ROOT + "/users/U1/diaryNotes/D1",
                        "fields": {"title": {"stringValue": "private"}},
                        "createTime": "2025-07-08T01:00:00.123456789Z"}]})
        return Response({"documents": []})
    def post(self, url, json=None, timeout=40):
        self.calls.append(("POST", url, json))
        if url.endswith("artifacts/reflect-8fdc8:listCollectionIds"):
            return Response({"collectionIds": ["users"]})
        if url.endswith("/users/U1:listCollectionIds"):
            return Response({"collectionIds": ["diaryNotes"]})
        return Response({"collectionIds": []})

class ReadOnlyBackupTests(unittest.TestCase):
    def setUp(self):
        self.session = Session()
    def test_missing_ancestor_is_traversed(self):
        data = []
        counts = collect(self.session, data.append)
        self.assertEqual(counts["documents"], 1)
        self.assertEqual(counts["missing_ancestors"], 2)
        self.assertEqual(counts["by_collection"], {"diaryNotes": 1})
        self.assertTrue(any(call[2] and call[2].get("showMissing") == "true"
                            for call in self.session.calls if call[0] == "GET"))
    def test_archive_is_private_verbatim_and_hashed(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "private"
            folder.mkdir(mode=0o700)
            output = folder / "backup.jsonl"
            manifest = archive(self.session, output)
            self.assertEqual(manifest["documents"], 1)
            self.assertFalse(manifest["auth_accounts_included"])
            self.assertFalse(manifest["restore_verified"])
            self.assertEqual(manifest["sha256"], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertIn("2025-07-08T01:00:00.123456789Z", output.read_text())
            self.assertEqual(stat.S_IMODE(output.stat().st_mode), 0o600)
            self.assertTrue(output.with_suffix(".manifest.json").exists())
            with self.assertRaises(FileExistsError):
                archive(self.session, output)
    def test_does_not_send_mutating_requests(self):
        collect(self.session, lambda record: None)
        self.assertTrue(all(method == "GET" or url.endswith(":listCollectionIds")
                            for method,url,_ in self.session.calls))
    def test_rejects_wrong_project(self):
        with self.assertRaises(RuntimeError):
            relative_path("projects/other/databases/(default)/documents/" + ROOT)
    def test_limit_fails_closed(self):
        with self.assertRaises(RuntimeError):
            collect(self.session, lambda record: None, max_docs=0)
    def test_rejects_nonprivate_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "public"
            folder.mkdir(mode=0o755)
            folder.chmod(0o755)  # explicit: umask 077 otherwise masks the requested 755
            with self.assertRaises(PermissionError):
                archive(self.session, folder / "backup.jsonl")

if __name__ == "__main__":
    unittest.main()
