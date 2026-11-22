# Reflect 2.0 — PG-04D4B1: source-defined memoryReply provider egress / user PG04D4B route evidence
**2026-11-22 — source review and additive diagnostic patch PREPARED; USER DIAGNOSTIC QA PENDING; no production or staging changes.**

## New actual user Linux evidence
- The repeated `REFLECT_PG04D4B_SOURCE_REVIEW.tar.gz` hash is **`7bc64b3aa47b82ec188d51a0e344d6f27b6690f8d0d910c370ac8ff1a74fa426`**, exact seven source paths as previously audited. Archive already received and reviewed; do NOT ask for another copy.
- `git status --short -- server/ai/sessionMemory.cjs server/ai/providerSessionContext.cjs server/ai/interactionContract.cjs server/ai/contextLevels.cjs` returned **EMPTY** (all four tracked files unchanged from user pinned HEAD `1c4c121e`, not a declaration of deployed code).
- `rg -n` in dirty `server/railway/index.cjs` showed real handler creation lines 342/346, consent store 401/403, `createSessionMemoryAdapter` at 418/422, and separate old bounded `createSessionContextPreview` and `createPreviewHttpListener` at 433/435/436/440. Scoped search did NOT include keyword `createMemoryReplyHandler`, so its absence from that grep is **NOT evidence it is absent**; full local import/wiring for that factory remains unverified. Earlier `rg` also showed memory attestation route lines 377–382. This supports TWO different preview UIs; neither preview by itself confers provider send permission.

## CRITICAL correction: a second source-defined history-capable provider route EXISTS
Direct pinned GitHub source audit at backend `1c4c121e0e449f1a9360e4fb4588dcf58352e699`:
- `server/ai/memoryReply.cjs` **Git blob SHA1 `972c488a9df3d43f4af15ee6390dfe62687277a3`**, lines 91–187 `createMemoryReplyExecutor`. It performs `memory.authorize` (line112) → recovery claim (115) → `budget.reserve` (127) → `recovery.providerStarted` (137) → a SECOND `memory.authorize` (140) → **`adapter.invoke(input.message, settings, {authorizedContext: checked}, ...)` (142–147)** → persist reply and budget.finish. **This is a history-capable provider call, separate from `hostedHandler.cjs:115` which passes `null`.** The module has no shared owner-coordinator/lease TX or canonical erasure preparation handshake.
- Pinned `server/railway/index.cjs` contains `contextReplyEnabled = process.env.REFLECT_AI_SESSION_MEMORY_REPLY_ENABLED === "yes"` (lines 258–260), default OFF; dependency conditions at 292–297, `createMemoryReplyHandler` at approx 389–395, and dispatch route wiring. **User LOCAL dirty Railway file has NOT been byte reviewed**, nor has deployed Railway feature flag state been verified. Never claim historical context definitely OFF in deployed staging solely from the `hostedHandler` null argument; say **default flag OFF, actual enabled state UNKNOWN**. Do not request/print secret environment values.
- Pinned `server/ai/sessionMemory.cjs` blob `0f48870bde1f13059c9d12c8f5a63aa8ff1b717b`, `providerSessionContext.cjs` blob `6a794b1226faccdf19ba10281c35c13d89ed6cb3`, `interactionContract.cjs` blob `149a4aa7475a02bb02451c1a30d30d4709699c98`, `contextLevels.cjs` blob `a4ec57a7cafd02e88e588913773420c91eb63721`, all user's tracked files unchanged relative to pinned HEAD. These use a separate 1200-byte owner/request/message/source-turn-bound `approvalDigest`, NOT the older 2400-byte HTTP `previewHash`.
- User-local verified `contextConsent.cjs` SHA256 `8b1c6e2790e49bc77982cfd5b98fadd2faa302dd0284f3cdc6280e1e1b86d738` and `hostedBudget.cjs` SHA256 `6e5c1e5e8bf7580312c8f5c8d51e7c2ecc28080da401976358d7689292e805ea`. Consent checks both erasure fences during grant/check/list transactions; budget reserves hashed immutable requestLedger in its own TX. Neither makes final `memoryReply` provider HTTP atomic with an erasure intent.

## Actual provider ordering gap and semantic risk
- There is a **separate snapshot-consistent authorization read** just before `adapter.invoke`, but **NO transaction** encompassing both this read and external HTTP. A synthetic concurrent erasure fence can be created between final `memory.authorize` and `adapter.invoke`. The final pre-egress read alone cannot assure no network send after erasure request. Firestore cannot make external POST atomic, and ongoing pre-approved requests should keep erasure effective/completed blocked until known settlement.
- `recovery.providerStarted` marks possible charge before final grant/preview authorization. `budget.reserve` has its own TX; it is not atomic with owner lease generation nor with `recovery` receipt. Stale preview, revoked grant, budget failure, timeout and new user-confirmed retry require explicit durable accounting. DO NOT silently treat a new retry as settling the earlier outcome.
- Source-defined History Reply flag is OFF by default; **do NOT assume the actual Railway deployed flag is OFF or ON** without a verified deployment/config review. No real provider call observed or claimed by this audit.

## New additive TEST-ONLY diagnostic patch
`REFLECT_PG04D4B1_REAL_MEMORY_REPLY_EGRESS_DIAGNOSTIC_2026-11-22.patch`
**SHA256 `10e9fc86e147cb6a18f019f5977faaadb183b1aa5bc4c35990d9ff474a37c714`**
adds EXACTLY TWO new files, nothing overwritten:
1. `server/ai/pg04d4bMemoryReplyBoundary.diagnostic.test.cjs` (11 source-pinned real-core Node tests with injected fake memory/budget/recovery/adapter, NO Firebase, network, money or live user data). It deliberately expects a **fake-only unsafe late-send ordering** to show the gap, not to certify safety.
2. `docs/privacy/REFLECT_PG04D4B1_REAL_MEMORY_REPLY_EGRESS_ORDER_DIAGNOSTIC_2026-11-22.md` (runbook and limitations).

Source gate: exact Git *blob* SHA1 pins for five unchanged pinned .cjs plus SHA256 of two user-local reviewed sources. If any input changed, abort with `SOURCE_MISMATCH` before loading the handler. Do not bypass pins. No production handler changes, no feature flags, no real Firebase or provider interaction.

**Author checks** on additive patch: new test Node JS syntax PASS, fresh Git `git apply --check`, `git apply --whitespace=error` and `git diff --check` PASS, ZIP CRC integrity verified. **AUTHOR did NOT run 11 tests against user's actual memoryReply.cjs** (not included in provided 7-file TAR and no Firebase dependencies pulled). **USER 11/11 diagnostic run PENDING; never label PASS before user log.** No emulator needed for these tests.

## Next 1–2 actions
1. User SHA-verifies and applies the additive-only patch to dirty detached backend, then runs `node --test server/ai/pg04d4bMemoryReplyBoundary.diagnostic.test.cjs`, `node --check`, `git diff --check`. Expect 11 *diagnostic* cases; report any `SOURCE_MISMATCH` without override. Download supplied in conversation, not GitHub source code commit.
2. Optional separate **read-only route presence** check `rg -n 'REFLECT_AI_SESSION_MEMORY_REPLY_ENABLED|contextReplyEnabled|createMemoryReplyHandler|handleContextReply' server/railway/index.cjs`, no environment values. This verifies code path, NOT deployed runtime flag.

## Gates
`PG04D4B1=SOURCE_WIRING_REVIEWED+ADDITIVE_DIAGNOSTIC_PATCH_PREPARED+USER_UNIT_PENDING`.
`PG04D4A=USER_UNIT_12/12+REAL_EMULATOR_6/6_DIAGNOSTIC_PASS+EXACT_CLEANUP_PASS, GATE_BLOCKED`.
`PG04D2=ORIGINAL_WRITER_REAL_EMULATOR_0/6_NOT_RUN`, frontend 18081 occupied.
B2.1 private writer census PARTIAL; B2.3 retention/provider/backups UNAPPROVED; PG01–08 still BLOCKED. No live source or production deployment, no paid provider calls. Next true integration must be reviewed original-writer + actual consent and immutable budget ledger + owner lease generation + real Auth/AppCheck/Rules and FAKE transport together in isolated Emulator before any history-on.
