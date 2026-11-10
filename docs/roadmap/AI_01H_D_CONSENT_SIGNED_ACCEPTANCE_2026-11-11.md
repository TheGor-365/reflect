# Reflect 2.0 — AI-01H/D: genuine signed consent endpoint acceptance
**2026-11-11 | Draft, staging-only browser QA | No provider history integration**

## Latest verified live state
- Owner CLI negative tests for `POST https://reflect-ai-api-staging.up.railway.app/v1/privacy/context-consent` returned **401 (no Auth), 403 (wrong Origin), 401 (forged Auth/App Check), 404 (wrong method)**.
- Railway staging service `reflect-ai-api`, exact SHA `b247312863c2593563f5f53bc01aaa6ca994e535`, new deployment `e0752996-cddc-4c00-87f2-3b101837329e` is SUCCESS / Online, with `REFLECT_CONTEXT_CONSENT_API_ENABLED=yes` explicitly set in last non-destructive patch. No changes to production, Firestore Rules or Grok context.
- Hosting staging currently at `1b12474cdf99ff5a4356853d34b33d1fee9d97b7`, consent management UI flag `VITE_ENABLE_REFLECT_CONTEXT_CONSENT=false`. Existing signed `/v1/ai/diagnostics` from owner browser PASS 3/3; this is NOT the new consent endpoint.

## This PR's user-triggered 4-stage security probe
New `src/api/stagingConsentEndpointAudit.js` and `StagingConsentEndpointAuditPanel.jsx` in AI Settings (separate from consent grant UI):
1. `POST {action:"list"}` unsigned. Require HTTP 401 `unauthenticated`.
2. `POST {action:"list"}` with current Firebase Auth ID token and freshly issued **limited-use App Check**. Require HTTP 200 and an allowlisted list response. Returned source IDs and grant IDs are verified transiently, never logged, stored in UI or rendered.
3. Reuse the **same** App Check token in a second list call. Require HTTP 401 `unauthenticated`.
4. Get a **new** App Check token; send `{action:"revoke", grantId:"qa-consent-probe-<fresh UUIDv4>"}`. Before this step, assert the ID was not present in the owner's active grant list. Require HTTP 200 `revoked`. The server handles unknown IDs as an idempotent no-op and creates no record; the probe issues **zero** grants and does not read sessions.

The browser UI reports only PASS 4/4 or an allowlisted error code. The user must explicitly click the diagnostic button. No automatic requests.

## Before owner deployment
- Exact-head GitHub Actions Vite, TypeScript, Auth QA and server security must all succeed.
- Deploy only Firebase Hosting staging from exact pinned tested SHA and existing local `.env.staging.local`. Re-verify staging environment; **`VITE_ENABLE_REFLECT_CONTEXT_CONSENT` must remain false**.
- Do not update Railway server, private Firestore Rules, production, main, account entitlements or paid Grok settings.
- Owner acceptance: Settings → “Диагностика API разрешений” → “Проверить API разрешений”, send screenshot of PASS/error code only; **never paste Firebase ID token, App Check token, UID, Network request headers, source IDs**.

## After PASS 4/4
Plan a separate opt-in staged UI release to the same staging host with `VITE_ENABLE_REFLECT_CONTEXT_CONSENT=true`, ensuring exactly one specifically selected owner session and separate consent checkbox. Owner manually tests `grant → list → revoke`; all source text stays out of the API, and provider/history integration remains disabled. Consider data deletion and stale/expired grant cleanup before broader rollout.

## Scope boundaries
- This PR does **not** change Railway or call the Grok provider.
- UI consent grant/list/revoke remains off until a distinct approval and staging Hosting build.
- No production or Firestore Rules changes, no main merge, no real user records created by this QA.
