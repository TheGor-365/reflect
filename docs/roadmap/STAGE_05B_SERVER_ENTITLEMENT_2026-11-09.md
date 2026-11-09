# Reflect Stage05B — private staging entitlement (2026-11-09)

**Status:** code and non-billable tests in Draft PR #37. Not deployed to Railway; not provisioned; not an actual Grok response.

## Why
The Stage04H `REFLECT_AI_ALLOWED_UID` environment variable was an owner-only temporary paid-use gate, not a scalable account policy. Stage05B replaces it **in branch code** with a server-side, revocable, expiring entitlement. No privileged state is supplied by the browser, and the returning owner never copies a UID for each message.

## Acceptance policy
Railway POST `/v1/ai/reply` requires all of:
1. Exactly allowed staging Origin, signed staging Firebase Auth token with revocation check, consumable App Check for the exact staging web app.
2. Current Firebase Admin `getUser(uid)` exists, has a real verified email, is not disabled, and the presented token is not an anonymous sign-in.
3. A **private server-read-only** Firestore document at `_reflectAiPrivate/reflect-8fdc8/entitlements/{uid}` in **Firebase project `reflect-ai-staging`** with typed fields:
   - `enabled`: Boolean `true`
   - `role`: String `staging_tester`
   - `model`: String `grok-4.3`
   - `expiresAt`: Firestore **Timestamp** in the future, no more than 31 days ahead.
4. Independent `REFLECT_AI_ENABLED=yes` and `REFLECT_XAI_OUTBOUND_ENABLED=yes`; separate private `_reflectAiPrivate/reflect-8fdc8/runtimeFlags/ai.enabled=true`; atomically reserved budget/immutable request ledger; explicit one-message consent.

Any absent field, invalid entitlement, disabled/unverified account, expired grant, authentication/App Check error or Firestore outage blocks the paid provider. No automatic regrant or publicly writable enrollment endpoint exists. The old `REFLECT_AI_ALLOWED_UID` variable is no longer used in the proposed code and should only be retired from Railway **after safe staging rollout**.

## Before any paid enablement
- **First complete Stage05A browser acceptance:** user-confirmed email refresh → one synthetic diary note persisted after reload → only with a known password sign out/in → same note in a second browser. Keep original UID/data.
- Verify in the *staging Firebase Console* that Firestore Security Rules **deny all client reads/writes** under `_reflectAiPrivate` including this subcollection. Firebase Admin bypasses Rules. This repository's available `firebase.staging.json` contains Hosting config, **not** a verified Firestore Rules deployment; cannot assume privacy from a comment or path prefix.
- Provision the verified owner's UID **once** as the private document ID via authorized Firebase Console/Admin tooling, not in chat/GitHub/Vite or ordinary application UI. Specify typed Timestamp and require renewal/revocation from an authorized admin only. Check the actual document in the **staging project**, not original production; do not delete old accounts.
- Review Railway deployment source/branch, exact project, env, new test and CI results, and server-side credential scope; stage/roll out only after owner review. Keep outbound disabled initially; test denial without model cost. Check current xAI model/schema, provider usage, billing and top-up.
- Enable paid egress and private flag only with **explicit approval for a single synthetic paid request**, track actual usage, then turn paid egress OFF again if continuing QA. The Firestore quota reservation is **not** an xAI spending hard cap. No automatic retries.
- Frontend `VITE_ENABLE_REFLECT_RAILWAY_AI` stays OFF until backend and billing approval; code alone is not deployed application functionality.

**Production/main, existing original Firebase, secrets and real journal content remain untouched.**
