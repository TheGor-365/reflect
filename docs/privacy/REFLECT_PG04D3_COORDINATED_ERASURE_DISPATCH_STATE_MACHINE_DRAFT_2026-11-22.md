# Reflect 2.0 — PG-04D3 coordinated erasure / in-flight provider-dispatch state machine
Date: 2026-11-22. **DESIGN DRAFT ONLY, NOT A PATCH, NOT APPROVED FOR DEPLOYMENT.**

## Exact predecessor gates
- PG04C actual user-local staging-consent dual-fence Firestore Emulator 6/6 PASS, exact synthetic cleanup; real `contextConsent.cjs` source patch exists only on user's dirty detached backend.
- PG04D0 current OFF historical-context structural regressions user 8/8 PASS; `hostedHandler.cjs` still passes `null` as historical context argument.
- PG04D1 separate synthetic owner-lease model user Node 29/29 PASS; NOT imported by real writer.
- PG04D2 exact three-file user archive audited; actual demo `memoryErasure.r103c2b.cjs` `prepare` creates paired fences without lease check, `cancelPending` deletes them without invalidating old leases, `confirm/step` do not account for in-flight HTTP. D1 `requestErasure` attempts to create same private fence path but incompatible schema.
- PG04D2 user locally installed diagnostic patch; guard **8/8 PASS** including actual three source hashes. User detected `127.0.0.1:18081` **OCCUPIED** and stopped. **0/6 real PG04D2 Emulator scenarios ran**, no diagnostics accepted.

## Security property / scope
We must NOT assert `no HTTP send after user clicked erase` solely based on a Firestore TX. An external provider POST cannot participate in a Firestore transaction: a TX may mark a lease `dispatch-started` before erasure intent and the network call could start afterward. The achievable conservative contract is:
1. After an erasure intent TX commits, **no new admission and no previously reserved-but-not-started dispatch may begin**.
2. Already-started/in-flight provider requests are **explicitly accounted for**. A provisional erasure request does not mean completed or effective erasure.
3. Actual memory-only erasure may reach a **scoped effective/completed** state only when all active provider dispatches are finished and their outcomes conservatively accounted for, and when deletion and residual checks finish. Any `unknown` in-flight outcome blocks unconditional success/closure unless separately reviewed.
4. No silent resurrection: canceling an erasure request cannot authorize pre-erasure leases, consents, preview hashes or context snapshots.
5. Owner UID, sourceId, immutable event head, requestId, approved preview digest, grant and erasure generation must all match. Fail closed on missing/malformed/partial fences, stale generation, session source mismatch, errors, foreign UID.
6. This design still cannot delete historical data already transmitted to a provider; provider retention/DSR separately requires explicit policy. It does not mean whole-account erasure.

## Current actual local writer contract (from uploaded bytes)
`server/privacy/memoryErasure.r103c2b.cjs` uses DEMO project `demo-reflect-auth-qa`, host `127.0.0.1:18081`. `prepare` line 109–129: transactional read both owner fence docs and `tx.create` public `{schemaVersion:1,ownerId:uid,state:"erasure-fenced"}` and private `{ownerId,scope,status:"pending",nonceHash,createdAtMs,expiresAtMs,completedAtMs,steps,totalDeleted,totalRevoked}`. **This writer must own the erasure fence schema**, not the D1 toy. `cancelPending` lines 136–162 deletes both fences once status pending/zero steps, no cross-check with leases or monotonically increasing generation. `confirm` and `step` lines 196–320 check independent gate callbacks outside their state-changing transaction and delete only 3 memory collections; `complete` is not global deletion.

## Proposed single-writer coordinator (new design; NOT in source)
Paths are illustrative pending threat/Rules audit; do not materialize into production:
- `_reflectAiPrivate/reflect-8fdc8/providerDispatchOwners/{uid}`: `schemaVersion`, `ownerId`, `generation` (monotonic), `phase`, `activeCount`, `erasureIntentId`, `updatedAtMs`; phase `open|erasure-requested|draining|eligible-to-erase|erasing|complete`.
- `.../providerDispatchOwners/{uid}/leases/{leaseId}`: immutable `uid, requestId, sourceId, sourceRevision, previewDigest, grantId, generation`; state `reserved|dispatch-started|settled|settled-unknown|invalidated`, time metadata and *no prompt/provider response*.
- Existing `memoryErasureFences/{uid}` and public `memoryControl/erasure` remain owned by memoryErasure with exact source schema; never let separate D1 requestErasure create or delete these.

## Transactional operations / invariants
**A. Admit**: authenticated server-only eligibility and source provenance checks are separate prerequisites. In one Firestore transaction read owner coordinator, both fences, scoped grant, source/approved digest, exact lease id; require phase open, zero fences, current generation, capacity. Write lease and increment activeCount in same transaction. Idempotency: replay returns same response without a second dispatch or quota credit; collision errors never overwrite. Any missing coordinator migration must be versioned and explicit.

**B. Begin dispatch**: transactionally read coordinator generation and both fences, check reserved lease matches source/grant and phase=open; mark `dispatch-started`, reserve billing exactly once via preexisting budget/receipt path. Immediately after commit, execute only a **fake transport in QA**. There is a finite gap before HTTP; erasure may commit during gap. Therefore no unconditional invariant that erasure REQUEST instantly prevents an already-started/authorized HTTP call. If product policy requires zero new sends after request, additional outbound gateway/fencing mechanism is required and must be tested independently.

**C. Prepare erasure**: in a single transaction read owner coordinator plus both fences and appropriate permission/nonce preconditions, bump `generation`, set `erasure-requested` / `draining` and create paired fences with the **actual writer schema**. No fresh admit/begin can succeed after this transaction. Active count represents reserved and dispatch-started tasks; stale leases from earlier generation are invalid and remain auditable. New coordinator state persists throughout cancellation/retry; no lost-generation reset.

**D. Cancel pending erasure**: only with fresh owner principal, still pending and no deletion/revoke/confirmation; must in same transaction (i) verify correct existing intent, (ii) reject or invalidate all previous-generation reserved leases and existing consents, (iii) advance generation and reset coordination safely, (iv) then delete paired fences. If in-flight `dispatch-started` or `settled-unknown` cannot be resolved, **DENY cancellation**, or require a separately documented explicit policy; do not silently drop count. A simple `tx.delete(fence)` (current writer behavior) is unsafe for future integration.

**E. Settle dispatch**: after verified in-process fake/real provider completion, decrement activeCount **exactly once**, retain durable unknown outcome record and billing reserve/idempotency. If outcome is unknown, don't auto-retry or treat timeout as no charge. No TTL-driven disappearance of leases. Guard against re-entrant settlement and foreign UID.

**F. Confirm/step erasure**: refuse transitioning to effective erasure/deletion when any active/unknown in-flight work remains. The same owner-coordinator and fence status must be read as transactional inputs alongside the real writer's revocation/deletion transitions. Only a lease-free `eligible-to-erase` state permits three-collection deletion; nested descendant coverage and backups/provider copies remain separate audits. Do not call `dispatches-drained` data erasure.

**G. Migration/rollout**: all old Railway workers (which don't enforce lease coordination) must be fenced OFF before enabling history or erasure-effective feature. One mixed old+new replica can violate claimed gate. Feature flags default OFF; explicit reviewed code diff/CI/Emulator/owner smoke/rollback/sign-off required. Do not push to actual source based only on this document.

## PG04D3 proposed acceptance matrix — not yet run
- State-model unit: admit vs prepare race, prepare vs begin race, duplicate/foreign grants, count capacity, idempotent settlement, malformed/partial legacy fences, cancel-after-prepare, unknown in-flight, stale generation, crash between dispatch start and fake transport, failed commit rollback.
- Real isolated Firestore Emulator on a **free** exact separately guarded port with dedicated synthetic UID and exact fixture cleanup: forced contention/barriers where possible; two concurrent admissions/cancel/erase/settle; no early `eligible-to-erase`; real writer schema preserved; fail on any stale lease reactivation.
- Fake network transport spy/deferred promise; **no xAI transport, no billable requests**. Record allowed event ordering, including race where POST may begin after erasure request but before effective erasure. This should be reported, not hidden by an always-green test.
- Full `contextConsent.cjs` PG04B authorization and MemoryErasure source review, staged Rules/Admin/owner switching, real billing idempotency, quarantine legacy unknown states, provider/backup/retention and independent erasure review.
- Passing model tests alone does not authorize a true source rewrite; at minimum PG04D2 diagnostic real Emulator and source-level preflight must complete, plus separate approval for edits to the actual dirty erasure writer.

## Immediate safe next step
Run **read-only** `ss -H -ltnp '( sport = :18081 )'` to identify current port owner (do not kill it); then decide an approved free window to run already-installed PG04D2 real Emulator diagnostics. In parallel continue this D3 protocol review; no code edits or real data deletes. Status `PG04D3=DOCUMENT_DESIGN_DRAFT`, no patch/Emulator acceptance, historical context OFF.

Open dependencies: R10.3-C2C2-B2.1 private writer census PARTIAL, B2.2 indexed billing source integration NOT ACCEPTED, B2.3 retention provider/backups unapproved, PG01–08 privacy overall open, R10.4 context orchestrator not enabled.
