# Reflect 2.0 — PG-04D2 / actual local erasure-writer source review + Firestore Emulator fake-transport race plan
Date: 2026-11-22. **SOURCE_PREFLIGHT / TEST DESIGN ONLY**. No PG-04D2 code or Emulator integration patch prepared; no provider, Railway, cloud Firestore or staging deployment.

## Verified prerequisites on user's actual Linux
- Local dirty repo `~/reflect-r10-railway-review`, detached HEAD `1c4c121e` with ASDF Node `22.23.4`.
- **PG04C:** real Admin Firestore Emulator `127.0.0.1:19085`, exact six tests PASS, exact synthetic cleanup PASS, exit 0, no real provider.
- **PG04D0:** checksum-verified additive patch applied, source no-context regression **8/8 PASS**, `node --check` and `git diff --check` clean.
- **PG04D1:** initially patch not found, then downloaded and verified; user terminal `PASS: PG-04D1 установлен`, real local `node --test server/privacy/demoDispatchLease.pg04d1.test.cjs` **29/29 PASS**, syntax and `git diff --check` clean (~123ms). No Emulator used for D1; model is `demo-reflect-auth-qa`/synthetic-only, not connected to the actual erasure writer or hosted provider.
- The D1 model's owner coordinator uses `open`/`erasure-pending`/`dispatches-drained` and counted `reserved`/`dispatch-started`/`closed`/`closed-unknown`. Its `markDispatchStarted` transaction is NOT atomic with external HTTP transport; a delayed transport can race with erasure.

## Critical unknown source (DO NOT infer from pinned remote)
1. `server/privacy/memoryErasure.r103c2b.cjs` is user-local and **not in pinned GitHub commit**. Earlier user `rg` established actual path strings and public state `erasure-fenced`, but not the entire current preconditions, transaction order, callbacks, finish/abort handling or conflict retry semantics.
2. `server/privacy/demoMemoryConsentAdmission.r103c2b2.cjs` is another user-local demo guard. Its local `fencePath` was established; its complete interaction with erasure writer still needs inspection.
3. `server/railway/index.cjs` may be dirty and contains current endpoint wiring, feature switches and provider transport callsites; pinned GitHub source may not reflect current local changes. Treat it as potentially sensitive configuration; **source file inspection only with user's explicit selection**, not request to publish secrets.
4. Any user-local `server/memory/` authorizer, preview/consented-context source, or imported helper paths must be enumerated first. Do not assume filenames or signatures. The pinned `hostedHandler.cjs` still passes NULL as historical context. The user should NOT change it for PG04D2.

## Required read-only source collection — minimal safe scope
From `~/reflect-r10-railway-review`:
```bash
git status --short -- server/privacy/memoryErasure.r103c2b.cjs server/privacy/demoMemoryConsentAdmission.r103c2b2.cjs server/railway/index.cjs server/privacy/contextConsent.cjs server/privacy/demoDispatchLease.pg04d1.cjs
rg -n --glob '*.cjs' 'memoryErasureFences|memoryControl/erasure|verifyConsentCreationFence|requestErasure|providerDispatchAllowed|consentedContext|\.invoke\(|transport\(' server/privacy server/memory server/railway 2>/dev/null | head -180
wc -l server/privacy/memoryErasure.r103c2b.cjs server/privacy/demoMemoryConsentAdmission.r103c2b2.cjs server/railway/index.cjs
```
If line-numbered matches are insufficient for a precise patch, ask the user to upload only the relevant source code files after **locally reviewing them for hardcoded credentials and personal data**. Do NOT request .env, credentials, tokens, Firebase service accounts, user snapshots or databases. Do not assume a GitHub docs-only write updates the local repo.

## Proposed PG04D2 test suite — acceptance contracts (not yet implemented)
### T1: source and environment gate
- Local synthetic Firestore Emulator only, **dedicated new localhost port** (suggested 19086; check availability), explicit opt-in, exact fixture project, `FIRESTORE_EMULATOR_HOST` verified, no fallback to real cloud; `env -u FIREBASE_CONFIG` on Firebase CLI child if project JSON injects databaseURL. No credentials.
- Only per-run random synthetic owner, session, grant, fence, coordinator and lease paths; **no root/collection recursiveDelete**, all exact fixture refs tracked for cleanup.
- Validate actual Admin SDK `Transaction.get` and erasure-writer behavior; fail before writes on an incompatible SDK/guard.

### T2: transactional invariants
- Two independent concurrent admissions for the same owner cannot both bypass lease capacity; no double-count or duplicate leaseId.
- Erasure-first blocks subsequent admissions and a not-yet-started lease, leaving no pending provider egress.
- Grant/admit-first followed by erasure cannot leave a **usable** permission after fence; fixture exact cleanup occurs.
- Any preexisting private-only/public-only/mismatched fence denies, without auto-repair.
- Owner A cannot operate owner B's lease, grant, fence or session.

### T3: fake provider dispatch/erasure (no real network)
- Fake transport is a spy/deferred Promise, NOT xAI transport. Count dispatch invocations and timestamps/order. If erasure is already effective, count must remain zero.
- A dispatch already potentially started before erasure REQUEST cannot be un-sent; erasure effective state must wait for settled or conservatively accounted active in-flight lease. An unknown provider outcome must remain explicit; no free retry/refund.
- Check true concurrency with transaction barrier(s) and forced contention, not merely serial mock call order. Document acceptable observed Firestore commit orders; never invent deterministic winner.
- A mere `consent.check() -> transport()` without shared erasure/lease synchronization is a **known unsafe TOCTOU**, not a passing criterion.

### T4: integration boundaries
- Existing true erasure writer must own the real private/public fences, and its transaction must coordinate with owner dispatch intent (or explicitly fail closed). Do **not** copy the D1 synthetic writer into the real memory erasure path.
- Test real locally patched `contextConsent.cjs` + actual erasure writer and a separate fake transport adapter; do not enable history in `hostedHandler.cjs`, import the D1 toy from Railway, or change billing writer.
- Distinguish `dispatches-drained` from `memory-erasure-complete`; validate deletion of only memory-derived content against full retained billing/receipts exclusions. No global erasure claims without a retention policy.

## Non-negotiable blockers
- Full B2.1 private writer inventory remains incomplete, B2.3 retention/ledger/index policy unapproved, PG-04D true provider-egress TOCTOU not closed, mixed-version Railway rollout not validated.
- Staging historical context **OFF**. No live provider calls, paid services, actual end-user account erasures, production deployment, or remote backend source changes.
- PG04D2=SOURCE_REVIEW_PENDING; Emulator suite=NOT_STARTED. **Next evidence is exact current source**, not re-running PG04D1 tests.
