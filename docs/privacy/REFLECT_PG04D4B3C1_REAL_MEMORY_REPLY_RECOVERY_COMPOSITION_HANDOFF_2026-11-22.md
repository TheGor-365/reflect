# Reflect 2.0 — PG04D4B3C1: actual source-core consent/budget/recovery/memoryReply offline composition diagnostic
**2026-11-22. TEST-ONLY TWO-NEW-FILE PATCH PREPARED. USER SOURCE QA PENDING. GATE_BLOCKED.**

## Prerequisite user Linux ACCEPTANCE PG04D4B3B
- Backend `~/reflect-r10-railway-review`, detached HEAD `1c4c121e`, ASDF Node 22.23.4. SHA-guarded `REFLECT_PG04D4B3B_JOINT_BUDGET_LEASE_EMULATOR_2026-11-22.patch` applied: `PASS: PG-04D4B3B установлен`.
- `node --test server/ai/pg04d4b3bJointReserveLease.test.cjs` **11/11 PASS, 0 failures** (108.250382 ms); 3 CJS syntax checks and `git diff --check` clean.
- Separate genuine Firebase **Admin Firestore Emulator** `reflect-pg04d4a-synthetic`, `127.0.0.1:19087`, explicit B3B+D4A synthetic opt-in, cloud credential env unset: **7/7 PASS**. Budget **ledger CREATION and lease** same TX; revoked grant denial before reserve; source edit between admit/begin, immutable ledger retained; reviewed erasure writer COPY paired fence and cancel deny stale lease; late FAKE send+UNKNOWN blocks effective deletion; budget kill switch atomically denies ledger+lease; concurrent prepare vs admit serializes. **Exact synthetic refs cleanup PASS** with no recursiveDelete, child exit 0, Emulator stopped. `GATE_BLOCKED` explicitly printed and remains mandatory.
- Hub 4400→4401, logging 4500→4501 auto-fallback harmless. Missing Firestore Rules file → **client Firestore Rules NOT tested**. Original frontend 18081 untouched. Original production/staging writer/budget/consent/AI route and real data unchanged.

## Scope discrepancy — reason for PG04D4B3C1
- B3B genuine Admin TX tests involved **reviewed emulator-only budget/writer copies**, with a user-supplied **fixture digest**, not a durable authenticated owner-approved receipt.
- Real `createMemoryReplyExecutor` uses `memory.authorize` → `recovery.claim` → `budget.reserve` → `recovery.providerStarted` → another `memory.authorize` → `adapter.invoke` → recovery `persistReply` → `budget.finish`. It does **NOT** import/execute B3B's lease gate. Real `aiTurnRecovery` and budget have independent transactions.
- A final consent check is not atomic with provider HTTP. Prior B1 showed an erasure fence could appear before fake send; B3B does **not** fix this original call path. A successful user test in C1 is a diagnostic, **not a release pass**.

## New artifact, exactly two ADDITIVE new files
Patch **`REFLECT_PG04D4B3C1_REAL_MEMORY_REPLY_RECOVERY_COMPOSITION_2026-11-22.patch`**, SHA256 **`4f05257729e65e4356fe9c67339c85b93ded3f2da1f8a60277594d807d20ab9a`**, 20,624 bytes. Delivery ZIP **`REFLECT_PG04D4B3C1_REAL_CORE_RECOVERY_OFFLINE_DELIVERY_2026-11-22.zip`**, SHA256 `c12d89c6bf1b2e665b0732e5db8457c1aff6349564c0e66c10ea7c345da853a6`. Both only in originating ChatGPT response/container, **not pushed as GitHub source**.
1. `server/ai/pg04d4b3c1RealCoreRecovery.diagnostic.test.cjs`: 12 Node diagnostics, require unmodified local *actual* `memoryReply.cjs`, `sessionMemory.cjs`, `contextConsent.cjs`, `hostedBudget.cjs`, `aiTurnRecovery.cjs` after exact source hash guard. Uses serialized in-memory Firestore fake with `projectId="reflect-ai-staging"` **as a STRING only** (NO SDK/network/cloud), in-process fake adapter, synthetic session/grant/receipt/owner.
2. `docs/privacy/REFLECT_PG04D4B3C1_REAL_MEMORY_REPLY_RECOVERY_OFFLINE_COMPOSITION_2026-11-22.md` — detailed local runbook and conditions.

## Diagnostic cases
- Exact git blob SHA1 pins for `memoryReply`, `sessionMemory`, `contextLevels` and byte SHA256 pins for current user-local `hostedBudget`, `contextConsent`, `aiTurnRecovery`, before imports; reject SOURCE_MISMATCH without fallback.
- Real-core synthetic success: authenticated validated request, actual two-stage authorization, `aiTurnRecovery.claim/providerStarted/persistReply`, `hostedBudget.reserve/finish`, one FAKE provider call, one synthetic assistant turn and metadata receipt; no double paid attempt.
- Revocation before claim and after reserve; source edit before second authorization; budget kill switch; fake provider timeout/unknown (potentially billed); duplicate source attempt; malformed/partial canonical erasure fence fail-closed.
- **Negative diagnostic #1**: after final `sessionMemory.authorize`, a synthetic erasure fence appears before fake adapter call. Fake send still occurs — **PASS signifies UNSAFE WINDOW, NOT secure egress**.
- **Negative diagnostic #2**: actual recovery receipt persists reply but simulated `hostedBudget.finish(completed)` fails; answer exists while immutable ledger remains `reserved`. Requires explicit reconciliation; never silently refund/retry.
- Real source scanner documents `memoryReply` has no B3B lease gate wiring.

## Strict NO-CLOUD / honest QA
- User command must set `REFLECT_PG04D4B3C1_OFFLINE_ONLY=YES_SYNTHETIC` and UNSET `FIREBASE_CONFIG`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIRESTORE_EMULATOR_HOST`. It does NOT start a Firebase Emulator, sends zero network calls and touches no real account data.
- **AUTHOR ONLY 12/12 TEMP-STUB SMOKE PASS**, using **non-delivered** temporary substitute `memoryReply`, `sessionMemory`, `policy/xaiCost/xaiContract` while keeping exact user-uploaded consent/budget/recovery sources. Clean Git `git apply --check` and `git apply --whitespace=error` on fresh repository, JS syntax, `git diff --check`, ZIP CRC all PASS. **The user's actual five-source integration HAS NOT BEEN RUN by author**. No claims of actual source QA or genuine Firestore for C1.
- **USER C1=NOT APPLIED, TRUE-SOURCE 0/12 NOT RUN**. Prior B3B actual 11+7 acceptance remains separate.

## User next 1–2 steps
1. Download patch in the chat to `~/Downloads` or `~/Загрузки`, verify SHA256 above, `git apply --check` then `git apply --whitespace=error`; exactly two **new** files, no original source overwrite, reset, clean or deploy.
2. Execute:
```bash
cd ~/reflect-r10-railway-review
env -u FIREBASE_CONFIG -u GOOGLE_APPLICATION_CREDENTIALS -u FIRESTORE_EMULATOR_HOST \
 REFLECT_PG04D4B3C1_OFFLINE_ONLY=YES_SYNTHETIC \
 node --test server/ai/pg04d4b3c1RealCoreRecovery.diagnostic.test.cjs
node --check server/ai/pg04d4b3c1RealCoreRecovery.diagnostic.test.cjs
git diff --check
```
Expect 12 **diagnostic** cases, but do NOT report them PASS until actual Linux stdout. At any SOURCE_MISMATCH stop, preserve originals, inspect changed source before writing patches.

## Gate sequence after C1
PG04D4B3C2 requires reviewed-source diff for actual `memoryReply` and *durable server-verified* owner approval receipt bound to request+source revision and B3B joint quota ledger+lease generation, including actual `aiTurnRecovery` atomic state/unknown billability; once reviewed, integrated Admin Emulator+FAKE and **separate client Rules** denial QA. External HTTP POST cannot be atomic with Firestore; never promise no post-click bytes absent a reviewed outbound gateway. Privacy PG01–08 and B2.1 full writer census/B2.3 retention remain OPEN, deployed Railway history feature flag state UNKNOWN, source default OFF, no production deploy or paid provider.
