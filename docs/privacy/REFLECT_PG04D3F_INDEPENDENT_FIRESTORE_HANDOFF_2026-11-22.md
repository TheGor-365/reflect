# Reflect 2.0 — PG04D3F separate-port Firestore TX + in-process fake-provider diagnosis
2026-11-22 • **TEST-ONLY FIVE-NEW-FILE PATCH PREPARED / AUTHOR OFFLINE 12/12 PASS / USER QA PENDING / REAL EMULATOR 0/6 NOT RUN**

## Verified predecessor
- **PG04D3 actual USER Linux:** checksum-gated 3-file candidate patch now installed (`PASS: PG-04D3 установлен`); `node --test server/privacy/pg04d3OwnerCoordination.test.cjs` **32/32 PASS**, source baseline hash PASS, syntax both JS + `git diff --check` no errors. Earlier not-found download was superseded. Stage `PG04D3=LOCAL_APPLIED+OFFLINE_UNIT_PASS_32/32`; this model has no Firestore/transport/prod integration.
- Existing **PG04D2** diagnostic guard user 8/8 PASS; actual 6-case Firestore Emulator diagnostic **0/6 EXECUTED** because `18081` is held by frontend R9.2 `tests/emulator`: Java PID 1729032, parent Node PID 1728982. Do not kill, attach to or change constructor guard of this old original actual writer. PG04C genuine staging-consent Firestore Emulator 6/6 previously accepted but is different.
- Actual user uploaded source archive byte-reviewed and SHA-pinned: `memoryErasure.r103c2b.cjs`, `demoMemoryConsentAdmission.r103c2b2.cjs`, `demoDispatchLease.pg04d1.cjs`; candidate D3 source now additionally pinned. Current dirty Railway index imports staging `createContextConsentStore` and memory attestation, NOT demo D1/D2 toy in scoped `rg`. No backend code push or staging deployment.

## PG04D3F additive test artifact (DELIVERED in this ChatGPT turn, no GitHub backend commit)
`REFLECT_PG04D3F_INDEPENDENT_FIRESTORE_FAKE_TRANSPORT_2026-11-22.patch`
**SHA256 `223e136a243a4732bc82a578a98940342ab596051777aa4d6cb54e1449e3ce81`**.

Adds EXACTLY FIVE new files:
1. `server/privacy/pg04d3fFirestoreCoordination.cjs` — unimported TEST-ONLY real Admin Firestore TX coordinator; data only under randomly claimed `pg04d3fSyntheticRuns/{runId}`. Does not call actual `memoryErasure` source; real writer's hardcoded port remains untouched.
2. `server/privacy/pg04d3fFirestoreCoordination.test.cjs` — 12 offline tests, project/env/credential guards, byte-exact SHA checks for 4 current original files, fake serial transactions, duplicate/reserved/unknown/cancel/partial-fence behavior.
3. `server/privacy/pg04d3fFirestoreCoordination.emulator.cjs` — six real Firestore Admin Emulator diagnostics; one in-process fake transport counter, no HTTP/provider.
4. `docs/privacy/pg04d3f-firestore.firebase.json` — ONLY Firestore `127.0.0.1:19086`, Emulator UI off.
5. `docs/privacy/REFLECT_PG04D3F_INDEPENDENT_FIRESTORE_TX_FAKE_TRANSPORT_2026-11-22.md` — full user runbook and limitations.

**Different synthetic project `reflect-pg04d3f-synthetic`**, exact localhost `127.0.0.1:19086`, `REFLECT_PG04D3F_EMULATOR_ONLY=YES_SYNTHETIC`, exact `GCLOUD_PROJECT`, no `FIREBASE_CONFIG` or `GOOGLE_APPLICATION_CREDENTIALS`, default DB only, requires `db.projectId` exact. Unit/hash safety gate before using SDK. User must confirm port 19086 FREE before `emulators:exec`. Do NOT change or terminate R9.2 frontend listener on 18081.

## Diagnostic contract / realism
- Synthetic owner coordinator and per-lease `generation`, paired synthetic private/public erasure markers, `reservedCount`, `inFlightCount`, `unknownCount`, replay prevention, conservative cancel and explicit `eligible-for-writer-review` (**NOT data-erasure completed**).
- Real tests (user pending) exercise: admit/begin/settle/replay; erasure fence/cancel invalidating old lease; unknown outcome blocking erasure; intentionally demonstrated **fake POST after erasure request** when dispatch was started before (external HTTP not atomic with Firestore); foreign owner and partial fence denial; concurrent admit vs prepare serializability with **BOUNDED** 650ms overlap attempt to avoid deadlock if Firestore pessimistically locks on read. Do not claim deterministic forced conflict of both initial readers.
- Script always prints **`GATE_BLOCKED`** even if all six diagnostics PASS: actual erasure writer NOT integrated, future real provider HTTP ordering still unproven, B2.1 writer census/B2.3 retention pending. Only fresh random synthetic-run marker+docs tracked and exactly deleted with post-cleanup absence check; no collection `recursiveDelete` or real user data touch.
- If run namespace marker exists or cannot be created, abort before descendant writes and do NOT delete data not created by this run. No claim of Firestore client Rules test: Admin SDK bypasses Rules.

## Validation, no invented Emulator PASS
- Author isolated Node v22.16.0, exact 4 local source files copied from source archive and accepted D3 source: **12/12 offline PASS**, fresh empty Git repo `git apply --check` + `git apply --whitespace=error` PASS, JS syntax, JSON parse, `git diff --check`, ZIP CRC PASS. ZIP SHA256 `b7a0ed30c4184529ed90ce391f17a425e659b7fb0bf46e0e6b18f887c4556f78`.
- **AUTHOR REAL FIRESTORE EMULATOR NOT RUN** (no local Firebase CLI/SDK), USER patch apply, 12 offline and 6 real Emulator PENDING. Do not call this source-certified integration or enable real context.
- User run shell: apply hash-verified patch, run 12 tests; confirm `ss` port 19086 free, then:
```bash
firebase emulators:exec --only firestore \
 --project reflect-pg04d3f-synthetic \
 --config docs/privacy/pg04d3f-firestore.firebase.json \
 'env -u FIREBASE_CONFIG -u GOOGLE_APPLICATION_CREDENTIALS REFLECT_PG04D3F_EMULATOR_ONLY=YES_SYNTHETIC GCLOUD_PROJECT=reflect-pg04d3f-synthetic FIRESTORE_EMULATOR_HOST=127.0.0.1:19086 node server/privacy/pg04d3fFirestoreCoordination.emulator.cjs'
```
- **Status**: `PG04D3F=PATCH_PREPARED+AUTHOR_OFFLINE_12/12_PASS+USER_QA_PENDING+REAL_EMULATOR_0/6`. Original `PG04D2=REAL_EMULATOR_BLOCKED_0/6` unchanged; `PG04D3=USER_SYNTHETIC_32/32_PASS`. B2.1 and B2.3 open. No source push/deploy, provider request or actual deletion.
