# Reflect 2.0 — R10.3-C2C2-B2.2 / OWNER LEDGER INDEX & RECONCILIATION DESIGN (DRAFT)
Date: 2026-11-21. Phase: B2.2-DESIGN_DRAFT; implementation NOT STARTED. No migration/retention schedule approved.
Sources: actual user local B2.1 route and private quota snippets; unchanged pinned `server/ai/hostedBudget.cjs`, `server/railway/appCheckReplayGuard.cjs`, `server/privacy/contextConsent.cjs` at `1c4c121e0e449f1a9360e4fb4588dcf58352e699`. See `REFLECT_R10_3_C2C2_B2_1_WRITER_INVENTORY.md`. All docs-only; LOCAL backend source is dirty and remains unpublished.

## Problem and non-negotiable invariants
1. Existing `_reflectAiPrivate/reflect-8fdc8/requestLedger/{sha256("request\0"+uid+"\0"+requestId)}` is created with `tx.create` in `reserve`, and its final state is later `tx.update` in `finish`. Request key identity must remain stable for cross-day idempotency; failed/unknown billable requests keep reservations; no accidental second xAI call.
2. Existing `ownerDays/{sha256("owner\0"+uid+"\0"+UTCday)}` is owner-specific but not prefix-queryable. `globalDays/{UTCday}` and `runtimeFlags/ai` are global, not delete-per-UID.
3. The existing ledger writes NO UID field in the request document and has no TTL. Historical records cannot be uniquely attributed by UID without original requestIds or a proven independent owner mapping. Treat historic unindexed records as `legacy-unindexed-unknown`, NEVER a clean zero.
4. `appCheckReplayTokens/{sha256(rawToken)}` is a separate token-based security ledger with opportunistic cleanup after expiration; do NOT attach it to user erasure, delete it on memory requests or grant providers an owner index into it.
5. `attemptOwners/{uid}/sessions/{sessionId}/turns/{sourceTurnId}` is a different owner-addressable receipt store. Correlation with budget ledger may be incomplete across crashes/failed-before-provider cases; it cannot certify all legacy ledger entries.
6. No new provider calls, prompt/history reads or user-content writes. Private Firestore records must remain client-denied. Retention must be formally established BEFORE any destructive reconciliation.

## Proposed versioned sidecar index (not yet approved)
An **owner-addressable metadata-only** sidecar, created *transactionally in the existing reserve transaction*, not a replacement for the ledger:

```text
_reflectAiPrivate/reflect-8fdc8/
  requestLedger/{legacyRequestDigest}               # existing; unchanged key/status
  ownerDays/{legacyOwnerDayDigest}                  # existing; unchanged daily counter
  globalDays/{YYYY-MM-DD}                           # global; unchanged
  ownerLedgerIndexes/{uid}/requests/{legacyRequestDigest}  # proposed NEW
  ownerLedgerIndexes/{uid}/days/{YYYY-MM-DD}               # proposed NEW
```

Suggested fields for the request link: `{schemaVersion:1, ledgerKey:legacyRequestDigest, day:"YYYY-MM-DD", createdAt:serverTimestamp, purpose:"billing-idempotency", retentionClass:"billing-ledger"}`; **NO raw requestId, raw message, prompt, API token, xAI output or invoice details**. The UID is only in a private path and is not exposed to client SDK. The day link stores `{schemaVersion:1, ownerDayKey:legacyOwnerDayDigest, day:"YYYY-MM-DD"}` for audit of hashed day counters without a full-system scan. Additional fields require explicit privacy review.

**Important:** Indexing connects owner identity to billing metadata; it is personally linkable. This trade-off is intentional and must undergo privacy and retention approval. No index collection is currently proven present in live code.

## Required transactional approach (implementation candidate)
- New flags default OFF, no auto-migration. Never derive owner UID from HTTP body; use server-verified principal.
- `reserve` reads old ledger + owner/global states + any index/day marker *before writes* in the same Firestore transaction. If old ledger exists, reject duplicate regardless of sidecar state. If the new index is enabled, any index collision or malformed data fails closed.
- The only successful reservation commits both legacy ledger and owner request link atomically; a failed link write aborts the entire quota/ledger reservation. Do not add an asynchronous fire-and-forget write: it creates unindexed future billable records.
- Day marker may use `tx.set(..., {merge: true})` only after validating the existing marker. Avoid a blind `tx.create` for each successive request within the same day, and never reset owner quota values. Verify Firestore transaction read-before-write semantics.
- `finish` continues to use exact legacy digest, preserving existing states `reserved → completed|failed`, over-reservation emergency shutdown and no-refund semantics; index is not an authorization primitive, should not enable duplicate provider calls.
- Owner audit is **read only**, paginated/bounded with explicit truncation, descendant scan and racing snapshot checks as warranted. Returns coverage granularity: `indexed-from-revision-N`, `legacy-unindexed-unknown`, `truncated`, `invalid-link`, `shared-global-out-of-scope`; NEVER `fullDeletionCertified`.
- Deletion **not** in this B2.2 change. Later policy distinguishes `memory-only erasure` (preserve legally necessary billing/security records and visible exceptions) from `account deletion` (legal retention and expiry tracking). Index retention must not silently become permanent personal-data retention.
- If a previously created ledger has no index, do **not** re-create/reserve, drop it, or infer it belongs to current UID via a query. Optional reconciliation only with separately verified, owner-scoped original requestIds and explicit matching hash; mark `partial` when sources are incomplete.
- Existing ledger is called immutable because request identity is durable; its mutable finishing/status fields MUST stay writable. Never remove `finish` updates while "enforcing immutability."

## Acceptance tests before any source patch can ship
1. Existing `reserve` and `finish` tests pass unchanged with new index feature **OFF**, including old costs and hash keys.
2. With index ON in **isolated demo**: one successful reservation creates legacy ledger and exactly one owner request link + day marker in the same transaction.
3. Duplicate `requestId` on same/different UTC day returns `already-exists` and never increments budget or creates extra index.
4. Forced index write failure rolls back all writes; no orphaned ledger or possible double provider billing.
5. Two concurrent reserves at same owner/day preserve exact aggregate quota and each request link; no overwrites or duplicate payments.
6. Cross-owner request link traversal denied, forged owner index ref fails closed before any other-UID read.
7. Crash/recovery and `finish` before/after provider start preserve existing outcome_unknown/manual retry semantics.
8. Historical ledger lacking index remains `legacy-unindexed-unknown`; no global deletion certificate or backfill by guess.
9. Malformed/duplicate link, stale head, truncated owner index, ghost parent and nested children are explicit incomplete states.
10. Memory-only erasure leaves billing ledger, replay tokens and required accounting data intact; retained classes appear as policy exceptions.
11. No raw requestId, UID, tokens, provider bodies or transcript leaked to external response/logs; no extra provider call; database only demo.
12. Billing quotas and non-provider attestation route remain independent; `providerUseAllowed: false` for audits.

## Pre-implementation blockers
- **B2.1 final census:** Account provisioning scripts, entitlement writer, all current local server/memory and Admin paths not fully proven; no claim of exhaustive writer coverage.
- **Privacy Gate PG-04 confirmed blocker:** pinned and locally unmodified `server/privacy/contextConsent.cjs` has no paired private/public erasure-fence read in the same grant transaction; check()/list() are not fence-aware. Must be patched and negatively tested before provider egress.
- Attestation route itself makes Admin-backed reads without a fence check (read-only, default OFF). Must define post-erasure behavior and test.
- Policy owner must decide business ledger retention TTL / legal basis / backup/PITR exception and audit access; do not invent deadlines.
- Historical unindexed records cannot reliably be assigned to UID by digest alone; no full deletion/export assertion.
- Any later rollout needs reviewed source branch/PR, exact CI and demo Emulator verification, staging feature flags and rollback plan, owner approval.

## Next execution step
1. Verify owner budget policy tests and private writer list in the current dirty local worktree (read-only). Inspect `server/ai/hostedBudget.cjs` around the reservation TX and `server/ai/policy.cjs` for `recent` contents; do not output raw secrets.
2. After this design review, implement a **demo-only, additive owner-link planning module** and unit negative tests under a new named B2.2-A patch. Do NOT modify live `hostedBudget.cjs` in the first proof-of-concept and do not run provider/deploy.
3. Only after full local unit+Emulator PASS and privacy review propose production writer integration; request explicit authorization for affecting real staging billing transactions.

## Status language
`B2.1 = PARTIAL_SOURCE_REVIEWED`; `B2.2 = DESIGN_DRAFT`; `B2.2-A CODE = NOT_STARTED`; `B2.3 retention = UNAPPROVED`; `B2.4 tests = NOT_STARTED`; `PrivacyGate = BLOCKED`; `staging/prod = NOT_DEPLOYED`.


## Additional code compatibility review — pinned source, 2026-11-21
- Read `server/ai/policy.cjs` at pinned HEAD: `planQuotaReservation` returns `ids: [...prior.ids, requestId]` as part of a *general quota planner*, but `hostedBudget.cjs` explicitly passes `ids: []` into that planner and persists `ids: []` to `ownerDays`. This distinction matters: do NOT copy `tokens.ids` or store raw request IDs in proposed sidecar or billing day documents.
- In pinned `hostedBudget.cjs`, owner/day `recent` contains timestamps from planner and is retained alongside numeric counters. The immutable property applies to request ledger **identity**, not its mutable completion fields.
- Existing backend tests available at pinned HEAD include `server/ai/aiTurnRecovery.test.cjs` and `server/railway/appCheckReplayGuard.test.cjs`; billing regression tests are also represented in `server/ai/hosted.integration.test.cjs` (direct `hostedBudget.test.cjs` path not verified). Next changes must choose actual available paths before command construction.


## B2.2-A actual user QA and B2.2-B0 new read-only proof (2026-11-21)
- **B2.2-A USER VERIFIED:** exact downloaded patch SHA256 `83e5241c5138fd6888fb5fa4c59087badbfa535c7581440cd6d597a4a886e570`, successful local `git apply`, **19/19 Node unit PASS**, real localhost Firebase demo Emulator `PASS` for atomic synthetic ledger+owner links/duplicate protection, and three-document synthetic cleanup. No real billing operations.
- **B2.2-B0 PATCH_PREPARED (not installed by user):** `REFLECT_R10_3C2C2_B2_2_B0_READONLY_RECONCILIATION_2026-11-21.patch`, SHA256 `71538330b88c56ac14b9a22be4b7b5434139a8e2cc938dff76244f911fc38365`; 4 new files only. Assistant isolated mock tests **16/16 B0 PASS**, **35/35 combined A+B0 PASS**; `git apply --check`/apply PASS in clean scratch repo; optional real demo Emulator smoke pending user run.
- B0 compares **known synthetic request** UID-scoped attempt receipt with legacy SHA256 requestLedger key and B2.2-A owner request/day sidecars. Unknown billed state, missing receipt, orphan index, malformed day, foreign owner or legacy unindexed records remain `unverified`, and `safeToRetryProvider:false`, `providerUseAllowed:false`, `fullDeletionCertified:false`. No global scan, writes or ledger cleanup.
- Next B2.2-B1 transactionally integrating this into real `hostedBudget.cjs` is **NOT STARTED** and requires exact code review, retention policy and end-to-end billing safety/Privacy Gate checks; do not enable provider or modify live ledger now.

## B2.2-A additive demo proof prepared (2026-11-21) — NOT user-applied

**Evidence level and scope:**
- User's previously requested regression ran on real Linux: `aiTurnRecovery.test.cjs + appCheckReplayGuard.test.cjs + contextConsent.test.cjs` → **39/39 PASS, 0 failures**. This does not include new B2.2-A files.
- Isolated assistant prototype: `server/privacy/demoLedgerOwnerIndex.r103c2c2b2a.cjs` + `.test.cjs` + optional `.smoke.cjs` and a privacy README; new files only, no change to real `hostedBudget.cjs` or any live route. A mock Firestore fixture in Node 22.16.0 ran **19/19 PASS twice**, code syntax and clean-repo `git apply --check`/apply PASS. A **real demo Emulator run is pending** until user applies patch and executes smoke.
- Patch `REFLECT_R10_3C2C2_B2_2_A_DEMO_OWNER_LEDGER_2026-11-21.patch`; SHA256 `83e5241c5138fd6888fb5fa4c59087badbfa535c7581440cd6d597a4a886e570`. Delivered as user-downloadable artifact in ChatGPT conversation, **NOT published in GitHub source**.
- Demo-only environmental guard: exact `demo-reflect-auth-qa` project, loopback Firestore Emulator `127.0.0.1:18081`, verified db project and explicit enabled flag, synthetic-only IDs. Proof stores a *synthetic* SHA256 legacy ledger entry and private owner request/day links atomically, tests double reserve across days, injected commit failure rollback, malformed link, foreign UID, missing ledger, legacy-unindexed state, benign synthetic finish. No real quota/money reservation, prompt, tokens, receipt leak, provider call, or production index.
- Optional smoke creates fresh random synthetic UID/requestId and cleans up only the three resulting synthetic docs. Never delete real billing ledgers or restart running emulator.
- **STATUS B2.2-A = PATCH_PREPARED**, user LOCAL_APPLIED/UNIT_PASS/EMULATOR_PASS **UNCONFIRMED**. B2.2-B production integration NOT STARTED. Retention approvals and PG-04 consent-fence blocker remain open.

**First next action on user's Linux:** apply patch by verified SHA256; run the 19 new in-memory unit tests and syntax checks. Only on user PASS run synthetic demo smoke on verified localhost Firebase Emulators. Then update tracker issue #136, master and latest status with exact user evidence; no preemptive acceptance.

## B2.2-B0 USER APPLY / EMULATOR RESULTS, environment rerun required (2026-11-21)

- User successfully applied B0 new-file patch (terminal printed `PASS: B2.2-B0 установлен`).
- Combined user Node test command *without the required demo environment* yielded `35 total / 20 PASS / 15 FAIL`; all 15 B0 FAIL occurred in the constructor before test-specific operations: `demo-reconciliation-environment-denied`. The 19 existing A cases and B0 environment-negative case passed. Source constructor checks `process.env.GCLOUD_PROJECT === "demo-reflect-auth-qa"` and `process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:18081"`. No fix to source environment guard is indicated.
- The assistant independently extracted the exact B0 patch and reran **16/16 B0 unit PASS** in a separate Node 22.16.0 container with correct environment variables. This is *not* proof of user's 35/35 combined PASS.
- The user B0 Firebase demo smoke **PASSED**: `PASS: B2.2-B0 demo read-only synthetic receipt/ledger/index reconciliation`, `PASS: B2.2-B0 exact synthetic cleanup only (NOT real billing deletion)`.
- New status: `B2.2-B0=LOCAL_APPLIED+DEMO_EMULATOR_PASS; USER_UNIT_FULL_GREEN_PENDING`. Rerun from local backend with both env vars inline before `node --test`. No new patch is necessary.

## B2.2-B1 production billing writer integration — preflight review, NOT IMPLEMENTED (2026-11-21)
Inspected current unchanged pinned `server/ai/hostedBudget.cjs`, `server/ai/hostedHandler.cjs`, `server/ai/aiTurnRecovery.cjs` at `1c4c121e0e449f1a9360e4fb4588dcf58352e699`; previous user `git diff -- hostedBudget.cjs` empty. This is **planning**, not authorization to change Railway or financial flows.

**Current real call order from pinned `hostedHandler.cjs`**:
`recovery.claim` (when enabled) → `budget.reserve` → `recovery.providerStarted` → provider invocation → `recovery.persistReply` → best-effort `budget.finish(completed)`; exception path after provider invokes recovery failure and attempts `budget.finish(failed)`, retaining full reservation on ambiguous outcomes. An index failure **inside reserve** must abort before any provider call; an index failure in a separate asynchronous write would violate this property.

**Candidate integration seam (only after policy approvals):**
- Add server-only default-OFF configuration; never switch by request body. Keep same hash derivation `sha256("request\\0"+uid+"\\0"+requestId)`; current `requestLedger` and `ownerDays` schema/keys unchanged, and no raw requestId stored in owner sidecars.
- Add `ownerLedgerIndexes/{uid}/requests/{digest}` and `ownerLedgerIndexes/{uid}/days/{utcDay}` **in the existing `budget.reserve` Firestore transaction**, after validating the existing ledger and quotas; all additional index reads occur before *any* writes; verify index collision and existing day link shape; create request link and create/update day link only if valid.
- Preserve global `globalDays` / `runtimeFlags/ai` outside owner erasure. Do not change `finish` status-transition rules, unknown-billed outcome or retained reservation; do not automatically retry xAI from an index audit.
- Existing receipt may be created by `recovery.claim` before `reserve`, so an aborted reserve may leave a before-provider receipt. The read-only audit must report this as partial rather than false spend/complete.
- Additional transaction writes may have Firestore limits, concurrency and cost impact; measure with isolated emulator using same original money/quota counters.
- Retention for owner-linked billing data and potential backfill must be independently approved; owner link is personally identifiable metadata in a server-private path.
- No production/staging writer change until B2.1 writer census, PG-04 consent fence and billing regression gates are satisfied.

**B1 negative acceptance cases to implement later:** OFF-mode parity; same/different-day duplicate and concurrent requests; malformed/missing day marker; injected transaction write failure aborts entire reservation and provider has 0 calls; before-provider crash; post-provider uncertain charge; over-reservation disable; no raw request IDs; budget and receipt status remain safely unmatched where necessary; synthetic cross-owner isolation; legacy-unindexed unknown; signed release/rollback review.

## B2.2-B1a test-only hostedBudget baseline — PATCH_PREPARED (2026-11-21)

Current actual Linux user evidence: **35/35 PASS** for B2.2-A+B0 unit tests with correct env, no diff errors; earlier synthetic B0 Emulator PASS. B2.2-B0 is thus accepted only at LOCAL UNIT/EMULATOR QA.

Before touching the real `hostedBudget.cjs` transaction, an additive offline contract test suite was prepared (17 cases). Patch `REFLECT_R10_3C2C2_B2_2_B1A_HOSTED_BUDGET_BASELINE_2026-11-21.patch` SHA256 `f14a4931545a0a194ed7fc1e0e5e39a1a8966819b30699cd5bccce3381ad61ad`. Adds `server/ai/hostedBudget.r103c2c2b1a.test.cjs` + `docs/privacy/REFLECT_R10_3_C2C2_B2_2_B1A_HOSTED_BUDGET_BASELINE.md` ONLY; no changes to original writer, routes, flags, provider or Firestore schemas.

The tests import the **real** `hostedBudget.cjs` and `policy.cjs` in the user's tree, using only an in-memory serial transactional mock; they cover digest path parity, atomic 3-write reservation, owner/global USD limits, quota/rate caps, same/different UTC-day duplicate rejection, synthetic concurrency, abort rollback, idempotent and unknown-charge finish, overspend kill switch and input validation. The author verified 17/17 PASS on a separate mirror of pinned hostedBudget logic with lightweight dependency fixtures (not exact user project), clean syntax and fresh git apply check; user real-source unit/Emulator QA NOT YET RUN. This suite is *baseline*, not implementation of the owner sidecar.

Exact next task: download/apply by SHA, user executes `node --test server/ai/hostedBudget.r103c2c2b1a.test.cjs`, `node --check`, `git diff --check`; acceptance expected 17 PASS. Subsequently B2.2-B1b integration design only after retention/PG safety review; never run existing `hosted.integration.test.cjs` against current demo emulator because that script calls `recursiveDelete(root)` and requires DIFFERENT project `reflect-ai-stage-fixture01` at Firestore `127.0.0.1:19084`.



## ## B2.2-B1a user-verified contract and B2.2-B1b0 fixture-only transaction extension (2026-11-21)
**B1a user evidence:** actual `hostedBudget.r103c2c2b1a.test.cjs` ran on user's Linux against unchanged project modules, **17/17 PASS**, syntax and diff checks clean. This supersedes prior author scratch 17/17 as the acceptance evidence.

**B1b0 prepared (not user-applied):** `REFLECT_R10_3C2C2_B2_2_B1B0_TX_INDEX_EXTENSION_2026-11-21.patch` SHA256 `ccbe32542950cc9d1872e1c49257489d29a730f4cfba4e542f4f5ffc7ca8d555`, in original ChatGPT artifact. 3 new files only: pure fixture-scoped helper `server/ai/ownerLedgerTxExtension.r103c2c2b1b0.cjs`, 15 in-memory transactional tests, and `docs/privacy/REFLECT_R10_3_C2C2_B2_2_B1B0_TRANSACTION_EXTENSION_CONTRACT.md`. Author tests 15/15 PASS, syntax/apply PASS; **user local validation pending**. No actual billing writer modified, no Firestore service or provider calls.

**Contract intended for eventual integration:** same owner/request digest as current hostedBudget, synthetic owner-scoped `ownerLedgerIndexes/{uid}/requests/{digest}` and `.../days/{day}`. `prepare({tx,uid,requestId,nowMs})` reads both target sidecars within existing TX before writes; validates any day marker and refuses request collision; `stage({tx,plan})` verifies plan belongs to same transaction and stages two or one sidecar `tx.create` calls alongside, NOT after, original legacy request/owner/global TX writes. An injected TX commit failure drops all 5 writes, duplicate winner one. No raw requestId or message in sidecar document values. This is a contract prototype and uses fixture-only IDs/project `reflect-ai-stage-fixture01` and default `enabled=false`, not deployable staging integration.

**Explicit next gates:** user tests new prototype (15 cases), then review integration diff with `hostedBudget.cjs` default OFF and negative tests against old 17-case suite. Actual source integration B1b1 blocked until separate retention/Privacy Gate review and exact billing/idempotency protection. Existing historical `requestLedger` entries without owner sidecar remain `legacy-unindexed-unknown`. Global counters and security anti-replay never owner-deleted. No account-deletion or provider-permission certification.


## B1b0 actual user QA and B1b1 real-writer compatibility TEST-ONLY proof (2026-11-21)
- B1b0 user: `15/15 PASS`, checksum-gated patch applied, syntax and `git diff --check` clean. It remains fixture-only and unconnected to live `hostedBudget.cjs`.
- B1b1 artifact: `REFLECT_R10_3C2C2_B2_2_B1B1_COMPATIBILITY_TESTS_2026-11-21.patch`, SHA256 `e3cc56981f0f0ae0aaca89aa49751e53622fb774732938e5590f0ded957b1169`, two new files ONLY: `server/ai/hostedBudgetOwnerIndexCompatibility.r103c2c2b1b1.test.cjs` and `docs/privacy/REFLECT_R10_3_C2C2_B2_2_B1B1_REAL_WRITER_COMPATIBILITY.md`. `hostedBudget.cjs` remains unchanged.
- Fixture test-local AsyncLocalStorage wrapper attaches the B1b0 index's `prepare()` before reads/writes of the **existing** `hostedBudget.reserve()` transaction callback and `stage()` after successful callback in the *same mock transaction*. OFF must exactly preserve 3 legacy writes; ON has 5 on new day and 4 when owner day marker already exists. Checks index/legacy key identity, duplicate and retention unknown, atomic rollback, rate/owner/global money limits, `finish` and uncertain charge/kill switch. No provider, real billing, SDK or external Firestore calls.
- Author isolated QA Node 22.16.0: B1b1 **19/19 PASS**, combined B1a+B1b0+B1b1 **51/51 PASS**, clean git apply + syntax. **Important:** this scratch used lightweight *non-byte-identical* dependency mirror files; user must run against exact original repo for acceptance. No Emulator test and no code push.
- The AsyncLocalStorage wrapper is a TEST-ONLY seam; do not ship or import as a production implementation. Real staged `hostedBudget` integration requires explicit reviewed API/source and an independent feature flag default OFF, plus retention and erasure-fence gates, Firestore transaction Emulator tests, and budget/race regressions. B2.1 full private-writer census and B2.3 retention remain open; PG-04 staging consent erasure-fence check is still absent.
