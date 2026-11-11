# AI-01K staging incident — Consent App Check replay acceptance

**2026-11-11 | OPEN / SECURITY STOP | draft remediation in PR #59 | not deployed**

## Fixed source and surface

- Code base: `e9034834be43c22e2de2a547a0c63f6eabe721fe`, Draft PR #58; branch `work/reflect-ai01k-owner-context-preview-2026-11-11`.
- Staging API: `reflect-ai-railway-staging` / `staging` / `reflect-ai-api` at `https://reflect-ai-api-staging.up.railway.app`.
- Staging Hosting: `reflect-ai-staging.web.app`. **No production, Firebase Rules, secrets, or provider-dispatch changes.**
- App Check token provenance: browser `getLimitedUseToken(appCheckClient)`; runtime `firebase-admin@13.4.0`.
- Runtime verification: `getAppCheck(app).verifyToken(token, { consume: true })`. The Consent HTTP listener accepts **only** `alreadyConsumed === false`.

## Verified observations

1. Live **`/v1/ai/diagnostics`** owner-run security test: `PASS 3/3` for unsigned denial, signed acceptance and same-App-Check-header replay denial. Its Railway proxy HTTP sequence at 2026-11-11 15:39 UTC was `401 → 200 → 401`.
2. Live **`/v1/privacy/context-consent`** owner-run audit: `FAIL consent-audit-unavailable`. Its Railway proxy HTTP sequence at 15:40:12–15:40:14 UTC was **`401 → 200 → 200`**, while the third replay **must** be `401`. The browser audit passes the **same `signed` headers object** to the second and third requests; the fourth unknown-ID no-op revoke was not attempted.
3. Railway proxy logs do not include tokens or request bodies, so the logs alone do not independently prove token identity. The source code establishes intended header reuse; the observed 200 on the third POST is a **critical mismatch** that must not be waived or hidden by changing expected test codes.
4. Before this failure, owner-signed synthetic-only Context Preview passed: 4 turns out of a 5-turn test session (84 UTF-8 bytes, ordered turns 02–05); owner-only local composition confirmation; successful grant revoke and list readback cleared preview text. Those successes do **not** compensate for the replay mismatch.
5. Containment: on Railway staging **only**, `REFLECT_CONTEXT_PREVIEW_API_ENABLED=no` redeployed to `422b8bf2-5c37-4278-bfb0-e061f75f7e2c` (SUCCESS, Online 1/1). Owner ran `POST /v1/privacy/context-preview` with staging Origin: **404** on 2026-11-11. Railway proxy log independently records a post-rollback `404` at 15:46:01 UTC. **Consent API remains enabled**, but users must not issue new grants until review. Staging Hosting still renders the Preview UI but its API is OFF.

## Existing code and tests checked

- `server/railway/index.cjs`: `verifyAppCheck = token => getAppCheck(app).verifyToken(token, { consume: true })`.
- `server/privacy/contextConsentHttp.cjs`: first-use check `check?.alreadyConsumed !== false` refuses.
- `src/api/stagingConsentEndpointAudit.js`: reuses the exact signed header object on replay; failure is reported with safe `consent-audit-unavailable`.
- `src/api/stagingConsentEndpointAudit.test.js`: mocks replay with 401; this tests **contract expectation**, not live Firebase consumption.
- `server/privacy/contextConsentHttp.test.cjs`: rejects injected `alreadyConsumed:true` or missing marker. It does not prove live Firebase returns the correct marker.

Firebase reference: https://firebase.google.com/docs/app-check/custom-resource-backend — `consume:true` first-use then `alreadyConsumed:true` for a repeat; requires the service account's Firebase App Check Token Verifier role. Role status has **not** been independently read.

## Root-cause candidates — NOT confirmed

1. Firebase App Check backend consumption semantics, SDK behavior, permission, or service-account-specific configuration during the Consent call.
2. Browser/runtime request divergence despite identical source-level header object.
3. An eventual-consistency or transport edge case. No evidence yet to assert this is the cause.

Do **not** change the browser test to accept 200 on replay; do **not** merge or re-enable Context Preview based solely on passing unit tests.

## Candidate mitigation implemented on separate Draft branch (not deployed)

- Added `server/railway/appCheckReplayGuard.cjs`: a staging-project-only Firestore **atomic transaction** ledger keyed by SHA-256 of a cryptographically signed token. Stores only schema/version and creation/expiry timestamps; never token, UID, transcript, request headers or response content.
- Wired the guard centrally into the existing `verifyAppCheck` function in `server/railway/index.cjs` **after** Firebase Admin `verifyToken(token, {consume:true})`. All AI diagnostics, consent, and preview routes share the same replay ledger. First use succeeds; repeating the same token returns `alreadyConsumed:true` and causes the existing endpoint to reject it. The AI listener also now requires the **explicit** first-use marker (`alreadyConsumed === false`). The Firebase primary verification remains mandatory.
- Added `server/railway/appCheckReplayGuard.test.cjs` and CI contract entry covering sequential and concurrent synthetic replay, independent tokens, malformed claims, staging-only scope and fail-closed Firestore outages. Local isolated mock transaction tests initially passed 6/6; after adding free-tier cleanup, current exact-head GitHub CI and emulator results must be rechecked.
- **Spark plan cost gate:** Google documents that managed Firestore TTL deletes require billing; **do not enable Blaze or paid TTL** as an implicit prerequisite. The draft now implements a **bounded opportunistic cleanup**: approximately 1 in 16 verified new tokens prunes up to 64 records whose JWT expiration was more than 10 minutes ago, using standard Firestore queries and batch deletions. Cleanup failures never authorize a reused token; successful cleanup is not required for immediate replay safety. Idle periods can retain expired records until the next cleanup; monitor storage and free-tier reads/writes/deletes. This is a staging-scale retention strategy, not a general production capacity guarantee.
- **Release blockers:** (1) validate the Firestore cleanup query against the emulator and confirm the Spark no-cost usage budget, without enabling billing; (2) real synthetic concurrent transaction test; (3) verify service-account privileges and review latency; (4) owner approval for staging-only code deployment followed by 401 replay HTTP checks; (5) Context Preview remains OFF until signed security acceptance. No production or Rules changes.
- Backend replay mismatch cause remains **unknown**. This is defense-in-depth, not proof the Firebase SDK or service account behaved incorrectly. No added credentials or paid provider call.

## Safe fix/acceptance plan

1. Obtain reproducible **status-only** evidence with an isolated opt-in staging test. No bearer/App Check tokens, UID, session transcript, raw request bodies, token hashes, or credentials in UI/console/logs. Distinguish direct provider `alreadyConsumed` status from API routing behavior. Never issue grant or call Grok in this diagnostic.
2. If provider consumption is not consistently single-use, implement an **independent, atomic, cross-replica server-side replay guard** for Context Consent and Preview before grant/list/revoke or privileged history read; use a server-private data structure, fail closed on conflicts/Firestore outages, avoid plaintext tokens, and explicitly review retention, growth and Firestore cost. Changes and tests must be reviewed **before any staging rollout**. No production or Firebase Rules modification.
3. Add deterministic tests for sequential and concurrent same-token submissions, same-token crossing Consent/Preview routes, revoked grant source, account/entitlement boundaries and fail-closed storage errors. Keep CI green on exact head.
4. Re-evaluate security with the signed owner staging browser and a **synthetic-only session**: anonymous `401`, foreign Origin `403`, valid first-use `200`, same App Check replay `401`, post-revoke direct preview deny, no unwanted paid provider calls, no real records.
5. Require separate owner **GO** before re-enabling `REFLECT_CONTEXT_PREVIEW_API_ENABLED=yes` and releasing any replacement Hosting. Keep AI-01K and triage PRs Draft until live acceptance.

**Current status:** rollback accepted. Replay issue unresolved. This file tracks an **unreleased draft mitigation**, not a deployed or accepted fix.
