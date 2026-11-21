# Reflect 2.0 — PG-04C isolated Firestore Emulator gate
Date: 2026-11-22. **PATCH_PREPARED / USER REAL EMULATOR QA PENDING / NOT DEPLOYED**.

## Verified baseline
User Linux `~/reflect-r10-railway-review` (detached `1c4c121e`, Node 22.23.4): PG04B checksum-gated source patch applied; 15 legacy + 22 new `contextConsent` unit tests = **37/37 PASS, 0 FAIL**, `node --check` both modules and `git diff --check` clean. Actual patched `server/privacy/contextConsent.cjs` stays only in user-local dirty tree, NOT committed to live backend or deployed.

## New PG04C artifact
- Downloadable ChatGPT artifact **`REFLECT_PG04C_ISOLATED_FIRESTORE_EMULATOR_RACE_2026-11-22.patch`**, SHA256 `067fd19e88c8ec243e849950976404d99e6b2fbcb758f86a06151858cd0bc31d`. Adds FOUR NEW files only:
  1. `server/privacy/contextConsent.pg04c.emulator.cjs`: runs the user's **actual locally patched consent module** using Firebase Admin against genuine separate local Firestore Emulator, six synthetic checks and exact fixture cleanup, no provider calls.
  2. `server/privacy/contextConsent.pg04c.guard.test.cjs`: six offline environment-denial tests.
  3. `docs/privacy/REFLECT_PG04C_REAL_FIRESTORE_EMULATOR_TEST_PLAN.md`: exact test scope, limitations and run commands.
  4. `docs/privacy/pg04c-firestore.firebase.json`: Firestore Emulator only on `127.0.0.1:19085`, UI disabled.
- **Hard guard** before `firebase-admin` require: `REFLECT_PG04C_EMULATOR_ONLY=YES_SYNTHETIC`, `GCLOUD_PROJECT=reflect-ai-staging`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:19085`, no `FIREBASE_CONFIG` databaseURL; Admin `db.projectId` checked. `reflect-ai-staging` is necessary due hard-coded project in existing `contextConsent.cjs`, but **emulator-only guard is mandatory**; do not contact actual staging cloud. The current demo `127.0.0.1:18081` remains untouched.
- Synthetic documents have per-run random `pg04c-*` names. No full collection/root deletes; cleanup `ref.delete()` on exact tracked random fixture records only. No credentials, no live ledger, no xAI.
- Six Emulator cases (actual run pending): valid unfenced grant/check/list with Admin `Transaction.get(Query)`; private fence; public malformed fence; active grant fenced then check/list denied and revoke works; concurrent grant/erasure with final fail-closed permission (either commit order allowed); cross-owner isolation. Concurrent test is **not** a deterministic forced-transaction-conflict schedule.
- Author isolated Node 22.16.0: **6/6 offline guard tests PASS**, module/test `node --check` PASS, fresh Git `git apply --check` and `git apply --whitespace=error` PASS, `git diff --check` clean, JSON validity, ZIP CRC; missing env refused before SDK. **Author had no Firebase CLI/emulator/admin package locally; NO live Emulator PASS claim.**

## User acceptance sequence
1. In dirty `~/reflect-r10-railway-review`, download hash-verify and apply PG04C new-file-only patch; do NOT reapply PG04B.
2. `node --test server/privacy/contextConsent.pg04c.guard.test.cjs` must return six PASS. Confirm `firebase --version` and `node -p "require.resolve('firebase-admin')"` before running real Emulator.
3. Run using the exact isolated config (Firebase CLI installed, separate port 19085):
```bash
firebase emulators:exec --only firestore \
  --project reflect-ai-staging \
  --config docs/privacy/pg04c-firestore.firebase.json \
  'REFLECT_PG04C_EMULATOR_ONLY=YES_SYNTHETIC GCLOUD_PROJECT=reflect-ai-staging FIRESTORE_EMULATOR_HOST=127.0.0.1:19085 node server/privacy/contextConsent.pg04c.emulator.cjs'
```
Expected six scenario PASS and exact cleanup PASS; capture full stdout or explicit blocker. No alternative real Firestore connection, no 18081 reuse, no `hosted.integration.test.cjs`.

## Open hard blocks
- **PG04D provider-boundary TOCTOU**, positive authorization before concurrent erasure, runtime/SDK/Auth/AppCheck and rollout review not tested by isolated consent transactions.
- **PG04 staging code deployment NOT DONE**; mixed Railway replica exposure not addressed. B2.1 full private-writer census incomplete; B2.3 owner index/billing metadata legal retention unapproved. Provider context history remains **OFF**, owner index **NOT WIRED**.
