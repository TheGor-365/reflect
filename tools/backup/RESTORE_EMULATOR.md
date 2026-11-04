# Restore Reflect Firestore into an isolated local emulator

Status: **NOT YET EXECUTED against owner's real archive**. The code has offline unit tests. It does not deploy, import Auth identities, create a production Firebase project, or touch cloud resources.

## Recorded production export (owner console, 2026-11-04)
Firestore JSONL: 26 documents, SHA-256 verified, unique paths verified. Firebase Auth JSON: 11 anonymous accounts exported separately. The archive is private and must **not** be uploaded to GitHub, CI logs, shared Drive, or chat.

## Why a `demo-` project?
Firebase documents recommend a demo project ID because it has no production resources. This tool has a fixed localhost address `127.0.0.1:18080` and a distinct target project `demo-reflect-restore`. The actual archive's source document paths preserve `artifacts/reflect-8fdc8/users/...`; **the destination GCP/Firebase project is always a local demo**. REST writes use an `exists=false` precondition and never connect to a cloud endpoint. HTTP proxy environment is disabled for the restoration session.

## Before running
- Do not run `firebase init`, `firebase deploy` or `gcloud projects create` for this restore.
- Use a trusted local Linux computer. Do not clear browser site storage; preserve anonymous session continuity.
- Verify Java 21 or later (`java -version`). Firestore emulator is moving to Java 21; use `sudo apt install openjdk-21-jdk` only if Java 21+ is unavailable. Do not change default Node for this backup step.
- Keep archive at `$HOME/reflect-backup-work/private/reflect-firestore-2026-11-04.jsonl`, with private directory mode 700 and archive/manifest mode 600.
- The restore is local, but it contains personal diary data; don't expose emulator ports to the LAN. Config binds to 127.0.0.1 only.
- Emulators are ephemeral. If an attempt fails partway, stop the emulator, restart it with a clean in-memory dataset, and retry **only after examining the failure**.

## Commands — first terminal (emulator)
```bash
cd "$HOME/reflect-backup-work/backup-tools"
git pull --ff-only
python -m unittest discover -s tests -p 'test_reflect_*.py' -v
cd tools/backup/emulator
firebase emulators:start --project demo-reflect-restore --only firestore
```
The emulator listens on `127.0.0.1:18080`. The optional UI listens on `127.0.0.1:14000`.

## Emulator REST authorization
The Firestore emulator enforces Firestore Security Rules for requests without authentication. The restoration tool now sends the emulator-only `Authorization: Bearer owner` header to its **fixed** `http://127.0.0.1:18080/v1/projects/demo-reflect-restore/...` endpoint. This is a local admin marker, **not** a cloud credential or production API key. It bypasses rules **only** inside the isolated emulator for restoration; run a separate client-SDK rules test later.

Earlier versions first made a separate GET to a fake document with ID `__probe__`. Firestore reserves IDs matching `__.*__`, and the owner's real emulator responded with HTTP **400**. That was a bug in the test utility, **not evidence of corrupt data**. The unnecessary probe is now removed: each actual archive document path is checked with an authenticated GET, and every path must return HTTP **404** before the first write. HTTP 400/403/200 aborts without any writes. Never clear or overwrite automatically. Reference: https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields

After updating the branch, the **emulator already running in the first terminal can remain running**; only the Python script needs to be refreshed. Do not restart the emulator after a partial write without reviewing the state first.

## Commands — second terminal (restore, only AFTER emulator is ready)
```bash
cd "$HOME/reflect-backup-work/backup-tools"
source .venv/bin/activate
ARCHIVE="$HOME/reflect-backup-work/private/reflect-firestore-2026-11-04.jsonl"
python tools/backup/verify_emulator_restore.py --archive "$ARCHIVE" --check-only
python tools/backup/verify_emulator_restore.py --archive "$ARCHIVE" --restore
```
Only post the count and the `field_readback` / `firestore_restore_verified` booleans back to the assistant, never any data, UID or secret. Expected Firestore count: **26**.

## What this verifies (and doesn't)
- Verifies SHA-256, count, per-collection totals, uniqueness, source project and permitted Firestore subtree **before** any local write.
- Restores typed `fields` into the *local* demo emulator with the same relative document paths (including nested collections whose ancestor documents do not exist), remapping in-project Firestore reference types to the demo project.
- Uses read-back of all paths to verify typed fields. `createTime` and `updateTime` are server-owned metadata and WILL NOT match the original production timestamps. If the application depends on those metadata timestamps, additional migration logic must be designed.
- Does **not** verify account login, Auth user import, browser persistence, data-loss prevention under concurrent Firestore writes, Security Rules behavior for client SDKs or production deployment.
- The exported Auth JSON remains private. Account-UID mapping/upgrade must be validated in a separate step; restoring Firestore data alone does not make anonymous users log in again.
- Do not run a second restore on a populated emulator; preflight will reject existing documents.
- The tool intentionally does not support any adjustable network target or project ID.
- Any checksum/readback mismatch means the restore is not verified and stage 00 remains open.

## Reference documentation
- https://firebase.google.com/docs/emulator-suite/install_and_configure
- https://firebase.google.com/docs/emulator-suite/connect_firestore
- https://firebase.google.com/docs/emulator-suite/connect_auth
- https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/patch

## Real-emulator regression QA (2026-11-04)
- A reserved test document ID `__probe__` caused HTTP 400 even when the local emulator was empty; this unnecessary probe was removed. Firestore reserves IDs matching `__.*__`.
- A synthetic real-emulator test then identified timestamp normalization: `2026-11-04T00:00:00.123456789Z` was stored as `2026-11-04T00:00:00.123456Z` (loss of nonzero nanoseconds). The verifier now accepts only equivalent fractional-second formatting (e.g. `.123456000Z` vs `.123456Z`), never nonzero precision loss.
- Real Firestore Emulator integration on synthetic data passed, including typed-field readback and rejection of a second overwrite attempt: https://github.com/TheGor-365/reflect/actions/runs/41819830841 . This does NOT prove the owner's private 26-document archive has been restored.
- The owner should pull the branch, run offline tests and perform a single local restore against the running demo emulator. On partial restore, stop; do not automatically delete/retry.
