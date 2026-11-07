# Reflect 2.0 — Stage04F: server-only xAI transport and security boundary

**Date:** 2026-11-07. **Status:** Draft, stacked on PR #33. No deployment,
no live provider calls, no Firebase Secret Manager changes, no paid requests.
Production and personal journals remain untouched.

## What exists

- 'server/ai/xaiProviderAdapter.cjs': isolated CommonJS provider transport.
  Dependencies ('transport' and 'readSecret') must be explicitly injected by a
  future trusted server runtime. No default global fetch, no environment key
  fallback, no browser import, no registered callable.
- 'invoke(message)' takes one validated string. The fixed provider endpoint,
  model and system instruction come from Stage04D's xaiContract.cjs. Provider
  transport adds a fixed 'reasoning: { effort: "none" }', with no history,
  tools, user profile, UID, filesystem, attachments or arbitrary API options.
  Existing Stage04E localhost live smoke request is **unchanged**.
- Request redirects are refused, 20-second default timeout (max 30), a
  maximum of 96 KiB streamed response with header preflight, strict JSON
  and Stage04D completed-response / model / token-usage parsing.
- The upstream non-2xx response **body is never read, logged or returned**.
  A bounded HTTP code is attached as **non-enumerable internal** diagnostic
  metadata to a generic policy error. Caller-facing errors are redacted.
  Transport and parsing errors have no secret, message or raw provider body.
- There are **no automatic retries**. The adapter does not persist, reserve
  money or send data on import. Fixture-only Node tests cover malformed
  replies, injection attempts through response schema, body-size limits,
  timeout, upstream 400/401/403/404/405/415/422/429/500/503, bad secrets,
  forbidden additional context and required dependencies.
- 'reflect-xai-server-adapter.yml' runs all pure adapter/Stage04A/04D/04E
  fixtures and existing browser tests and build with **no credentials**.

## CRITICAL: gates that this adapter does NOT enforce

This adapter is an *execution component*, not a production-ready AI endpoint.
A future Firebase v2 'onCall' wrapper must enforce all of these **before**
'readSecret()' and 'invoke()' can run:

1. Firebase SDK-verified Auth UID and **real signed App Check**; no synthetic
   emulator attestation accepted in a hosted deployment. Decide and test
   App Check limited-use replay separately.
2. One-message explicit, versioned consent for the precise text selected by
   the user; reject client-supplied model, provider, history, UID and tool data.
3. Atomic, durable per-user and global quota **and actual money-budget**
   reservation with a durable idempotency ledger, including UTC-day rollover,
   crashes and ambiguous provider outcomes. The existing Stage04C mock ledger
   (48h TTL, token quotas) is *not* a production billing limit.
4. Server-owned kill switch checked in the reservation transaction and an
   independent provider-side spending ceiling; no auto-retry or auto-top-up
   assumption. Define spending in USD, not just token estimates.
5. Explicit secret binding **only** to the reviewed staging function using
   Firebase 'defineSecret' and '{ secrets: [secret] }'. The injected
   'readSecret' should call 'secret.value()' **at invocation time**.
   Do not set secrets or deploy until owner authorization.
6. Strict server project allowlist, deployment IAM and authenticated
   invocation controls, retention/consent and privacy review. Reject a wrong
   project or inactive AI flag rather than falling back to production.
7. Durable result and failure state machine: no partial session write,
   replay after timeout, double billing or unhandled orphan reservations.
   Do not write diary contents, prompts, provider bodies or keys into logs.

**Note:** 'store:false' prevents stateful response retrieval but does not
prove zero audit retention. Check xAI's actual retention settings before
sending any real diary content.

## Live Stage04E blocker is still unresolved

The owner made **one** synthetic xAI request from the localhost Reflect UI.
Its browser displayed proxy HTTP 502. The real upstream status inside the
proxy response is unknown and cannot be inferred from the 502. The revised
PR #33 client can display it on a *future explicitly approved* call but the
prior response must be recovered via Chrome 'Network -> smoke -> Response'
or xAI Console Logs. **Do not repeat the paid call** without evidence and
new consent. xAI Usage after the call, saved monthly auto top-up, invoiced
billing limit and current available credit remain unverified.

The new Stage04F adapter is not wired to the old smoke, and its fixtures do
not demonstrate a successful Grok response, valid key ACL or production App
Check. The xAI wallet is shared with another application.

## Next dependency milestones

- Stage04E: obtain first provider status, fix only a proven cause, validate
  Usage/Billing limits and ask explicit approval for one further synthetic
  paid attempt.
- Stage04F continuation: security-reviewed dedicated staging Firebase
  Functions codebase + bound Secret Manager, Auth/App Check, per-user/global
  **USD** budget and idempotent transaction gate; test against real signed
  staging App Check only after owner approval and verified costs.
- Stage04G: UI message composer with per-message opt-in, draft preservation,
  explicit save, and no automatic private archive transfer.
- Stage05: signed-attestation and ownership negative QA; controlled
  release review. No merge to 'main' or production deploy without go/no-go.

## Authoritative references

- xAI Responses API: https://docs.x.ai/developers/rest-api-reference/inference/responses
- xAI debugging: https://docs.x.ai/developers/debugging
- Grok 4.3: https://docs.x.ai/developers/models/grok-4.3-latest
- Firebase Secrets: https://firebase.google.com/docs/functions/config-env#secret-parameters
- Firebase App Check: https://firebase.google.com/docs/app-check/cloud-functions


## Provider-side log evidence, owner screenshot 2026-11-07

- The owner showed the **xAI Console → Logs → Chat** record with time
  **Nov 7, 19:05:30** (as displayed in their browser), selected model
  'grok-4.3', temperature approximately 0.7 and max tokens 128. Its
  system instruction exactly matches the fixed Reflect request. The
  console's **Response · Completed** label is visible. The screenshot
  does **not** expose the HTTP status received by the localhost proxy,
  the response text, usage tokens or billed amount. The side-panel
  response area appears empty.
- This is evidence that the authenticated request reached xAI inference
  and that a generation record exists. It is **not proof** that the
  original local HTTP exchange returned 200: the Stage04E gateway's
  'xai-http-error' branch corresponds specifically to an upstream
  non-2xx status and may represent a delivery/provider-layer failure.
  Keep cause **unresolved**, do not guess 401/403, do not call it fixed,
  and **do not issue another paid request**.
- Next owner evidence, one screen at a time: select **Raw** for this
  *same existing xAI log*, inspect only HTTP status, outcome, token
  usage and safely synthetic response information; redact API Key ID,
  any bearer value or unrelated application data before sharing.
  Alternatively use original Chrome Network 'smoke' Response for
  the bounded 'providerHttpStatus' field (if retained). Then inspect
  the console Usage and saved billing limits. The static $8.64 balance
  shown in the screenshot does not establish the actual request cost
  or saved auto-top-up setting.


## 2026-11-07 addendum: exact provider cost and fail-closed money planning

Source: https://docs.x.ai/developers/cost-tracking (checked 2026-11-07).
Responses API's 'usage.cost_in_usd_ticks' represents the provider's actual
per-request billed cost, with 10,000,000,000 integer ticks = USD 1.
**This is not the same as an estimate from published token rates.**

- 'server/ai/xaiCost.cjs': 'readProviderCharge(usage)' parses exact
  non-negative safe-integer tick charges; missing metadata yields
  'actualUsdTicks: null'/'actualUsd: null', **never false zero**.
  Bad fields fail with a generic policy error.
- 'server/ai/xaiProviderAdapter.cjs': now returns the provider receipt
  independently from the published-price estimate. A receipt **does not
  retroactively prevent** a paid call.
- 'planMoneyReservation' computes a pure per-request, per-owner-UTC-day
  and per-project-UTC-day budget proposal using integer ticks, **only**
  with explicitly provided server-owned limits and counters. It is
  stateless and does not authorize any spending. Future staging must
  read/write owner+global counters, independent cross-day idempotency
  ledger and the server kill switch in the **same durable transaction**.
  Neither a pure budget planner nor the old emulator quota enforces a
  real USD limit until this integration exists.
- For upstream failure, timeout, lost response or missing receipt:
  preserve the reserved amount pending reconciliation from xAI Usage;
  do not refund the budget reservation just because no reply arrived.
  Never auto-repeat the request. A provider-side spending ceiling and
  verified auto-top-up settings remain separate essential safeguards.
- New synthetic-only fixtures: 'server/ai/xaiCost.test.cjs' plus adapter
  receipt tests. The Stage04F Action runs them without a vendor secret.

The owner supplied two screenshots of the **Raw** view of the existing
xAI Console Chat log at 19:05:30. It shows only
'logged.chat.request' containing the fixed synthetic prompt, 'grok-4.3',
'maxTokens: 128', sampling temperature, top-p, tool-choice NONE and
'historyStatus: HISTORY_STATUS_COMPLETE'. These are **request fields**,
not a provider HTTP status, charged amount, or assistant result. The
older Formatted panel claimed 'Response · Completed' but displayed
no response text. Do not infer HTTP 200 or declare the old 502 fixed.

**Next local evidence:** open xAI Console **Usage** on Nov 7
for the Reflect-dev key, note cost/request and saved billing limits.
If the original Chrome 'Network → smoke → Response' still exists,
capture only the sanitized JSON error and 'providerHttpStatus'. Neither
action makes a new paid request. Keep the team’s other API keys untouched.
