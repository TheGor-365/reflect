#!/usr/bin/env python3
"""Read-only Firestore subtree archive. Not a managed backup or Auth export.

Requires local Google Application Default Credentials. No API keys, service
account private keys or user data should be committed to Git.
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import stat
import tempfile
from urllib.parse import quote

PROJECT = "reflect-8fdc8"
ROOT = f"artifacts/{PROJECT}"
PREFIX = f"projects/{PROJECT}/databases/(default)/documents/"
API = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/%28default%29/documents"
MAX_DOCS = 20000
MAX_PATHS = 25000
PAGE_SIZE = 300


def url(path):
    return API + "/" + quote(path, safe="/")


def checked(response):
    # Avoid printing response bodies: provider errors may include identifiers.
    if response.status_code >= 400:
        raise RuntimeError(f"Firestore HTTP {response.status_code}; check ADC and IAM")
    return response.json()


def document(session, path):
    response = session.get(url(path), timeout=40)
    return None if response.status_code == 404 else checked(response)


def collection_ids(session, path):
    token = None
    while True:
        body = {"pageSize": PAGE_SIZE}
        if token:
            body["pageToken"] = token
        result = checked(session.post(url(path) + ":listCollectionIds", json=body, timeout=40))
        yield from result.get("collectionIds", [])
        token = result.get("nextPageToken")
        if not token:
            return


def documents(session, parent, collection_id):
    token = None
    while True:
        # Crucial: users/{uid} may be missing while subcollections exist.
        query = {"pageSize": str(PAGE_SIZE), "showMissing": "true"}
        if token:
            query["pageToken"] = token
        result = checked(session.get(url(parent + "/" + collection_id), params=query, timeout=40))
        yield from result.get("documents", [])
        token = result.get("nextPageToken")
        if not token:
            return


def relative_path(name):
    if not name.startswith(PREFIX):
        raise RuntimeError("Unexpected project/database in Firestore response")
    path = name[len(PREFIX):]
    if path != ROOT and not path.startswith(ROOT + "/"):
        raise RuntimeError("Unexpected document outside Reflect subtree")
    if len(path.split("/")) % 2:
        raise RuntimeError("Invalid Firestore document path")
    return path


def is_existing(snapshot):
    return snapshot is not None and any(k in snapshot for k in ("fields", "createTime", "updateTime"))


def collect(session, emit, max_docs=MAX_DOCS, max_paths=MAX_PATHS):
    counts = {"documents": 0, "missing_ancestors": 0, "paths_checked": 0, "by_collection": {}}
    def visit(path, snapshot):
        counts["paths_checked"] += 1
        if counts["paths_checked"] > max_paths:
            raise RuntimeError("Safety limit: too many paths")
        if is_existing(snapshot):
            if counts["documents"] >= max_docs:
                raise RuntimeError("Safety limit: too many documents")
            if relative_path(snapshot["name"]) != path:
                raise RuntimeError("Document path mismatch")
            emit(snapshot)  # REST fields preserve Firestore types and timestamp precision.
            counts["documents"] += 1
            category = path.split("/")[-2]
            counts["by_collection"][category] = counts["by_collection"].get(category, 0) + 1
        else:
            counts["missing_ancestors"] += 1
        for collection_id in collection_ids(session, path):
            if not collection_id or "/" in collection_id:
                raise RuntimeError("Invalid collection id")
            for child in documents(session, path, collection_id):
                child_path = relative_path(child["name"])
                if (not child_path.startswith(path + "/" + collection_id + "/")
                        or child_path.count("/") != path.count("/") + 2):
                    raise RuntimeError("Unexpected child path")
                visit(child_path, child)
    visit(ROOT, document(session, ROOT))
    return counts


def private_destination(path):
    if not path.is_absolute() or path.suffix != ".jsonl":
        raise ValueError("Use an absolute .jsonl filename")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if stat.S_IMODE(path.parent.stat().st_mode) & 0o077:
        raise PermissionError("Destination directory must be private: chmod 700")
    if path.exists() or path.is_symlink() or path.with_suffix(".manifest.json").exists():
        raise FileExistsError("Never overwrite an existing archive or manifest")


def archive(session, output):
    private_destination(output)
    digest = hashlib.sha256()
    temp = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", dir=output.parent,
                                         prefix=".reflect-", suffix=".tmp", delete=False) as stream:
            temp = stream.name
            os.chmod(temp, 0o600)
            def emit(doc):
                chunk = (json.dumps(doc, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
                         + "\n").encode("utf-8")
                stream.write(chunk)
                digest.update(chunk)
            counts = collect(session, emit)
            if counts["documents"] == 0:
                raise RuntimeError("Empty result: do not accept as a backup")
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temp, output)  # fails if the target already exists
        os.unlink(temp)
        temp = None
        manifest = {
            "format": "reflect-firestore-rest-jsonl-v1",
            "project": PROJECT, "root": ROOT,
            "exported_at_utc": datetime.now(timezone.utc).isoformat(),
            **counts,
            "sha256": digest.hexdigest(),
            "auth_accounts_included": False,
            "restore_verified": False,
            "consistent_snapshot_guaranteed": False
        }
        fd = os.open(output.with_suffix(".manifest.json"),
                     os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(manifest, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        return manifest
    finally:
        if temp and os.path.exists(temp):
            os.unlink(temp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--inventory-only", action="store_true")
    selection.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.project != PROJECT:
        parser.error("Only audited project reflect-8fdc8 is allowed")
    if os.environ.get("FIRESTORE_EMULATOR_HOST"):
        parser.error("Emulator target set: refusing to mislabel it as production")
    os.umask(0o077)
    import google.auth
    from google.auth.transport.requests import AuthorizedSession
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/datastore"])
    session = AuthorizedSession(credentials)
    if args.inventory_only:
        print(json.dumps(collect(session, lambda doc: None), indent=2))
    else:
        result = archive(session, args.output)
        print(json.dumps({"documents": result["documents"], "sha256": result["sha256"],
                          "restore_verified": False}, indent=2))


if __name__ == "__main__":
    main()
