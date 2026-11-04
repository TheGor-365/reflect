#!/usr/bin/env python3
"""Privately reconcile Firestore user scopes with Firebase Authentication export.

No cloud/API calls. Prints aggregate counts only; NEVER prints account UIDs,
profile fields, journal entries, tokens, or exported record contents.
"""
import argparse
import hashlib
import json
from pathlib import Path

from tools.backup.verify_emulator_restore import load_and_validate, private_file

MAX_AUTH_BYTES = 32 * 1024 * 1024


def load_auth_uids(path):
    path = Path(path)
    private_file(path)
    if path.stat().st_size > MAX_AUTH_BYTES:
        raise ValueError("Auth export exceeds safety limit")
    raw = path.read_bytes()
    payload = json.loads(raw)
    if isinstance(payload, dict):
        users = payload.get("users")
    elif isinstance(payload, list):
        users = payload
    else:
        users = None
    if not isinstance(users, list) or not users:
        raise ValueError("Unsupported or empty Firebase Auth export")
    ids = []
    for user in users:
        if not isinstance(user, dict):
            raise ValueError("Invalid Auth export record")
        uid = user.get("localId")
        if not isinstance(uid, str) or not uid or "/" in uid:
            raise ValueError("Missing or malformed Auth localId")
        ids.append(uid)
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate Auth localId; cannot trust account count")
    return set(ids), hashlib.sha256(raw).hexdigest()


def analyze(docs, auth_uids, archive_manifest):
    scopes = set()
    collection_counts = {}
    for relative, _doc in docs:
        parts = relative.split("/")
        if len(parts) < 6 or parts[:3] != ["artifacts", "reflect-8fdc8", "users"]:
            raise ValueError("Unexpected Firestore document path")
        scopes.add(parts[3])
        collection_counts[parts[-2]] = collection_counts.get(parts[-2], 0) + 1
    matched = scopes & auth_uids
    missing_auth = scopes - auth_uids
    auth_without_data = auth_uids - scopes
    return {
        "firestore_document_count": len(docs),
        "firestore_user_scopes": len(scopes),
        "auth_account_count": len(auth_uids),
        "matched_uid_scopes": len(matched),
        "firestore_scopes_without_exported_auth": len(missing_auth),
        "auth_accounts_without_exported_firestore": len(auth_without_data),
        "collection_counts": dict(sorted(collection_counts.items())),
        "firestore_sha256": archive_manifest["sha256"],
        "all_firestore_scopes_have_auth_records": not missing_auth,
        "auth_browser_sessions_restored": False,
        "production_changed": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--firestore", type=Path, required=True)
    parser.add_argument("--auth", type=Path, required=True)
    args = parser.parse_args()
    firestore_docs, firestore_manifest = load_and_validate(args.firestore)
    auth_uids, auth_hash = load_auth_uids(args.auth)
    result = analyze(firestore_docs, auth_uids, firestore_manifest)
    result["auth_sha256"] = auth_hash
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
