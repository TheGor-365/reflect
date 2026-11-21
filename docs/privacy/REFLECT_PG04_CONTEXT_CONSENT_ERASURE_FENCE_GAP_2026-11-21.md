# REFLECT 2.0 — PG-04 / contextConsent erasure-fence closure plan
Date: 2026-11-21. **Status: CODE-GAP CONFIRMED IN PINNED SOURCE / IMPLEMENTATION NOT STARTED**.
Review scope: read-only audited `server/privacy/contextConsent.cjs` pinned at `1c4c121e0e449f1a9360e4fb4588dcf58352e699` (file blob `fa80e33005a4866796713274910b6af335f5740f`) and existing `contextConsent.test.cjs`. Dirty user-local backend and erasure workflow must be read before patch. No deploy/provider use.

## Verified code defect
- `createContextConsentStore({db,projectId,clock})` accepts only `reflect-ai-staging`; its comment explicitly says **NO HTTP route and NO automatic provider invocation**.
- `execute` grant: current `db.runTransaction` reads the grant record, owner session and per-UID day quota, then writes quota and grant. **It never reads private nor public memory erasure fence.**
- `check`: a non-transactional `grantRef.get()` and `isActiveContextGrant`; no fence reads. It returns `false` on Firestore errors but could return `true` for a grant whose owner was erased.
- `list`: bounded `where(status == active).limit(100)`, denies truncation but never reads fence; may advertise stale grants. `revoke` is idempotent and should remain available to remove permissions even when fenced.
- Current grant TTL 15 minutes and quota max 12/day are **not erasure controls**. Existing tests include owner verification, replay/expiry, quotas, stale grants and outage, but do not establish erasure-fence correctness.

## Candidate source-of-truth paths (verify LOCAL code first)
Proposed private fence `_reflectAiPrivate/reflect-8fdc8/memoryErasureFences/{uid}` and public fence `artifacts/reflect-8fdc8/users/{uid}/memoryControl/erasure`, both owner-scoped. These paths are grounded in previously delivered C2C2-B1 synthetic retention patch, **not automatically proof of the current untracked local erasure writer schema**. Private/public legacy states include private-only, public-only, mismatched, paired pending/complete. Any present, malformed, unavailable or ambiguous fence must deny new grants and provider authorization, **never auto-repair**.

## Required fail-closed source contract (not executable patch)
1. Maintain existing externally verified Auth + *consumable* App Check and entitlement/source access gate. Never accept UID, fence path or erasure override from client.
2. For `grant execute()`, within the EXISTING Firestore transaction, `tx.get` BOTH owner private/public fences BEFORE ANY quota/grant write; any fence present or invalid denies. Ideally group with grant/session/quota reads, all before writes, and preserve the original grant-id replay and daily cap semantics. An erasure transaction writing the same fence docs must conflict with a concurrent grant transaction; prove this with a real synthetic Firestore Emulator race test, not only a serial mock.
3. For `check()` use a **consistent transactional read** of BOTH fences + grant, fail closed on errors and fence presence. Must re-check at every authorized provider egress boundary, not cache or rely only on earlier grant issuance. A check that succeeded just before a later erasure can still race with provider invocation; record this as an explicit unresolved TOCTOU safety gate until the whole pipeline is verified.
4. For `list()`, read both fences and bounded grants from one appropriate server-consistent view, deny or return an empty *non-authorizing* list if fenced; never leak raw session text/UID or claim full grant inventory at the `limit(100)` boundary. Must verify Firestore SDK and test fixture support for transactional query reads.
5. `revoke()` stays possible (idempotent, owner-verified) after erasure fence is set; do not issue any new grant or quota refund.
6. Private/public fence absent is not a proof of no historical deletion if provenance was lost. Treat malformed partial legacy fence conservatively and track in the B2.1 inventory.
7. Never loosen existing App Check replay, entitlement, request size, 15min TTL, 12/day counter, or any billing/ID ledger guarantees.

## Negative tests required
- Fence private-only, public-only, both, malformed/mismatched; deny new grant, `check` permission and `list` advertisement.
- Existing active grant followed by erasure fence; both `check` and `list` deny even before TTL expiry.
- Grant transaction concurrent with erasure transaction: prove no committed active grant after fence, using actual Firestore Emulator retry/conflict behavior.
- `check`/provider-boundary read concurrent with erasure; ensure no provider context egress after owner fence (whole-flow test, not merely isolated consent module).
- Read outage/unavailable/missing provenance fails closed; cross-owner grant/UID isolation; no hidden permission if only one fence exists.
- Revoke remains idempotent after fence; reused grantId never resurrects; daily quota never refunded; live session missing rejects.
- Existing 39-unit regression and real B1b3 billing mirror remain unaffected.

## Safe sequencing
1. Confirm user local erasure writer path/shape and whether consent source remains unchanged; **READ-ONLY**, do not send identity or secrets.
2. Implement PG04 candidate + new negative tests in an isolated/review-only file or local patch, and validate existing consent tests first; avoid exporting provider enablement.
3. Run actual localhost synthetic Emulator race tests before reviewing staging wiring. **Only then** consider a separately authorized source change/rollout with mixed-version and runtime-fence defenses.

## Decision gates
`PG04_CODE_GAP=CONFIRMED`; `PG04_SOLUTION=DESIGN_DRAFT`; `PG04_SOURCE_PATCH=NOT_STARTED`; `PG04_REAL_EMULATOR_RACE=NOT_RUN`; `PG04_PROVIDER_CONTEXT_EGRESS=BLOCKED`.

## 2026-11-21 follow-up: local fence paths VERIFIED; synthetic PG-04A candidate prepared
- User local `git diff -- server/privacy/contextConsent.cjs` empty. `rg` confirms `memoryErasure.r103c2b.cjs` private `_reflectAiPrivate/${NAMESPACE}/memoryErasureFences/${uid}`, public `artifacts/${NAMESPACE}/users/${uid}/memoryControl/erasure` and public `state:"erasure-fenced"`; `demoMemoryConsentAdmission.r103c2b2.cjs` uses same private path. These source files are **untracked synthetic erasure modules**, NOT proof of the actual deployed writer.
- Isolated, non-imported, **new-file-only PG-04A prototype** `REFLECT_PG04A_DUAL_FENCE_CONSENT_DEMO_2026-11-21.patch`, SHA256 `5d406acb32e90f2378596e194388ee2280e3a5c93f5d1ead28c1f9b99ccb2d65`. Adds `server/privacy/demoConsentFencePg04a.{cjs,test.cjs}` and `docs/privacy/REFLECT_PG04A_DEMO_DUAL_FENCE_CONSENT_PROOF.md`. Author in-memory 20/20 Node tests PASS, fresh patch apply/syntax PASS, user Linux QA PENDING. It demonstrates transaction pre-write BOTH fences, fail-closed `check`/`list`, and `revoke` after fence, but does **NOT** alter actual `contextConsent.cjs` or prove real Firestore concurrent grant-vs-erasure transactions.
- PG-04 `SOURCE_PATCH=NOT_STARTED`; provider-memory egress BLOCKED. The next stage after user QA must target the actual staging writer with fresh baseline tests and dedicated local Emulator concurrency, provider-boundary TOCTOU checks, plus B2.3 retention policy decisions before staged activation.
