# Reflect Firestore read-only inventory & private archive

**Status:** utility drafted and tested with mocked Firestore HTTP responses only. Production backup **not performed**, restoration **not tested**. No write/delete requests are included. Use on the owner's trusted Linux computer, never in a public CI job.

## Why this tool
Firebase project `reflect-8fdc8` is on Spark. The Google-managed export and backup services require billing/Blaze; this tool uses ordinary authorized Firestore read APIs instead. It is not a point-in-time consistent or provider-managed backup and it does **not** export Firebase Auth identities, rules, indexes or Hosting deployments.

The existing Firestore data tree has non-existent ancestor documents under `artifacts/reflect-8fdc8/users/{uid}` with real nested data. The utility uses `listDocuments?showMissing=true` and `listCollectionIds` to walk even those ancestors; ordinary collection queries can miss them. REST `fields` preserve timestamp nanoseconds, references, nested values, and other Firestore Value variants without heuristic conversions.

## Preconditions (owner action)
- Work from a trusted Linux machine. Do not clear existing browser storage or sign out of the app.
- Install and authenticate Google Cloud CLI using `gcloud auth application-default login` in your own browser; **never** copy token files, account JSON, or credentials to a chat.
- Use an account with sufficient **read-only IAM access** to this Firestore database. Firestore Security Rules do not authorize server/admin IAM reads. Do not grant broad roles automatically just for this step.
- Python 3.10+ and the `google-auth` and `requests` libraries must be available.
- Avoid active edits while exporting. This iterative read export is not an atomic database snapshot.

## Commands
```bash
python3 --version
gcloud --version
# Complete local Google login only if/when required by this procedure:
gcloud auth application-default login

python3 -m venv .venv
. .venv/bin/activate
python -m pip install google-auth requests
python tools/backup/reflect_firestore_backup.py --project reflect-8fdc8 --inventory-only

mkdir -p "$HOME/.local/share/reflect-private"
chmod 700 "$HOME/.local/share/reflect-private"
python tools/backup/reflect_firestore_backup.py --project reflect-8fdc8 \
  --output "$HOME/.local/share/reflect-private/reflect-firestore-2026-11-04.jsonl"
sha256sum "$HOME/.local/share/reflect-private/reflect-firestore-2026-11-04.jsonl"
```

Compare SHA-256 against the adjacent `.manifest.json`. **Only share non-identifying counts and the hash**, never the JSONL, parent path with personal identifiers, Auth UID, diary text, or credentials. The archive may contain sensitive material; use encrypted local backup storage, not the public/AI-indexed Drive portfolio folder.

## Validation and limitations
- Offline tests: `python -m unittest discover -s tests -p 'test_reflect_firestore_backup.py' -v`. They use a fake session and no Firestore credentials.
- If HTTP 401/403 occurs, stop and inspect IAM/ADC; do not bypass Firestore rules or grant owner permissions without review.
- If output is empty, truncated, or file/manifest checksums differ, it is **not** a verified backup.
- REST read access and the Spark free quota must be checked. Ordinary document reads can count against quotas even if no managed export is used.
- A restore implementation and test must be designed for a **separate Firebase project or local Firestore Emulator** before declaring stage 00 complete; do not restore to production.
- Auth user identity metadata, Security Rules, index definitions and hosting release records must be captured by separate safe steps. A Firestore archive alone cannot restore account access.
- Built-in guardrails: fixed project/root, only GET and read-only listCollectionIds POST, max 20,000 documents / 25,000 traversed paths, fail-closed non-private output directory, private file mode, SHA-256, no existing-file overwrite.
- No secrets printed, stored in repo or supplied to this tool by chat.

## Sources
- https://firebase.google.com/docs/firestore/manage-data/export-import
- https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/listDocuments
- https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/listCollectionIds
- https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment
