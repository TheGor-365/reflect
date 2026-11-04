#!/usr/bin/env python3
"""Restore a private Reflect Firestore JSONL archive ONLY to a local demo emulator.

Does not restore Auth identities, server timestamps or production data.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
from urllib.parse import quote

SOURCE_PROJECT = "reflect-8fdc8"
SOURCE_ROOT = f"artifacts/{SOURCE_PROJECT}"
SOURCE_PREFIX = f"projects/{SOURCE_PROJECT}/databases/(default)/documents/"
DEMO_PROJECT = "demo-reflect-restore"
EMULATOR_BASE = (
    "http://127.0.0.1:18080/v1/projects/"
    + DEMO_PROJECT + "/databases/%28default%29/documents/"
)
MAX_BYTES = 200 * 1024 * 1024


def private_file(path):
    if not path.is_absolute() or path.is_symlink() or not path.is_file():
        raise ValueError("Archive and manifest must be existing absolute regular files")
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise PermissionError("Private input file must not be group/world accessible")
    parent = path.parent
    if stat.S_IMODE(parent.stat().st_mode) & 0o077:
        raise PermissionError("Input directory must be private (chmod 700)")


def path_in_archive(record):
    if not isinstance(record, dict) or not isinstance(record.get("name"), str):
        raise ValueError("Malformed document record")
    name = record["name"]
    if not name.startswith(SOURCE_PREFIX):
        raise ValueError("Unexpected source project or database")
    relative = name[len(SOURCE_PREFIX):]
    parts = relative.split("/")
    if (len(parts) < 6 or len(parts) % 2 or parts[:3] !=
            ["artifacts", SOURCE_PROJECT, "users"] or any(not p for p in parts)):
        raise ValueError("Unexpected document path outside user-scoped archive")
    if not isinstance(record.get("fields", {}), dict):
        raise ValueError("Firestore fields must be a dictionary")
    return relative


def load_and_validate(archive_path):
    archive = Path(archive_path)
    manifest = archive.with_suffix(".manifest.json")
    private_file(archive)
    private_file(manifest)
    if archive.stat().st_size > MAX_BYTES or manifest.stat().st_size > 100_000:
        raise ValueError("Archive exceeds safety bounds")
    details = json.loads(manifest.read_text(encoding="utf-8"))
    if (details.get("format") != "reflect-firestore-rest-jsonl-v1"
            or details.get("project") != SOURCE_PROJECT
            or details.get("root") != SOURCE_ROOT
            or details.get("auth_accounts_included") is not False):
        raise ValueError("Unknown manifest/source format")

    payload = archive.read_bytes()
    if hashlib.sha256(payload).hexdigest() != details.get("sha256"):
        raise ValueError("SHA-256 verification failed; NO emulator writes were performed")
    docs = []
    paths = set()
    categories = {}
    for line in payload.splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        relative = path_in_archive(rec)
        if relative in paths:
            raise ValueError("Duplicate document path")
        paths.add(relative)
        docs.append((relative, rec))
        coll = relative.split("/")[-2]
        categories[coll] = categories.get(coll, 0) + 1
    if (not docs or len(docs) != details.get("documents")
            or categories != details.get("by_collection", {})):
        raise ValueError("Manifest/document count mismatch")
    return docs, details


def relocate_references(node):
    """Preserve Firestore types while remapping only in-project references."""
    if isinstance(node, list):
        return [relocate_references(v) for v in node]
    if isinstance(node, dict):
        mapped = {}
        for k, v in node.items():
            if (k == "referenceValue" and isinstance(v, str)
                    and v.startswith(SOURCE_PREFIX)):
                mapped[k] = (
                    f"projects/{DEMO_PROJECT}/databases/(default)/documents/"
                    + v[len(SOURCE_PREFIX):]
                )
            else:
                mapped[k] = relocate_references(v)
        return mapped
    return node


def url_for(relative):
    # Both project and URL are constant; only validated relative document paths vary.
    return EMULATOR_BASE + quote(relative, safe="/")


def response_ok(resp, expected):
    if resp.status_code != expected:
        raise RuntimeError(f"Local emulator HTTP {resp.status_code}, expected {expected}")
    return resp.json()


def restore_to_emulator(session, docs):
    session.trust_env = False  # never inherit proxy or ADC credentials
    # The Firestore Emulator enforces client Security Rules on unauthenticated
    # REST requests. "owner" is its LOCAL-ONLY admin token (not a cloud secret).
    # It must never be used against any host other than our fixed loopback demo.
    session.headers.update({"Authorization": "Bearer owner"})
    paths = [(url_for(relative), relocate_references(rec.get("fields", {})))
             for relative, rec in docs]
    probe = session.get(url_for("artifacts/reflect-8fdc8/users/__probe__"), timeout=6)
    if probe.status_code != 404:
        raise RuntimeError(
            f"Local emulator probe HTTP {probe.status_code}, expected 404. "
            "Verify localhost demo project, running emulator and admin auth; "
            "no restore writes made."
        )
    # All preconditions checked before any write. Never treat 403 as empty.
    for url, _ in paths:
        preflight = session.get(url, timeout=10)
        if preflight.status_code != 404:
            raise RuntimeError(
                f"Local emulator preflight HTTP {preflight.status_code}, "
                "expected 404 (missing document); no restore writes made. "
                "If 200, target is not empty; use a clean demo emulator."
            )
    for url, fields in paths:
        # A write is permitted only under a 127.0.0.1 demo project URL.
        response_ok(
            session.patch(url, params={"currentDocument.exists": "false"},
                          json={"fields": fields}, timeout=20),
            200
        )
    # Read back each restored document, compare typed fields and path.
    for url, fields in paths:
        got = response_ok(session.get(url, timeout=10), 200)
        if got.get("fields", {}) != fields:
            raise RuntimeError("Restored document fields differ; restore NOT verified")
        if got.get("name", "").split("/documents/", 1)[-1] != (
            url.split("/documents/", 1)[-1]
        ):
            raise RuntimeError("Restored path differs")
    return len(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--check-only", action="store_true",
                        help="Validate local archive without contacting any emulator")
    parser.add_argument("--restore", action="store_true",
                        help="Write ONLY to 127.0.0.1:18080 demo-reflect-restore emulator")
    args = parser.parse_args()
    if args.check_only == args.restore:
        parser.error("Choose exactly one: --check-only or --restore")
    if os.environ.get("HTTP_PROXY") or os.environ.get("HTTPS_PROXY"):
        # requests uses trust_env=False; this notice contains no secrets.
        pass
    docs, metadata = load_and_validate(args.archive)
    if args.check_only:
        print(json.dumps({"archive_valid": True, "documents": len(docs),
                          "sha256": "MATCH", "restore_verified": False}, indent=2))
        return
    import requests
    session = requests.Session()
    count = restore_to_emulator(session, docs)
    print(json.dumps({"target": DEMO_PROJECT, "emulator": "127.0.0.1:18080",
                      "restored_documents": count, "field_readback": "MATCH",
                      "firestore_restore_verified": True,
                      "auth_identity_restore_verified": False,
                      "note": "createTime/updateTime not preserved"}, indent=2))


if __name__ == "__main__":
    main()
