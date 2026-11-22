# Reflect 2.0 — PG04D4B3A source-equivalent hostedBudget transaction planner REVIEW COPY
**2026-11-22 • TEST-ONLY PATCH_PREPARED / USER REAL SOURCE 16 TESTS NOT YET RUN / GATE_BLOCKED.**

## Accepted B2 entry gate (actual user terminal)
- User applied SHA-pinned PG04D4B2 5-new-file patch `f8055e99d6db30aef36437d324d57bb9571acb40dfa4757a4e1b325adef4e672`; **17/17 offline Node unit PASS**, syntax and diff clean.
- User's real Firebase Admin Emulator on `reflect-pg04d4a-synthetic` localhost19087 with explicit B2+D4A synthetic flags, unset Firebase/Google credential env, **7/7 diagnostic PASS** (existing hashed budget receipt, active grant, canonical fences, D4A writer COPY generation; revoked-after-admit denial, UNKNOWN no erasure completion, partial fence deny, missing ledger deny, concurrent prepare/admit serialized). Exact synthetic refs cleanup PASS, no recursiveDelete, child exit0, emulator stopped. `GATE_BLOCKED` is correct. Rules default allow → client Firestore Rules NOT tested; hub/logging fallback 4401/4501. R9.2 frontend 18081 untouched.
- Original `hostedBudget.reserve` was **not** in B2 same-TX gate; real `memoryReply` no B2 wiring; provider/HTTP, Auth/AppCheck, source-authorized digest and old replica rollout not tested.

## New PG04D4B3A additive reviewed-copy artifact
- Patch: `REFLECT_PG04D4B3A_HOSTED_BUDGET_TX_REVIEW_COPY_2026-11-22.patch`, **SHA256 `2f37e0cada518e142a3f98cc09935ed608669fab732e6162b0717e10104c629a`**, 22,726 bytes, EXACT THREE NEW paths:
  1. `server/ai/pg04d4b3BudgetReviewedCopy.cjs`
  2. `server/ai/pg04d4b3BudgetReviewedCopy.test.cjs`
  3. `docs/privacy/REFLECT_PG04D4B3A_HOSTED_BUDGET_TX_PLANNER_REVIEW_2026-11-22.md`
- ZIP `REFLECT_PG04D4B3A_HOSTED_BUDGET_TX_REVIEW_DELIVERY_2026-11-22.zip` **SHA256 `8bdec38dd3a491aa2f11efaf7678c9e585cb7cb360d2121fd7eab47a1d99837a`**, contains patch+README. The code patch/ZIP are *delivered in the originating ChatGPT turn*, **NOT pushed to GitHub backend source or deployed**. The GitHub change is this documentation only.
- Original user-local `server/ai/hostedBudget.cjs` SHA256 pinned **`6e5c1e5e8bf7580312c8f5c8d51e7c2ecc28080da401976358d7689292e805ea`**. The test throws `SOURCE_MISMATCH` before importing source if bytes differ. Current original, `memoryReply`, `contextConsent`, original memoryErasure, D4A/B2, dirty Railway index not modified.
- Source REVIEW COPY retains imported original quota/money planning library functions, constants, hashed request ledger and finish semantics. Exposes `prepareReserveTx(tx,args)` (ALL budget reads + source calculations, **zero writes**) then `applyReserveTx(tx,plan)` (owner/global quota updates + create immutable reserved ledger; reject forged or replayed plans). Its own legacy-shaped `reserve(args)` calls prepare+apply inside one transaction. Future composer must read grant/session revision/erasure/lease/budget refs ALL before applying ANY budget or lease write.
- **Guard is OFFLINE-ONLY:** requires `REFLECT_PG04D4B3_OFFLINE_ONLY=YES_SYNTHETIC` set by test runner and a marked pure in-memory fake DB `db.__reflectB3SyntheticFake=true`; rejects Firebase config, Google credentials and Emulator host. Fake DB uses projectId string `reflect-ai-staging` for original staging guard compatibility but **has no Firebase SDK, network or cloud access**. Copy cannot be instantiated against real Firestore by normal code. No provider calls/billing/actual data modifications.

## Author and user verification — distinguish confidence levels
- Author created source copy from exact user original 153-line `hostedBudget.cjs`; `node --check` both new CJS PASS; a fresh empty Git repository `git apply --check` and `git apply --whitespace=error` PASS, diff whitespace clean; ZIP CRC PASS.
- Author ran **16/16 offline smoke PASS using TEMPORARY fake modules** `policy.cjs`, `xaiCost.cjs` and `xaiContract.cjs` only to validate test harness/refactor flow; those stubs are **NOT delivered**. **True original policy/cost functional equivalence has NOT been tested by author.**
- The **user's actual installed** policy/cost libraries and original `hostedBudget` will be loaded by `node --test server/ai/pg04d4b3BudgetReviewedCopy.test.cjs`. The 16 checks compare full returned data, immutable ledger and quotas on two in-process fake Firestores for original vs reviewed-copy. They additionally verify read-only plan, no read after write, fraud/replay denial, same-TX composability, disabled flag, invalid context, ledger duplicate, success/failure/over-reservation outcomes.
- **USER PATCH NOT YET APPLIED, USER TRUE-SOURCE 0/16 NOT RUN**. There is NO B3A genuine Firestore Emulator test (this step is explicitly offline), no actual live budget transaction or history provider transmission.

## User next 1–2 safe actions
1. Download `...B3A...patch`, verify SHA256 above, run `git apply --check` then `git apply --whitespace=error` in dirty detached `~/reflect-r10-railway-review`. It creates **three new files** and does not overwrite old source. On hash mismatch STOP.
2. Run `env -u FIREBASE_CONFIG -u GOOGLE_APPLICATION_CREDENTIALS -u FIRESTORE_EMULATOR_HOST node --test server/ai/pg04d4b3BudgetReviewedCopy.test.cjs`, then `node --check` both new CJS and `git diff --check`. Expect 16 true-source tests; do not label successful before actual user output. Do not re-run already accepted B2/D4A/B1 tests.

## Next engineering gates
- **B3B**: source-guarded reviewed COPY integration of real quota/spend planner with consent+canonical fences+D4A owner lease+sessionMemory authorization and FAKE-only provider on separate isolated genuine Admin Emulator. Need read-all-before-write and negative crash/unknown/budget denial/source-edit tests. **Do not loosen the actual staging PROJECT guards** for `contextConsent` or `hostedBudget`; synthetic reviewed adapters only.
- **B3C**: explicit real-source diff and approval for memoryReply, consent, budget, attempt recovery and original erasure writer, real Auth/AppCheck and client Rules, mixed Railway replica flags, B2.1 full private writer census, B2.3 provider/backups retention, PG01–08 privacy gates. External HTTP cannot be made atomic with Firestore; late provider send after erasure intent still means pending effective deletion. Deployed history feature flag state UNKNOWN; source defaults OFF. No live provider history release.

**Checkpoint:** `PG04D4B2=USER_17/17+REAL_ADMIN_7/7_DIAGNOSTIC_PASS+EXACT_CLEANUP_PASS/GATE_BLOCKED`. `PG04D4B3A=ADDITIVE_REVIEW_COPY_PATCH_PREPARED + AUTHOR_STUB_SMOKE_16/16_PASS + USER_TRUE_SOURCE_PARITY_0/16_PENDING / NO_NEW_EMULATOR / GATE_BLOCKED`.
