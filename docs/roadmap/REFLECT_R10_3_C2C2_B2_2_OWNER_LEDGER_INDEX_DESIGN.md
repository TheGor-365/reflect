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


## B2.2-A additive demo proof prepared (2026-11-21) — NOT user-applied

**Evidence level and scope:**
- User's previously requested regression ran on real Linux: `aiTurnRecovery.test.cjs + appCheckReplayGuard.test.cjs + contextConsent.test.cjs` → **39/39 PASS, 0 failures**. This does not include new B2.2-A files.
- Isolated assistant prototype: `server/privacy/demoLedgerOwnerIndex.r103c2c2b2a.cjs` + `.test.cjs` + optional `.smoke.cjs` and a privacy README; new files only, no change to real `hostedBudget.cjs` or any live route. A mock Firestore fixture in Node 22.16.0 ran **19/19 PASS twice**, code syntax and clean-repo `git apply --check`/apply PASS. A **real demo Emulator run is pending** until user applies patch and executes smoke.
- Patch `REFLECT_R10_3C2C2_B2_2_A_DEMO_OWNER_LEDGER_2026-11-21.patch`; SHA256 `83e5241c5138fd6888fb5fa4c59087badbfa535c7581440cd6d597a4a886e570`. Delivered as user-downloadable artifact in ChatGPT conversation, **NOT published in GitHub source**.
- Demo-only environmental guard: exact `demo-reflect-auth-qa` project, loopback Firestore Emulator `127.0.0.1:18081`, verified db project and explicit enabled flag, synthetic-only IDs. Proof stores a *synthetic* SHA256 legacy ledger entry and private owner request/day links atomically, tests double reserve across days, injected commit failure rollback, malformed link, foreign UID, missing ledger, legacy-unindexed state, benign synthetic finish. No real quota/money reservation, prompt, tokens, receipt leak, provider call, or production index.
- Optional smoke creates fresh random synthetic UID/requestId and cleans up only the three resulting synthetic docs. Never delete real billing ledgers or restart running emulator.
- **STATUS B2.2-A = PATCH_PREPARED**, user LOCAL_APPLIED/UNIT_PASS/EMULATOR_PASS **UNCONFIRMED**. B2.2-B production integration NOT STARTED. Retention approvals and PG-04 consent-fence blocker remain open.

**First next action on user's Linux:** apply patch by verified SHA256; run the 19 new in-memory unit tests and syntax checks. Only on user PASS run synthetic demo smoke on verified localhost Firebase Emulators. Then update tracker issue #136, master and latest status with exact user evidence; no preemptive acceptance.
