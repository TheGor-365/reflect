# Reflect 2.0 — Stage04E: test the real Reflect-dev key **inside the local application**

**Date:** 2026-11-07. **State:** Draft code, not a production release. The live xAI call requires an **explicit owner action** in the localhost-only React interface and a secret entered **only in the owner's Linux terminal**. GitHub Actions uses synthetic fixture replies and **never** calls a paid provider.

## Why a local diagnostic first?

The xAI team key `Reflect-dev` was created on 2026-11-07 and its Edit Key screen showed model **grok-4.3**, Chat endpoint, 2000 tokens/min, 2 requests/min and expiration **December 7 2026 23:59**. Owner screenshot displayed team balance **$8.64** with no use attributed to the new key. These facts do **not** prove that Chat permission authorizes `POST /v1/responses`: the **real request** is the acceptance test for this. Earlier Billing form had threshold $5, auto top-up $5 and maximum monthly top-up $5 toggled on, but **saving was not independently proven**. Other team keys and the other app's credits are shared and must remain untouched.

The previous Stage04C Firebase Functions callable is only exercised in isolated emulator, so its synthetic unsigned App Check token is **not** trusted as production cryptographic attestation. Do **not** attempt to deploy a paid Cloud Function or pipe the owner's existing Test Auth/Firestore into that emulator just to validate a secret. Stage04E instead provides a **local-only development diagnostic**, not a production backend.

## Exact architecture

```
Reflect Sessions UI (Vite dev only, port 3100)
  - enabled ONLY if VITE_ENABLE_XAI_DEV_SMOKE=true,
    VITE_USE_FIREBASE_EMULATORS=true,
    projectId=demo-reflect-auth-qa, appId=reflect-8fdc8
  - user ticks explicit one-request paid synthetic consent
  - sends ONLY {"confirm":"synthetic-only"} to 127.0.0.1:19107
          |
          v
server/ai/localXaiSmoke.cjs (Node22; binds 127.0.0.1 only)
  - exact Origin http://127.0.0.1:3100 + custom intent header required
  - operator script starts with separate local allow flags
  - local private file ~/.config/reflect/keys/reflect-dev (0600)
  - single request lock; no retries even on timeout or 403
  - fixed synthetic sentence, no UID, email, diary, goal, history, profile
          |
          v
POST https://api.x.ai/v1/responses (grok-4.3, 128 visible output
tokens, reasoning effort=none, store:false, no tools)
          |
          v
validates completed response; displays text/token metrics
  - NEVER writes reply or history to Firestore
  - real cost/balance checked only in xAI Usage / Billing
```

**No key enters the frontend, version control or the runtime environment.** The private key is created once from hidden terminal input by `scripts/start-xai-local-smoke.sh`, `umask 077` and `chmod 600`. Real secret MUST never be shared in ChatGPT, GitHub, screenshots or logs. The generated file lives outside all Git worktrees. On production the secret must be migrated to server Secret Manager, never read from this file by a cloud function.

The ordinary Sessions AI send button stays `AI_SESSION_ENABLED=false`; this small diagnostic is NOT a completed multistep chat product, not an App Check-authenticated production service, and not a safe way to process personal diary text. **Do not transfer a user's actual content** until real App Check/security, provider retention consent, limits and deployment are approved.

## Launch on Linux, preserving Test data

1. Worktree only:
```bash
cd ~/reflect-stage25-qa
git fetch origin '+refs/heads/work/reflect-stage04e-local-xai-key-smoke-2026-11-07:refs/remotes/origin/work/reflect-stage04e-local-xai-key-smoke-2026-11-07'
git worktree add --detach ~/reflect-stage33-qa origin/work/reflect-stage04e-local-xai-key-smoke-2026-11-07
cd ~/reflect-stage33-qa
export ASDF_NODEJS_VERSION=22.23.4
npm ci
```
Existing Worktrees are preserved and current Firebase Auth9099/Firestore18081 + backups remain unchanged.

2. In **a new terminal**, start the backend. It asks for the key with hidden input **only on first run**:
```bash
cd ~/reflect-stage33-qa
export ASDF_NODEJS_VERSION=22.23.4
bash scripts/start-xai-local-smoke.sh
```
Expected: `Reflect xAI local smoke: 127.0.0.1:19107, one synthetic paid attempt maximum.` If the key is lost, recover or rotate it **privately in xAI**, never ask for the key in chat.

3. Stop **only** the old Vite port 3100 (Ctrl+C in its actual terminal); do not stop any Firebase emulator. In a **separate terminal**, run:
```bash
cd ~/reflect-stage33-qa
export ASDF_NODEJS_VERSION=22.23.4
export VITE_FIREBASE_CONFIG='{"apiKey":"demo-only-key","authDomain":"demo-reflect-auth-qa.firebaseapp.com","projectId":"demo-reflect-auth-qa","appId":"1:12345:web:demo"}'
export VITE_APP_ID=reflect-8fdc8
export VITE_USE_FIREBASE_EMULATORS=true
export VITE_ENABLE_XAI_DEV_SMOKE=true
npm run dev -- --strictPort
```
Open `http://127.0.0.1:3100`, navigate **Сеансы → Новый сеанс → Тест Grok 4.3 · локальная разработка**. Tick consent and click `Проверить Grok` **only once**. Screenshot only the output/error, not any secret. No new Firebase user is created.

## Interpretation

- `HTTP 200`, visible Russian model reply and token usage: real test key worked with xAI Responses model and local React → Node → xAI → React transport. Compare actual xAI Billing/Usage to estimate, because official price estimates omit additional charges/variance.
- `HTTP 502 (xai-http-error, providerHttpStatus 401)`: key invalid, expired or revoked; do NOT repeat until inspected.
- `HTTP 502 (...403)`: scope, model, team or API access rejected; review `Reflect-dev` ACL only.
- `HTTP 502 (...429)`: key rate/credit/usage limit; check Usage/credits.
- `HTTP 412`: local key missing, unsafe file permissions or invalid format; no provider request took place.
- `HTTP 409`: one attempt already used in that local server process. Do not automatically retry; local restart requires explicit new approval if a provider call was attempted.
- Missing local server: UI displays local connection problem; no diary data is sent. Node errors are generic, never include key or provider body.

## Official evidence / open gates

- xAI Responses API and `store:false`: https://docs.x.ai/developers/rest-api-reference/inference/responses
- Grok 4.3 pricing: https://docs.x.ai/developers/models/grok-4.3
- Grok 4.3 supports reasoning.effort=none: https://docs.x.ai/developers/model-capabilities/text/best-practices
- Default audit retention up to **30 days** even if `store:false`: https://docs.x.ai/developers/faq/security
- Prepaid balance and automatic $5 top-up / monthly cap: https://docs.x.ai/console/billing
- Real Firebase Functions App Check / Auth signed security check remains **unverified in separate staging**. This live diagnostic deliberately does not claim otherwise.
- Limits of this prototype: loopback + fixed synthetic text is appropriate for one local developer proof, not a multi-user or public AI API. It has no user Firebase auth at the smoke endpoint, no cloud billing ceiling, no full server Secret Manager and no persistent global budget; do not deploy or expose it.

**Acceptance still pending:** owner must run the local app with their locally stored secret and report screenshot; no agent/CI holds the real key. CI only tests the synthetic network transport.

## Addendum — 2026-11-07, first real xAI upstream failure

Owner actually ran the isolated localhost workflow at code SHA `12ed13c`, accepted the one-shot synthetic paid attempt and saw `xai-http-error, HTTP 502` in React. This is the **proxy** HTTP 502; the upstream xAI status was already returned in JSON as `providerHttpStatus` but the original UI omitted it. No successful live xAI reply was observed. The team balance may have been charged; CI does not prove provider connectivity.

A follow-up Draft change displays `Локальный proxy: HTTP 502` **separately** from `Статус xAI upstream: HTTP NNN`, but only when the server reports a bounded integer for `xai-http-error`. Unknown error codes and provider-body content are never rendered. Synthetic frontend and local HTTP status-matrix regression tests do not issue paid calls. Server wire request and one-shot lock remain unchanged.

**Before any second paid call:** recover the **existing** first request in Chrome DevTools Network → `smoke` → Response (only safe fields; never Request Headers), or xAI Console Logs around 19:05 Armenia local time. Obtain the actual provider status, and inspect key-scoped Usage + saved auto-top-up cap + separate invoiced spending limit. Do not recreate/rotate the existing key or automatically restart port 19107 to bypass the one-shot lock. Owner must explicitly approve a second fixed-synthetic paid request.

Status codes are troubleshooting categories, not diagnoses: xAI's [debugging guide](https://docs.x.ai/developers/debugging) lists 400/422 input validation, 401 authentication, 403 authorization, 404 model/route, 429 rate limit and 5xx upstream failures. The documented [Responses API](https://docs.x.ai/developers/rest-api-reference/inference/responses) and [Grok 4.3](https://docs.x.ai/developers/models/grok-4.3) accept the current conceptual contract; a real provider response or console logs are required before changing request parameters or ACL.

**Release status:** Stage04E live provider `BLOCKED`, Stage04F genuine signed App Check staging `NOT VERIFIED`, production rollout `BLOCKED`. No real key or personal diary text is in this repository.
