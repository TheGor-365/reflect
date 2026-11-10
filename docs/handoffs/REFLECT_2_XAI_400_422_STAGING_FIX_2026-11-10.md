# Reflect 2.0 — xAI HTTP 400/422 staging continuation

Date: 2026-11-10. Scope: Draft PR #37, Railway staging only. No production, main, Firebase Rules, secrets or user data changed.

## Last verified status
- Parent handoff: REFLECT_2_MASTER_HANDOFF_2026-11-10_GROK_400_422.md (owner supplied).
- Previous observed actual browser failure: Railway POST /v1/ai/reply -> HTTP 502; internal xAI provider status 400 **or** 422. No real Grok reply; no E2E Save Session. This is the reason for the patch, **not** a post-patch test result.
- GitHub Draft PR: https://github.com/TheGor-365/reflect/pull/37, branch `work/reflect-stage05a-product-readiness-2026-11-09`, base Stage04H Draft; not main.
- App commit `fcbb32942643727ac61e54f6a5519b44bad5be1a`: 11/11 GitHub Actions SUCCESS, including Node xAI fixtures, Railway security, Vite, TypeScript, isolated Auth QA; no paid provider calls in CI.
- Railway project `reflect-ai-railway-staging`, env `staging`, service `reflect-ai-api`. New deployment `beeeb9df-5651-4af9-b4c8-e9afdc49a7d8` SUCCESS at 2026-11-10T11:16:09Z. Environment status: Online 1/1, 0 warnings, 0 critical, 0 recent failures, no pending patches.
- Railway service source **pinned to app SHA `fcbb32942643727ac61e54f6a5519b44bad5be1a`**. A documentation-only commit after this point is not a new runtime deployment.

## Changes made
- `server/ai/xaiContract.cjs`: remove optional `tools:[]`, `tool_choice:"none"`, `stream:false`, `truncation:"disabled"` from outbound Responses JSON. Keep model `grok-4.3`, system+one user text, `store:false`, `max_output_tokens:512`.
- `server/ai/xaiProviderAdapter.cjs` unchanged: still adds `reasoning:{effort:"none"}`, injects server-only Bearer secret, no retries, strips all raw provider error bodies.
- `server/railway/index.cjs`: for authenticated client only, a 400/422 xAI upstream failure still maps to HTTP 502 and `error:"xai-invalid-request"`, with bounded `upstreamStatus:400|422`. No raw text/headers/codes/credentials in response.
- Updated `server/ai/xaiContract.test.cjs`, `server/ai/xaiProviderAdapter.test.cjs`, `server/ai/localXaiSmoke.test.cjs`, `server/railway/index.test.cjs` to require the new constrained shape/status mapping.
- First CI head `435cc969...` failed only one **obsolete test** expecting `tools:[]` in local synthetic smoke. Fixed it, then the final app SHA `fcbb32942643727ac61e54f6a5519b44bad5be1a` passed 11/11 workflows.

## Known uncertainty
Removing optional fields reduces interoperability risk, **but root cause is not proven until the next real xAI POST**. No paid request or browser Save Session was performed by the assistant. Existing key / Firebase / private entitlement already set up. Backend build/deploy success is not an upstream acceptance.
The current user interface requires no new Firebase Hosting deploy: all changes are server code/tests.

## Next owner actions
1. Open https://reflect-ai-staging.web.app, reload Sessions. Use only a synthetic message without personal journal content, submit **once**. Previously failed request IDs must not be replayed. This may be billable and must not be repeated automatically.
2. If a Grok response appears: manually **Save Session**, reload the page, reopen history, verify saved user+assistant text and xAI Usage. If not, do not retry: inspect browser DevTools Network -> `/v1/ai/reply` -> **Response only** for bounded `error` and `upstreamStatus` (400/422); do not share Authorization/App Check headers, cookies or real message data.
3. Return sanitized response or screenshot and xAI Usage to the same technical chat; preserve ledger, server keys, Firebase projects and production boundaries.

## Acceptance pending
- One real `grok-4.3` answer in staging Sessions.
- One explicit Save Session, verified after refresh.
- Actual provider Usage and billing receipt correlated, without displaying sensitive data.
- Full production/security QA remains separate.
