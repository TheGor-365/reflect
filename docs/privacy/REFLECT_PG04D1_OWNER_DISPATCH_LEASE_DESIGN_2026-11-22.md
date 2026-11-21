# Reflect 2.0 — PG-04D1 synthetic owner erasure intent + in-flight dispatch lease design
2026-11-22 • **DESIGN + LOCAL TEST PATCH PREPARED; USER APPLY/QA PENDING; NON-DEPLOYABLE**

## Previous verified milestone
User Linux `~/reflect-r10-railway-review` detached `1c4c121e` / Node 22.23.4: checksum-gated `REFLECT_PG04D0_OFF_EGRESS_REGRESSION_2026-11-22.patch` successfully installed; `node --test server/privacy/providerEgressOff.pg04d0.test.cjs` **8/8 PASS**, syntax and `git diff --check` no errors. Baseline asserts `hostedHandler.cjs` invokes provider with third argument `null` and preview refuses dispatch. This is an OFF safety regression only, not history-send race safety. PG04C actual isolated Firestore Emulator previously **6/6 PASS + exact synthetic cleanup**.

## Prepared PG04D1 artifact
`REFLECT_PG04D1_SYNTHETIC_DISPATCH_LEASE_2026-11-22.patch` SHA256 `3d2b904b7d32ea71bd13fb187b002a989cc11a17c5b33341c169dbbb253d8e40`, delivered in original ChatGPT conversation, **NOT a backend source commit**. Adds exactly three new unimported files:
- `server/privacy/demoDispatchLease.pg04d1.cjs`
- `server/privacy/demoDispatchLease.pg04d1.test.cjs`
- `docs/privacy/REFLECT_PG04D1_SYNTHETIC_ERASURE_INTENT_DISPATCH_LEASE.md`

Fixture restriction: `enabled:true` explicitly required, `projectId=db.projectId=demo-reflect-auth-qa`, `emulatorHost=127.0.0.1:18081`, synthetic owner/lease IDs prefixed `synthetic-pg04d1-`. **This pure Node in-memory model does not actually open an emulator connection**; these values are anti-deployment guards. No Firebase Admin, xAI, provider transport, real account, live staging, real billing or Railway import.

## State machine
One private synthetic owner coordinator doc `demoPg04d1DispatchOwners/{uid}` with `phase:open|erasure-pending|dispatches-drained`, active lease count limited to 4, and generation. Lease docs record `reserved|dispatch-started|closed|closed-unknown`.
- `admit` reads private/public owner erasure fences, coordinator, lease identity inside a single transaction before any write; rejects fence, pending phase, duplicate or over-capacity. It does **NOT** perform actual Auth/App Check/consent/session entitlement: production integration must do that independently.
- `markDispatchStarted` re-reads both fences and coordinator in the same TX, marks reserved lease as started once, denies retry; **no real HTTP transport**.
- `requestErasure` transactionally creates a synthetic paired private/public fence and changes shared coordinator phase to pending/drained. Any preexisting partial fence denies rather than auto-repairs. Real erasure writer must retain ownership of actual fence paths; **never import this toy to the real writer**.
- `settle` can run after fencing; conservatively retains `closed-unknown` for uncertain provider charge; decrements active count exactly once. Only when active count is zero does phase become `dispatches-drained`. This phase is **not a memory-erasure-completed certificate**, no TTL-based automatic expiry/forcible settlement.

## Testing status
Author fresh Node 22.16.0 on isolated files **29/29 PASS**, rerun after fresh `git apply --check` and `git apply --whitespace=error` to empty Git repo **29/29 PASS**; `node --check` both files, `git diff --check` clean; delivery ZIP integrity verified. **User actual Linux apply/test PENDING**. Fake Firestore serial transactions simulate order/rollback but DO NOT prove real concurrent Firestore retries, network dispatch cancellation, timing, distributed lease recovery, or erasure.
A request may start network dispatch after erasure REQUEST while an earlier lease is still in-flight: Firestore transactions cannot atomically include an external HTTP POST. The strongest proposed invariant is no **effective** erasure until all potentially billable in-flight operations are resolved. Unknown outcomes require manual intervention/explicit policy, not a default TTL or retry.

## Next
1. User SHA-check/apply new-file-only patch in dirty local repo; test `node --test server/privacy/demoDispatchLease.pg04d1.test.cjs` (29 expected) + JS syntax and `git diff --check`.
2. After accepted user stdout, **PG04D2** cross-check against user's CURRENT untracked `server/privacy/memoryErasure.r103c2b.cjs` and dirty Railway/memory authorizer; build a separate guarded local Firestore Emulator race suite with FAKE transport only.
3. Before any real history-provider enablement: prove erasure intent coordination and no mixed-version unguarded transports, review full B2.1 private writer census and approve B2.3 retention/legal/backup/provider obligations.

**Never push/replace actual backend billing/consent/erasure code, auto-delete user data, or enable provider context based on PG04D1 unit tests.**