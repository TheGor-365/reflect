# Reflect Stage04F — first owner-operated real Grok response inside Sessions

**Date:** 2026-11-07. **State:** Draft, stacked on PR #33. No automatic paid test
or production deployment. This is a localhost-only single-live-turn test
with fixed synthetic scenarios, **NOT** a real-user diary integration.

## Explicit owner authorization and financial exposure

At 2026-11-07, owner explicitly requested "подключаем приложение и тестируем
боевые функции", acknowledged approximately USD 8.64 shared xAI credits and
auto top-up of USD 5. Authorization is for **one manually initiated synthetic
API request**, not recurring billing, cloud deployment, sending personal diary
content, or automatic retries. xAI team credit wallet is shared with an
unrelated application. Auto top-up is active per owner report and could charge
the card at its configured threshold; the saved monthly cap and invoiced
spending limit have NOT been independently verified. Do not pretend a 128-token
request cap is a hard USD limit. If billing exposure is unacceptable, disable
auto top-up in console first. Never touch other keys, archived worktrees or
Firebase production.

## Current code

- 'server/ai/localXaiSmoke.cjs' keeps the original 127.0.0.1:19107 Node
  gateway with 0600 owner-only key file, fixed system instruction, allowlisted
  3 synthetic scenario IDs, one attempt per server process, 45s timeout,
  no tools/history, store:false, 128-output-token cap.
- The client in 'src/features/Sessions/XaiDevSmoke.jsx' remains visible only
  in demo Auth emulator Vite development on http://127.0.0.1:3100.
  Each scenario maps to **server-defined fixed text**; client-supplied free
  text, diary, profile, UID or history are structurally denied.
- Displays the exact xAI upstream non-2xx HTTP code separately from proxy
  HTTP502, without provider error bodies. If xAI reports
  'usage.cost_in_usd_ticks', displays exact cost separately from estimated
  tariff. Missing cost means **unknown**, not '$0'. UI and server block
  repeated attempts in a single process.
- Full unit/integration fixtures mock the provider; CI cannot use a real key.
  No production AI switch, deployed function or Firestore session write.

## Clean Linux run without disturbing historical QA or reentering key

Work in an **independent new worktree** rather than replacing the owner's
historical 'reflect-stage33-qa' code. Commands below are only to be run by
the owner in Linux Mint, not in ChatGPT, GitHub CI or hosted cloud shells.

1. New terminal (source the existing project, fetch the **approved Draft
   branch**, install only in the new worktree):
   ```bash
   cd ~/reflect-stage33-qa
   git fetch origin work/reflect-stage04f-server-xai-adapter-2026-11-07
   git worktree add --detach ~/reflect-stage34-live FETCH_HEAD
   cd ~/reflect-stage34-live
   export ASDF_NODEJS_VERSION=22.23.4
   npm ci
   ```
   Do not run 'git reset --hard' or 'git clean' on any old worktree. If
   '~/reflect-stage34-live' already exists, inspect it first; don't destroy.

2. The old **local-only** Node proxy on 127.0.0.1:19107 may have consumed
   its previous one-shot; stop it by Ctrl+C in **its own terminal**, not via
   indiscriminate kill commands. Then start the **new** dedicated proxy:
   ```bash
   cd ~/reflect-stage34-live
   export ASDF_NODEJS_VERSION=22.23.4
   bash scripts/start-xai-local-smoke.sh
   ```
   The script reuses the existing private
   '~/.config/reflect/keys/reflect-dev' if present, **without requesting
   it again**. Never paste it into a chat, Git repo or screenshot. Starting
   the local Node process alone makes **no paid call**.

3. Stop only the old Vite process on :3100 in its own terminal (Ctrl+C).
   Leave Firebase Auth/Firestore emulators and owner backups untouched.
   In a separate terminal run:
   ```bash
   cd ~/reflect-stage34-live
   export ASDF_NODEJS_VERSION=22.23.4
   export VITE_FIREBASE_CONFIG='{"apiKey":"demo-only-key","authDomain":"demo-reflect-auth-qa.firebaseapp.com","projectId":"demo-reflect-auth-qa","appId":"1:12345:web:demo"}'
   export VITE_APP_ID=reflect-8fdc8
   export VITE_USE_FIREBASE_EMULATORS=true
   export VITE_ENABLE_XAI_DEV_SMOKE=true
   npm run dev -- --strictPort
   ```
   In Chrome open 'http://127.0.0.1:3100' → 'Сеансы' → 'Новый сеанс'
   → 'Пробный AI-сеанс · реальный Grok 4.3 (локально)'.
   Choose one of the three synthetic scenarios, check the one-paid-request
   confirmation, then click 'Получить ответ Grok' **only once**.

**Do not restart & repeat after an error without first reporting the exact
safe UI error.** The prior user attempt showed local HTTP502 with unknown xAI
upstream status; the updated UI now shows the upstream status when available.
Chrome DevTools 'Network -> smoke -> Response' is the backup diagnostic; do
not share Request Headers, any API key, session cookies or personal text.
Show a screenshot of the resulting reply/status/cost only.

## Acceptance

- Result shown inside Sessions is a nonempty, Russian, verified
  'grok-4.3' reply to exactly one synthetic input, with token counts.
  Provider actual billed ticks, when returned, are displayed separately
  from published-rate estimate.
- xAI Usage may lag or remain zero; screenshot of provider's own cost
  receipt is more specific for that call. Absence of receipt = unknown.
- Any HTTP502 must display the *upstream HTTP status* for 'xai-http-error';
  any parsing/transport failure must be redacted; one-shot lock prevents
  another charge. No private message saved or sent.
- This is **not yet a real personal AI session**. Genuine signed Firebase
  App Check staging, server secret binding, durable USD budget ledger, Auth,
  per-message consent and privacy review are separate preconditions before
  enabling the regular Sessions composer.

Official docs: https://docs.x.ai/developers/rest-api-reference/inference/responses
https://docs.x.ai/developers/cost-tracking
https://firebase.google.com/docs/app-check/cloud-functions
