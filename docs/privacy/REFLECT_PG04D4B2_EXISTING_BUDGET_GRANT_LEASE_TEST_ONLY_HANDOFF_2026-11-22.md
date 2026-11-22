# Reflect PG04D4B2 — test-only joint grant / existing budget ledger / erasure generation admission
2026-11-22 — **PATCH PREPARED**, author isolated 17/17 unit PASS, user QA and real Admin Firestore Emulator 0/7 PENDING, GATE_BLOCKED. **No source branch commit or deployment.**

## Latest accepted previous step (actual user terminal)
- User checksum-gated `REFLECT_PG04D4B1_REAL_MEMORY_REPLY_EGRESS_DIAGNOSTIC_2026-11-22.patch` installed on dirty detached backend `~/reflect-r10-railway-review` (`1c4c121e`, Node 22.23.4); `node --test server/ai/pg04d4bMemoryReplyBoundary.diagnostic.test.cjs` **11/11 PASS, 0 fail** (~134.1ms), JS syntax and `git diff --check` clean.
- Its `D4B1 EXPECTED UNSAFE WINDOW` case demonstrates that after actual `memoryReply`'s final consent authorization, a synthetic erasure fence could appear and in-process fake adapter still invokes. This is a negative finding, NOT release acceptance. Neither original `memoryReply` nor Railway was changed.
- User `rg` proves conditional LOCAL source integration: `server/railway/index.cjs:259–260` `contextReplyEnabled` depends on `REFLECT_AI_SESSION_MEMORY_REPLY_ENABLED === "yes"`, `:409–411` imports `createMemoryReplyHandler`, and `:454` hands it to routing. This proves the conditional code path, but the **actually deployed Railway flag state is UNKNOWN**. `hostedHandler(..., null)` is a different no-history route. No actual provider egress was observed by this QA.

## New ADDITIVE test-only candidate, no existing file modified
- Artifact: `REFLECT_PG04D4B2_EXISTING_BUDGET_GRANT_LEASE_FIRESTORE_2026-11-22.patch`, exact SHA256 **`f8055e99d6db30aef36437d324d57bb9571acb40dfa4757a4e1b325adef4e672`**, 40,024 bytes, five **NEW** files:
  1. `server/ai/pg04d4b2BudgetGrantLease.cjs`: synthetic-only Firestore-transaction helper. In SAME transaction it reads active grant record with real `contextConsent` record shape, both canonical erasure fence paths, existing hashed `hostedBudget` ledger document, D4A owner generation and lease; creates D4A-compatible owner/lease counters, a metadata-only approval binding and an immutable per-owner/requestId tombstone. A second `begin()` transaction revalidates consent, ledger and generation before it marks potentially in-flight; `settle()` keeps unknown in quarantine. No network/SDK import or actual money transaction.
  2. `server/ai/pg04d4b2BudgetGrantLease.test.cjs`: **17 mock-Firestore unit tests** including strict env, existing budget only, grant revoke/expiry/source, partial erasure fence, stale generation/cancel, replay with another lease ID, unknown outcome, forged digest, rollback.
  3. `server/ai/pg04d4b2BudgetGrantLease.emulator.cjs`: **7 prospective true Admin Firestore Emulator diagnostics** against **ALREADY ACCEPTED COPY** `pg04d4aMemoryErasureReviewedCopy.cjs` and `pg04d4aOwnerCoordinator.cjs`, with in-process FAKE send and exact tracked-per-run fixture deletion. No actual original writer import, paid provider, real Auth/AppCheck or client Rules.
  4. `docs/privacy/pg04d4b2-firestore.firebase.json`: stand-alone Firestore port `127.0.0.1:19087`, project `reflect-pg04d4a-synthetic` (same previously user-accepted isolated D4A project, fresh run IDs).
  5. `docs/privacy/REFLECT_PG04D4B2_EXISTING_BUDGET_GRANT_LEASE_ADMISSION_2026-11-22.md`: local runbook and gap register.
- ZIP `REFLECT_PG04D4B2_EXISTING_BUDGET_GRANT_LEASE_DELIVERY_2026-11-22.zip` SHA256 `7c670f1a98e4db06b6f10ebad9bcd203e585830a45c0f16f4861e25d86cb97a4` includes patch and handoff. **This ZIP is delivered to user in the ongoing chat, NOT uploaded as source to repo.**
- Strict gate: `REFLECT_PG04D4B2_EMULATOR_ONLY=YES_SYNTHETIC`, `REFLECT_PG04D4A_EMULATOR_ONLY=YES_SYNTHETIC` for reviewed writer copy, project `reflect-pg04d4a-synthetic`, exact `FIRESTORE_EMULATOR_HOST=127.0.0.1:19087`, cloud credential env keys absent, synthetic UID and lease IDs only. Emulator script SHA-pins exact user-local consent, budget, original writer, D4A coordinator and reviewed writer COPY before Firebase Admin import; source mismatch STOP, no bypass. Existing R9.2 port 18081 untouched.
- Author verified isolated Node v22.16.0: **17/17 offline unit PASS**, clean Git `git apply --check` and `git apply --whitespace=error` PASS in *fresh* test repository already containing earlier D4A files, both relevant CJS syntax and Emulator script syntax PASS, Firebase JSON parse PASS, `git diff --check` PASS, ZIP CRC verified. **USER has NOT applied new PG04D4B2 patch**. Author did **NOT** run genuine Firestore Emulator 7 cases (CLI/SDK unavailable). Expected 7 diagnostic PASS + `GATE_BLOCKED` + exact synthetic refs cleanup, but no success claim before user log.

## Source-specific limitations / production blockers
1. The helper reads an **existing** immutable `hostedBudget.requestLedger`, but does NOT call original `hostedBudget.reserve()` or join that budget reservation TX with lease admission. Budget reserved but lease admission rejected is an unresolved, conservatively retained amount: **never auto-refund or silently retry** when provider outcome may be uncertain. This stage does not certify end-to-end billing idempotency.
2. The approval digest, sourceId and grantId are synthetic *fixture inputs*. The module records their binding to owner/request/lease, **but does not authenticate who approved the exact preview**, read source revision, or directly use `sessionMemory.authorize`. Never interpret recorded digest equality as owner consent. The separate 2400-byte old HTTP `previewHash` cannot substitute for the canonical 1200-byte `sessionMemory.approvalDigest`.
3. The real history-capable `memoryReply.cjs` and actual `hostedHandler.cjs` are untouched, and the B2 helper is **not imported** anywhere in Railway. Thus current unsafe final-consent/pre-POST gap remains in real source, regardless of model test outcome.
4. Even if a Firestore TX marks `dispatch-started` before the outside-provider POST, an erasure request TX can commit between begin and HTTP. Therefore new `inFlight`/unknown counters prevent **effective erasure while unsettled**, but do **NOT** guarantee zero outbound bytes after a click. A stronger outbound gateway must be reviewed separately if required.
5. Actual Auth/AppCheck, client Firestore Rules, authoritative retained source grant/digest, provider duplicate paid charges, B2.1 private writer census, B2.3 retention/provider/backups, legacy replicas and PG01–08 still BLOCKED. The actual original writer PG04D2 real Emulator 0/6 remains blocked by R9.2 18081; D4A copy tests were 6/6 real diagnostic PASS with GATE_BLOCKED.

## One user run sequence
1. Download the exact `.patch` from ChatGPT, SHA256 verify, `git apply --check` and `git apply --whitespace=error` into dirty detached backend (only five new files). Do not reset/clean existing local work.
2. `node --test server/ai/pg04d4b2BudgetGrantLease.test.cjs` expected 17/17; `node --check` helper and Emulator JS; `git diff --check`.
3. Only if 19087 is free and unit PASS, run:
```bash
firebase emulators:exec --only firestore \
  --project reflect-pg04d4a-synthetic \
  --config docs/privacy/pg04d4b2-firestore.firebase.json \
  'env -u FIREBASE_CONFIG -u GOOGLE_APPLICATION_CREDENTIALS REFLECT_PG04D4B2_EMULATOR_ONLY=YES_SYNTHETIC REFLECT_PG04D4A_EMULATOR_ONLY=YES_SYNTHETIC GCLOUD_PROJECT=reflect-pg04d4a-synthetic FIRESTORE_EMULATOR_HOST=127.0.0.1:19087 node server/ai/pg04d4b2BudgetGrantLease.emulator.cjs'
```
A green result still prints `GATE_BLOCKED`. The real source, Railway/staging/prod, actual user data and paid provider remain untouched.

## Next gate after actual user evidence
PG04D4B3 must integrate the **real** `memoryReply` and `sessionMemory.authorize` proven source/digest into a single server-owned approval+lease protocol with original grant, existing immutable budget reservation and durable recovery across crashes; review narrowly before source patch. Test independently on Admin Emulator+FAKE and client Rules. Do not turn on historical context until privacy and legal retention are accepted.

**Status:** `PG04D4B1=USER_DIAGNOSTIC_11/11_PASS+UNSAFE_WINDOW_CONFIRMED`; `PG04D4B2=PATCH_PREPARED+AUTHOR_UNIT_17/17_PASS+USER_QA_PENDING+REAL_EMULATOR_0/7`; `PRIVACY_GATE=BLOCKED`.
