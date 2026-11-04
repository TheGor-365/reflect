#!/usr/bin/env python3
"""Synthetic-only integration smoke for a real local Firestore Emulator.

No Firebase credentials or user records. Run ONLY through the demo emulator
configuration in CI; never executes a cloud Firestore operation.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

# Run as a direct script from tools/backup/emulator (Firebase project cwd).
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from tools.backup.verify_emulator_restore import (  # noqa: E402
    DEMO_PROJECT, SOURCE_PREFIX, load_and_validate, restore_to_emulator, url_for
)

import requests


def main():
    # Fail closed unless this test is launched by the real demo emulator.
    if os.environ.get("FIRESTORE_EMULATOR_HOST") != "127.0.0.1:18080":
        raise RuntimeError("Expected only localhost Firestore Emulator on 127.0.0.1:18080")
    doc = {
        "name": SOURCE_PREFIX + "artifacts/reflect-8fdc8/users/FAKE_01/diaryNotes/FAKE_NOTE",
        "fields": {
            "title": {"stringValue": "synthetic smoke test, no real users"},
            "intensity": {"integerValue": "2"},
            "createdAt": {"timestampValue": "2026-11-04T00:00:00.123456789Z"},
            "nested": {"mapValue": {"fields": {"ok": {"booleanValue": True}}}}
        }
    }
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        root.chmod(0o700)
        file = root / "synthetic.jsonl"
        raw = (json.dumps(doc) + "\n").encode("utf-8")
        file.write_bytes(raw)
        file.chmod(0o600)
        manifest = {
            "format": "reflect-firestore-rest-jsonl-v1",
            "project": "reflect-8fdc8",
            "root": "artifacts/reflect-8fdc8",
            "auth_accounts_included": False,
            "documents": 1,
            "by_collection": {"diaryNotes": 1},
            "sha256": hashlib.sha256(raw).hexdigest()
        }
        mf = file.with_suffix(".manifest.json")
        mf.write_text(json.dumps(manifest), encoding="utf-8")
        mf.chmod(0o600)
        docs, _ = load_and_validate(file)
        session = requests.Session()
        try:
            restored = restore_to_emulator(session, docs)
        except RuntimeError:
            # This fixture contains ONLY synthetic values; NEVER emit fields
            # of any real user archive when debugging restore discrepancies.
            resp = session.get(url_for("artifacts/reflect-8fdc8/users/FAKE_01/diaryNotes/FAKE_NOTE"), timeout=10)
            if resp.status_code == 200:
                print("SYNTHETIC_EXPECTED_FIELDS=" + json.dumps(doc["fields"], sort_keys=True))
                print("SYNTHETIC_READBACK_FIELDS=" + json.dumps(resp.json().get("fields", {}), sort_keys=True))
            raise
        if restored != 1:
            raise AssertionError("Expected one synthetic document restored")
        try:
            restore_to_emulator(session, docs)
            raise AssertionError("Second restore unexpectedly overwrote a document")
        except RuntimeError as exc:
            if "preflight HTTP 200" not in str(exc):
                raise
        print("PASS: synthetic real-emulator restore + typed readback + no-overwrite preflight")


if __name__ == "__main__":
    main()
