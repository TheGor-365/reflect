# REFLECT 2.0 — PG-04B source-level contextConsent dual erasure fence candidate
Date: 2026-11-21. **Status: LOCAL SOURCE PATCH PREPARED; USER APPLY/QA PENDING; NO STAGING RELEASE**.

## Verified evidence before this step
- User Linux `~/reflect-r10-railway-review` detached HEAD `1c4c121e`, Node 22.23.4. PG-04A checksum-gated additive demo patch applied: terminal `PASS: PG-04A установлен`. `node --test server/privacy/demoConsentFencePg04a.test.cjs` → **20/20 PASS, 0 FAIL**, `node --check` both demo files and `git diff --check` returned no errors.
- User's earlier `git diff -- server/privacy/contextConsent.cjs` empty; exact pinned source blob SHA1 `fa80e33005a4866796713274910b6af335f5740f` at HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699`, confirmed by assistant copying the byte-exact 9664-byte original and verifying `git hash-object`.
- User-local DEMO erasure source proves private `_reflectAiPrivate/reflect-8fdc8/memoryErasureFences/{uid}` and public `artifacts/reflect-8fdc8/users/{uid}/memoryControl/erasure` with public state `erasure-fenced`. This is **not** proof of deployed erasure writer or a complete privacy rollout.

## New source-level patch (not user applied)
**Artifact**: `REFLECT_PG04B_CONTEXT_CONSENT_DUAL_FENCE_SOURCE_2026-11-21.patch`, SHA256 `9131431a39502f2d8df090f1f8e39554e7c3856ca7fd6cc20bc1398caa4aac19`. Delivered in the current ChatGPT conversation, **not** committed to GitHub source or staged.

Exactly four paths:
1. Modifies original `server/privacy/contextConsent.cjs`: both owner private/public markers checked using `tx.get` inside the original `execute(grant)` transaction **before any quota/grant writes**, including replay of an active grant ID. Any present/partial/malformed marker denies; `revoke` stays available.
2. Modifies existing `server/privacy/contextConsent.test.cjs` at **two** assertions/fixtures only: expected missing-session read order now contains both fences; simulated `check()` storage outage overrides `db.runTransaction` because `check` now reads inside a transaction.
3. Adds `server/privacy/contextConsent.pg04b.test.cjs` — 22 new in-memory transaction unit cases for private-only/public-only/malformed/both fences; grant/replay/check/list/revoke/quota, owner isolation and outage.
4. Adds `docs/privacy/REFLECT_PG04B_STAGE_CONSENT_DUAL_FENCE_PATCH_REVIEW.md` documenting limitations.

`check()` now reads both fences plus grant through a consistent `db.runTransaction` and returns false on any error or fence. `list()` does `tx.get(Query)` on the owner-scoped, bounded grants query **in the same transaction** as both fence reads, fails closed and redacts raw Firestore errors. The Admin Firestore API supports Transaction.get(Query), but actual installed SDK/Emulator must still be validated.

Existing UID validation, TTL 15 minutes, grant quota 12/day, replay protection and grant payload unchanged. **No provider, app, Railway, billing writer, Firestore Rules, actual database, ID, real users or deployment modified by assistant.**

## Validation evidence and limitations
Assistant isolated Node 22.16.0:
- New 22 PG-04B tests **22/22 PASS**, twice in source staging / freshly Git-applied copy with byte-exact original `contextConsent.cjs` and minimal PolicyError shim.
- Fresh `git apply --check`, `git apply --whitespace=error`, `node --check` both changed source/new unit test, `git diff --check`, ZIP integrity PASS.
- Existing original `contextConsent.test.cjs` **was NOT fully executed in author container**, because the full original baseline test module was not materialized. Patch's two test hunks use verified exact GitHub source context, but user both-suites test is REQUIRED.
- This in-memory model does **not** prove Firestore's real concurrency conflict between simultaneous erasure and grant, nor end-to-end provider-boundary erasure TOCTOU. Do **not** mark PG-04 complete or activate historical context on these tests alone.

## Next 1–3 actions
1. On user Linux `~/reflect-r10-railway-review`, first confirm `git status --short -- server/privacy/contextConsent.cjs server/privacy/contextConsent.test.cjs` is empty. Download patch; verify exact SHA256; run `git apply --check` and `git apply --whitespace=error` only on clean matching source. **Never overwrite user dirty data.**
2. Run `node --test server/privacy/contextConsent.test.cjs server/privacy/contextConsent.pg04b.test.cjs`; run `node --check` for source/test, `git diff --check`. Report actual user PASS/FAIL, then update status tracker.
3. Prepare **PG-04C isolated Firestore Emulator** real grant-vs-erasure conflict and provider-boundary tests with strict localhost/project guard. No staging release, xAI calls, or real ledger deletion. B2.1 complete private-writer audit and B2.3 legal retention still outstanding.

**Stages:** PG-04A USER_LOCAL_UNIT_PASS 20/20; PG-04B SOURCE_PATCH_PREPARED + AUTHOR_22_UNIT_PASS, USER_QA_PENDING; PG-04C EMULATOR_PENDING; PG-04 PROVIDER_CONTEXT_EGRESS_BLOCKED; B2.3 RETENTION_UNAPPROVED; real staging/prod NOT DEPLOYED.
