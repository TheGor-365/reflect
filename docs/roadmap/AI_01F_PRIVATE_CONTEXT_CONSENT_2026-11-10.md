# Reflect 2.0 — AI-01F: private, expiring per-session context consent
**2026-11-10 | Draft PR | IMPLEMENTATION-CONTRACT ONLY | NO STAGING DEPLOY**

## Baseline and evidence
- Owner confirmed on current isolated Firebase Hosting staging that AI Settings `responseDepth=deep` persists across refresh and `view=aiSettings` remains selected (owner screenshot and explicit report, 2026-11-10). This accepts UX-01E/UX-01F for that owner; other-account QA is still open.
- Frontend staging was deployed from SHA `8431378b7f51b8b9807a0e03456fd893d85b91f4` with `firebase deploy --config firebase.staging.json --project reflect-ai-staging --only hosting`; Firebase Rules, Railway API and production were not touched by that deploy.
- Existing `server/ai/policy.cjs` accepts only explicit `consent: {granted:true, version:'2026-11-07', scope:'one-message'}`. It rejects older session messages and arbitrary historical context. Keep it unchanged.
- Current staging Firestore Rules (`server/hosted/firestore.rules`) have a broad owner-scoped `/artifacts/{appNamespace}/users/{uid}/{document=**}` allowance. This is suitable for the *owner* to read/write their own documents, **not** a trustworthy source of server authorization for an AI request. Private root `/_reflectAiPrivate/{document=**}` is denied to the browser.
- Product intent: historical context is separately approved per source; no global diary/sessions permission.

## Contract implemented (not integrated)
`server/privacy/contextConsent.cjs` is a Node.js server-only contract. No imports by the Railway router, hosted AI handler, React app, or background jobs.

1. Trusted server principal must assert **staging project**, verified Auth UID and signed App Check. This function takes a server-supplied verified principal; **never** deserialize `appCheckVerified` from an untrusted request as a security assertion.
2. The only grantable scope is `session-turns` for one existing account-owned `sessions/{sessionId}` document. No diary, goals, profile, all-history, partial Firestore path or arbitrary provider prompt can be supplied.
3. The command has strictly allowlisted fields; grant ID is unique and becomes an immutable private tombstone after revoke/expiry. Stale or cross-source replay cannot re-enable it.
4. Issue/revoke uses an Admin Firestore transaction under `/_reflectAiPrivate/reflect-8fdc8/contextGrants/{uid}/grants/{grantId}` and checks existence of exactly one owning session without reading or returning its content.
5. Maximum access period is **15 minutes** from server clock; a read authorization uses a fresh private server get with strict UID/scope/source/grant/version/expiry/revoke checks. Missing, malformed, expired, revoked, mismatched or failed read is **DENY**. No browser direct access.
6. No AI provider request, history fetch, history transmission, new public collection, Firestore Rules publication, entitlement mutation or state migration. The response contains only status and expiry, not user IDs or content.

## Critical restrictions before connecting this contract
- Implement a **separate, disabled-by-default** HTTP endpoint on the STAGING Railway backend. Require verified Firebase Auth token (including revocation), consumed App Check, exact appId/Origin, active server-side account entitlement, a bounded request body and abuse protection, before ever constructing the trusted principal.
- Validate the selected source in a server-owned Firestore transaction. Add race/idempotency and multi-device tests against the actual Firebase emulator for grant → use → revoke. Verify browser SDK **cannot** write or read `_reflectAiPrivate` and other UIDs' data.
- For any AI history read, enforce current owner, explicit per-request consent and exact source scope again **immediately before retrieval and dispatch**. Require the user to preview what may go to the provider. Never infer access from AI Settings or an existence-only grant record.
- Decide how to bound historical turns (turn count/bytes), redact sensitive data, handle deleted source/changed ownership, audit consent without storing content, enforce revocation on queued/in-flight jobs, and implement export/delete of grants + derived data.
- Confirm effective deployed Firestore Rules and server service-account project, not solely the repository Rules file. Do not deploy Rules changes as a side effect of UI/CI work.
- The existing one-message-only Grok contract remains the only authorized real AI input. Do not increase paid request context without a separate cost and privacy sign-off.

## Acceptance and current stop
- Unit tests: malformed principals, arbitrary extra keys, broad scopes, wrong user, missing session, expiry, revocation, immutable replay, Firestore outage fail-closed.
- CI job: `Reflect AI-01F private context consent contract`, Node.js 22, **no external secrets** or paid calls; explicitly asserts the module is not wired into active source.
- Status: Draft security infrastructure; **NOT an active grant feature**. No production, Rules, Railway, Hosting or main modification.
- Next independent task after successful CI: owner-approved design/review of an authenticated staging-only consent endpoint, followed by emulator Rules/read tests, before a live UI or paid AI history integration.
