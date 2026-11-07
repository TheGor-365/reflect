# Reflect 2.0 — Stage 04A: protected opt-in AI backend, design + fail-closed policy

**Date:** 2026-11-07. **State:** design and pure server-side policy implementation in a stacked Draft PR. **NO AI PROVIDER, CLOUD FUNCTION, TOKEN, SECRET, PAID API OR DEPLOYMENT IS CONFIGURED.** The browser's `AI_SESSION_ENABLED = false` remains unchanged. Main, normal Firebase QA, Test account and production are untouched.

## Baseline and why

- Reflect is currently Vite/React 18 + Firebase Authentication and Firestore. The old browser-side Gemini integration is disabled. Session UI supports a real manual action "В дневник"; there must be no fabricated AI answer or silent journal upload.
- Stage03F: original local Test journal records and both edit versions are visible after a private Auth/Firestore snapshot import. Exact before/after Auth UID equality has not been independently verified.
- Stage03G owner inspection: only three archive records (profile 1, notes 2). This is **not** coverage of goals, moods or sessions.
- Stage03I Draft PR #28: 50 isolated Auth/Firestore Rules assertions pass, but goals/moods/sessions still enforce only UID access, not complete schema validation. Security reviews cannot assume those empty real collections are proven safe.

## Architecture

```text
Explicit user action: "Отправить в ИИ" (consent for THIS one message)
     |
     v
Firebase v2 onCall endpoint [NOT YET IMPLEMENTED]
  - verified Firebase Auth UID (NOT a body field)
  - enforceAppCheck: true; replay handling when enabled
  - server-side checked, single-message consent and schema
  - no implicit diary/goal/profile/history read or upload
     |
     v
Atomic Firestore server transaction [NOT YET IMPLEMENTED]
  - per-UID UTC daily & rolling minute reservation
  - project-wide daily reservation
  - independent request-ID replay ledger, retained over day boundary
  - reserve worst-case token cost BEFORE provider traffic
  - no client writes to these collections
     |
     v
Provider adapter via server-only secret [NOT YET SELECTED]
  - provider/model allowlisted by operator, not user-controlled
  - input/output token caps and hard request timeout
  - circuit breaker, outage/failure-safe behavior
  - redact logging; never log prompt or raw provider response
     |
     v
Validate output -> return brief text (NO automatic journal/goal persistence)
  -> user decides whether to save in Firestore under their own UID
```

**Implementation already included in this Draft:** `server/ai/policy.cjs` is a provider-neutral, synchronous, pure policy contract. `server/ai/policy.test.cjs` uses Node's built-in test runner, no Firebase SDK, no network, no real data, no external API. It checks:

- Server-provided authenticated UID AND a verified App Check signal, rejecting everything else.
- Explicit fresh consent `{granted:true,version:"2026-11-07",scope:"one-message"}` required for *each* request, rather than a hidden persistent opt-in.
- A fixed body of `requestId`, `message`, `consent`. Rejects client UID, profile, entire chat history, API keys, provider/model selector, tools, system prompts or arbitrary context. User-selected text only, up to 4,000 code units and 12,000 UTF-8 bytes; invalid characters and empty strings rejected.
- Strict provider text response validation before returning to client. No tool calls, URLs as actions, executable code or extra provider fields accepted as structured commands.
- Deterministic quota reservation **proposal**, not live enforcement: maximum 2 requests/rolling 60s, 10 requests/UTC day, at most 1,200 estimated input + 512 max output tokens per request, 18,000 reserved tokens/UID/day, 120,000 tokens/project/day. Duplicated IDs denied; corrupt state fails closed; no refund on provider failure. Caps are provisional and must be approved economically; token units are **not** equivalent to a money guarantee.
- No logging, AI provider imports, Firestore access or local persistence. A CI gate confirms the browser still has AI disabled.

### Atomic implementation requirement

A pure quota function is **not** a security or billing boundary. A deployed adapter MUST use server-authorized Firestore transaction(s) to atomically check user budget, global budget and a separately indexed idempotency key; it must enforce at most one provider call per request ID, including retries and UTC date transitions. Use authoritative server time; never accept estimated token usage from the browser. Keep request ledger (no text) for at least 48 hours; apply TTL with privacy review. If transaction fails, reject without provider invocation. If external call fails after reservation, do not auto-retry or return tokens to caller. Handle timeout ambiguity as charged for abuse accounting.

Do **not** assume Cloud Billing budget alerts are hard spend caps. Set upstream provider spending/usage ceilings where actually supported, max function instances/concurrency and model token limits, plus project-wide circuit breaker. Reconcile provider invoices/usage before setting real $ limits. No paid API or banking setup is authorized in this stage.

### Functions v2 integration plan (future)

Use Firebase Functions v2 callable `onCall` with `enforceAppCheck:true`; verify `request.auth`, `request.app`, `request.data`, server-owned owner UID and permission before reading/writing. For high-value requests, replay protection `consumeAppCheckToken:true` can be enabled after evaluating extra latency and quotas; **consumed tokens are not automatically rejected**: inspect `request.app.alreadyConsumed` where appropriate. On demo only, use separate project/emulators and synthetic accounts; never turn off App Check on production to make tests pass.

Secrets come from server-side secret manager references only, with least privilege, rotation and no Vite/public environment variables. HTTP response and error paths must not disclose any server secret, model prompt, UID, internal logs or request payload.

### Privacy, safety, UX

- Minimum data by default: one consciously selected message; **no automatic personal profile, journal history, goal corpus, session transcript, uploaded archive or Firebase Auth metadata**.
- Before first external request, show clear notice: third-party service, applicable privacy/retention terms, paid/limited quota, consent for this request. User can cancel; no background model calls. Provider terms, geographic eligibility, processing locations and retention policies must be verified *for the selected provider* before enabling.
- Reflect is a reflection tool, not a licensed mental health clinician. Do not provide clinical diagnoses or crisis guarantees. Include escalation wording and a visible way to continue without AI; do not automatically store model output as a diagnosis.
- No logs of journal text, user identity, Auth tokens, raw provider responses, prompts or history. Operational counts can be aggregated, with access controls and short retention. Monitoring must not expose personally identifying metadata.
- Only user explicitly saves the response to their diary. Avoid silent profile changes, auto-created goals, background summarization or chat-history-wide consent.

## Threat matrix

| Risk | Planned boundary |
|---|---|
| Unauthenticated request | Firebase Auth required, UID from verified context |
| Forged app / scripted misuse | App Check enforced, server rate quotas and replay ledger |
| Cross-account data leak | No UID in body, never fetch other users' records |
| Browser API key exposure | Server-managed secret, browser feature flag OFF |
| Prompt/history over-collection | Per-message consent, strict allowlist, no implicit data reads |
| Unexpected model bills | Atomically reserved worst-case quotas, model caps, global kill switch; operator billing controls |
| Concurrent retries | Durable idempotency IDs and atomic Firestore reservation |
| Provider downtime / bad output | Fail closed; return an error, preserve local draft |
| Model prompt injection | Server-owned system prompt, no provider tool execution or untrusted command handling |
| False medical guidance | Non-diagnostic UX and validated output moderation policy |

## Concrete acceptance gates before Stage04B external test

1. Exact-head Node contract CI and baseline app CI pass; no real provider calls.
2. Separate demo-only callable with authenticated/App Check integration test for missing/expired Auth, missing App Check, foreign UID, no consent, malformed body, excessive payload, duplicate IDs and concurrent reservations.
3. Test upstream simulated timeouts, transient provider errors and cost caps with mocked transport; assert **no secrets or private text** in logs.
4. Verify provider's latest pricing, terms, data retention/training controls, geographic/legal eligibility and payment route. Choose and approve initial monthly budget. Do not assume budget alerts prevent overage.
5. Separate production go/no-go requiring owner permission, secret provisioning, staging load test, rollback and disabled client flag until all passes. Never activate by deploying this policy-only module.

Reference docs:
- Firebase App Check on Cloud Functions: https://firebase.google.com/docs/app-check/cloud-functions
- Firebase Functions v2 callable options: https://firebase.google.com/docs/reference/functions/2nd-gen/node/firebase-functions.https.callableoptions
- Cloud Functions quotas and charging: https://firebase.google.com/docs/functions/quotas

**Explicitly not done:** provider selection, Cloud Functions code/deployment, payments, production App Check, Firestore server quota docs, real cost enforcement, privacy-consent UI, international legal assessment, model calls, Stage05 release.
