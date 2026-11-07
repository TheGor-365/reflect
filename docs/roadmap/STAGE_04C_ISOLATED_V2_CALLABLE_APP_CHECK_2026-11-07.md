# Reflect 2.0 — Stage 04C: isolated Firebase Functions v2 callable and server kill switch

**Date:** 2026-11-07. **Status:** stacked Draft on Stage04B PR #30. The real v2 callable is created **only inside an isolated Firebase Functions emulator**. Nothing is deployed to a live project, no provider/model/secret/payment is installed, and the browser's `AI_SESSION_ENABLED = false` remains unchanged.

## Verified upstream

- Stage04B PR #30, HEAD `00f1265d386b44fe71eee18ac63c2a7e91fe3655`: 16 Stage04A pure Node policy tests and 10 real Admin Firestore integration tests passed, including same-request concurrency and global quota reservation across users. The mock previously had an injected Auth/App Check context rather than a real Callable SDK wrapper.
- Original Test account, two notes and history versions were visible after private Auth/Firestore recovery. The precise original and recovered UID were not independently compared.
- Stage03G user's own export summary: one profile and two notes, no goals/sessions/moods. Legacy rules for those absent collections remain only UID-scoped; do not infer strict schema compatibility.

## Implementation

- `tests/ai-stage04c/functions/index.js`: a genuine Firebase Functions **v2** `onCall` wrapper with `enforceAppCheck:true`. The wrapper checks the SDK-supplied `request.auth.uid` and enforces the exact allowlisted synthetic `request.app.appId="stage04c-emulator-only-app"`, and refuses `request.app.alreadyConsumed===true`, malformed input and unrecognized errors. `request.data.uid`, API keys, history, provider and model parameters are never accepted. All errors returned to clients are generic. **No provider is invoked.**
- **Two independent server kill switches:** the emulator-only environment requires `FUNCTIONS_EMULATOR=true`, the exact demo Auth/Firestore project/ports, `REFLECT_STAGE04C_MOCK_ONLY=yes` and no service-account credentials. Separately, the Admin-owned Firestore document `_reflectStage04B/reflect-8fdc8/runtimeFlags/ai` must have `enabled:true`. If missing or false, no reservation or mock call is possible. The flag is read **inside the same atomic transaction** as per-user quotas, the global budget and the independent request-ID ledger. Runtime flag changes affect *new reservations*, not already accepted in-flight calls.
- `server/ai/firestoreQuota.cjs` recognizes exactly two separate demo environments: existing Stage04B at Auth19098/Firestore19082, and Stage04C at Auth19097/Firestore19083. The Admin SDK client's **actual projectId** must match the selected demo environment. Normal Test Auth9099/Firestore18081, backup18080 and production projects always fail the guard.
- `tests/ai-stage04c/firebase.json`: a standalone functions codebase `tests/ai-stage04c/functions` on Functions19005 with its own disposable Auth19097, Firestore19083, project `demo-reflect-stage04c`. `firestore.rules` denies all direct client access to quota records.
- `server/ai/callable.integration.test.cjs`: real HTTPS calls through the Functions Emulator, using a synthetic Auth Emulator ID token, checking App Check **presence** enforcement, signed-out refusal, disabled-by-default and reenabled server flag, consent, forbidden fields, concurrency/replay, and private Firestore access denial. No owner data is imported. `.github/workflows/reflect-ai-callable-emulator.yml` runs only this self-contained demo alongside the pure Stage04A contract and explicitly confirms the frontend stays disabled.

## App Check and security limitations

**Emulator success does NOT establish real cryptographic App Check verification.** The Firebase Functions emulator relaxes token signature checks: it can accept synthetic/local tokens. The real production Functions SDK performs App Check verification when `enforceAppCheck:true`; a separate secured staging deployment with actual registered app attestation and negative tampering tests is required before production. Never represent synthetic test headers as production-trusted credentials. Firebase Auth in the emulator likewise validates only against emulator behavior, not hosted production signature/expiry/revocation.

`consumeAppCheckToken:false` deliberately avoids promising limited-use replay protection, but the independently persisted request-ID ledger still rejects repeated business requests for the configured retention window. App Check replay protection must be separately evaluated for economics/attestation rates and authenticated clients, and handling of `alreadyConsumed` must not be assumed automatic.

The root of the project has **no active Functions configuration**, no Firebase deployment target, no public model key, and no API provider. This repository stage is not an authorization to deploy. Real data, provider responses and secrets never enter mock storage. Actual money caps need a verified provider tokenizer/pricing and upstream hard spend limits, not estimates or GCP budget alerts.

## Outstanding acceptance gates

1. Exact-head CI must pass both new callable emulator suite and previously established pure/security tests. If a test fails, fix only isolated Draft code, never loosen the actual Auth/App Check requirement.
2. On a **separate secured staging Firebase project** (not the original Test), provision a registered App Check attestation provider and verify real signed token, missing and tampered tokens. Assess Authentication token revocation and Cloud Functions IAM/IAP configuration.
3. Define real provider privacy/retention, data-processing location, legal and financial eligibility, obtain an owner-approved monetary budget and trusted secret. Add provider maximum tokens, timeouts and circuit breaker with usage accounting.
4. Conduct independent security review, client UX consent and opt-in, reversible rollout plan and explicit owner approval before any live endpoint or automatic model calls.

Official docs:
- https://firebase.google.com/docs/app-check/cloud-functions
- https://firebase.google.com/docs/functions/local-emulator
- https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.https.callableoptions
