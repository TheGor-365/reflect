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

## 2026-11-22 actual user test attempt — blocked BEFORE Firebase Admin and any scenario
- Exact user evidence: patch installed by verified SHA guard; offline guard `6/6 PASS`, syntax/diff PASS; Firebase CLI 15.34.2. Root shell `node -p require.resolve(firebase-admin)` `MODULE_NOT_FOUND`, but `server/package.json` at pinned SHA declares `firebase-admin:13.4.0` and Node resolves scripts relative to `server/privacy`, so this root-only failure is **not sufficient** to prove `server/node_modules` missing.
- Isolated Emulator booted on `127.0.0.1:19085` and Firestore started. Hub moved 4400→4401 and logging 4500→4501 due occupied ports; no core Firestore startup failure. The PG04C script printed `FAIL: PG04C PG04C_STOP: isolated localhost Firestore Emulator required` before loading firebase-admin. Thus **0 of 6 emulator integration scenarios executed** and cleanup code wasn't entered because no fixture was created. Not a Firestore race or consent defect proof.
- Source-level exact guard requires `REFLECT_PG04C_EMULATOR_ONLY=YES_SYNTHETIC`, `GCLOUD_PROJECT=reflect-ai-staging`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:19085`, and no `FIREBASE_CONFIG` value containing `databaseURL`. Firebase CLI may inject `FIREBASE_CONFIG` for the invoked process including the Realtime Database URL even when Firestore-only; **probable**, not confirmed from user logs. No raw cloud config, key, token or ID requested.
- **Minimum non-code retry:** (1) check dependency in server scope `(cd server && node -p "require.resolve('firebase-admin')")`; do not assume absent from root test. If missing, pinned `firebase-admin@13.4.0` can be locally installed in server scope without saving manifest/lock: `(cd server && npm install --ignore-scripts --no-save --package-lock=false firebase-admin@13.4.0)`. (2) Rerun exact isolated CLI with child `env -u FIREBASE_CONFIG` immediately before required opt-in, project/host variables, and Node. This removes only CLI-injected project JSON from the child; hard safety checks remain unchanged. No staging cloud calls, no provider, no Rules changes, no old Emulator 18081.
- If still blocked, collect only sanitized Boolean/enum condition checks (no raw FIREBASE_CONFIG or credentials). Do not weaken exact localhost/project guard or connect directly to staging Firestore.
- Outcome status: `PG04C=LOCAL_APPLIED+OFFLINE_GUARD_PASS`, `REAL_EMULATOR=ENV_BLOCKED 0/6`, `PG04D=NOT_STARTED`, `PROVIDER_CONTEXT=OFF`.

## PG04C final user acceptance — 2026-11-22 (supersedes ENV_BLOCKED)
User's actual Linux stdout after the shell-only `env -u FIREBASE_CONFIG` adjustment:
- `server/node_modules/firebase-admin/lib/index.js` resolved correctly from `server`; Firebase CLI 15.34.2.
- Isolated `firebase emulators:exec` started Firestore at `127.0.0.1:19085`. Six PASS lines: `Transaction.get(Query)` and grant/check/list, private fence deny, malformed public fence deny, old active grant unusable after fencing, concurrent grant/erasure final permission denied, cross-owner deny.
- Aggregate `PASS: PG04C 6/6 isolated localhost real Firestore Emulator checks`, `PASS: PG04C exact synthetic per-run cleanup only (no recursiveDelete)`, child exited **code 0**. Emulator shut down normally.
- Original failed attempt due to environment guard did not run any cases and is now superseded; no cloud project, provider, real user data, source release or billed transaction was accessed.
- Cautions: Firestore Emulator reports no explicit Rules file (Admin SDK tests do not certify client Rules), case 5 checks final state under concurrency but is not a deterministic forced conflict, and PG04D provider-egress TOCTOU remains unresolved. [PG04D threat model](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/privacy/REFLECT_PG04D_PROVIDER_CONTEXT_EGRESS_BOUNDARY_DESIGN_2026-11-22.md).

**Accepted stage**: `PG04C=USER_LOCAL_EMULATOR_PASS+SYNTHETIC_CLEANUP_PASS`. `PG04D=DESIGN_DRAFT/NON_DEPLOYED`.
