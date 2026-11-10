# Reflect 2.0 — AI-01H/B: signed browser security acceptance
**2026-11-11 | Draft only | staging-only UI | no deployment in this PR**

## Evidence carried from AI-01H/A
User-provided real CLI curl outputs at 2026-11-10 21:13 UTC:
- `GET https://reflect-ai-api-staging.up.railway.app/healthz` → HTTP/2 200 `{"status":"up","aiEnabled":true}`.
- `POST /v1/privacy/context-consent` from the permitted Origin with `{}` and no Auth/App Check → HTTP/2 404 `{"error":"not-found"}`.
- This proves the currently deployed Railway staging service responds, and the **consent feature is disabled**. It does not prove that the future enabled consent endpoint has correct Auth/App Check checks.

Railway staging server deployment confirmed: `e28b9197fe6f99e66637ae19bf652d5b373a07a6`, deployment `f3a489f6-cd95-4ba2-80f0-a945e1f26c2e`, status SUCCESS; `REFLECT_CONTEXT_CONSENT_API_ENABLED=no`. Previous rollback deployment `beeeb9df-5651-4af9-b4c8-e9afdc49a7d8`.

## New opt-in browser diagnostic
- `src/api/stagingSecurityAudit.js` uses the **existing** signed `/v1/ai/diagnostics` route. Exact allowlisted Railway origin, current Firebase Auth user and a single limited-use App Check token. No history, account info, session content, prompts or provider calls.
- The user explicitly clicks one button in AI Settings. Three sequential checks:
  1. Send `{}` without tokens: expect HTTP 401 `unauthenticated`.
  2. Send `{}` with genuine Firebase ID token + one limited-use App Check token: expect HTTP 200, `model: grok-4.3`, safe readiness (`ready`, `outbound-disabled`, `runtime-disabled`).
  3. Reuse **the identical App Check token** without storing or displaying it: expect HTTP 401 `unauthenticated`. This is a consumption/replay check.
- UI reports PASS only if all three conditions are met. Shows allowlisted code only; no raw server responses or tokens, and resets on account switch. No background checking, paid xAI request, or consent issuance.
- If the staging account has lost entitlement or App Check isn't active, the test fails with a safe code; do not weaken authorization to force PASS.

## Acceptance / staged deployment gate
1. Exact-head GitHub CI must succeed (Vite, browser, TypeScript, Node service tests), including negative and replay mocks.
2. Owner executes Hosting-only deploy from the pinned code and existing **verified staging env**: `VITE_ENABLE_REFLECT_RAILWAY_AI=true`, `VITE_ENABLE_REFLECT_CONTEXT_CONSENT=false`, exact Firebase staging config/App Check/ Railway origin. No Railway, Rules, main or production change.
3. Owner opens staging → AI Settings → «Диагностика защиты staging», explicitly clicks «Проверить Auth и App Check» and reports only the safe PASS/status or error code, not tokens/UID. The diagnostic concerns the **existing** `/v1/ai/diagnostics` route, not the new consent route that is still disabled.
4. Independently test malformed/wrong Origin/no credentials on enabled consent route *before* approval to enable the consent flags. This requires a separate reviewed release and real signed endpoint acceptance; **do not enable both flags solely on the existing diagnostic result**.
5. Verify that `/v1/ai/reply` continues to accept only a single explicitly consented current message and does not read historical context.

## Explicit non-actions
No changes to Railway service, `REFLECT_CONTEXT_CONSENT_API_ENABLED`, Firestore Rules, external provider calls, production, `main`, real-user session content, database records or paid entitlement.
