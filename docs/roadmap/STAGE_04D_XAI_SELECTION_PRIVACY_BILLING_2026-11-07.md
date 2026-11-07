# Reflect 2.0 — Stage04D: xAI / Grok API readiness, no external spending

**Date:** 2026-11-07. **Status:** Draft branch stacked on Stage04C PR31. Vendor has been selected *provisionally* based on owner account screenshots and public, date-checked xAI docs. This is a non-billing **provider API contract**, not deployed Cloud Functions, not a live App Check staging attestation and not an external AI request.

## Owner-provided xAI console evidence (2026-11-07, screenshots only)

- Workspace displayed: existing team `android-sushi-diffuser`; xAI API console, not an unrelated Grok chat subscription.
- Dashboard/Billing showed **$8.64 credits remaining**, including a label saying the balance may include promotional/free credits. **Unable to distinguish free vs purchased parts or expiry from screenshots**. Screenshots of older paid invoices do not prove current credits are all purchased.
- 30-day and week-of-Nov-1-to-7 Usage showed **$0.00 spend / 0 tokens / 0 requests**. This is period-specific; it does not prove keys have never been used or remain valid.
- Two existing API key entries named `AI course` and `Default` (masked identifiers only). Key scope, expiry and allowed model endpoints were not shown. **Do not reuse/edit/revoke these keys** because another application is already connected to this team.
- **AUTO TOP-UP IS ENABLED**: Billing card stated it charges **$10** when the prepaid balance falls to **$5 or below**. This is immediate real-card exposure even if Reflect has a separate app-side budget; another team key also draws down this balance.
- Saved payment method was displayed; no unmasked card data should be copied to repo, docs, issues or logs. Never request CVV, tokens or xAI key in chat.
- Model screen showed xAI tier T0 and current Grok models, but no actual success of a paid API call was verified. Team merging marketing banner is NOT authorization to migrate team/account, and may be irreversible. Do not click.

## Verified public xAI API details (official documentation, 2026-11-07)

- API usage debits prepaid team credits immediately; monthly invoiced billing may add charges if enabled. Review team's **invoiced billing limit** and set **$0** for prepaid-only use. API Billing: https://docs.x.ai/console/billing
- Auto top-up can be turned off using **Billing → Manage auto top-up**, preserving existing credits; it can be separately capped per month. Above $5 top-up threshold, at the observed $8.64 balance, only **$3.64** of further consumption could occur before that configured trigger, assuming no simultaneous other app use. **This is not a safe operational budget while top-up stays ON.**
- Endpoint https://api.x.ai/v1/responses uses server-only `Authorization: Bearer`; no public/Vite secret. Responses API documentation: https://docs.x.ai/developers/rest-api-reference/inference/responses
- xAI model `grok-4.3` currently charges **$1.25/1M non-cached input tokens**, **$2.50/1M output tokens** for short context (<200k). Grok 4.7 charges $2.00/1M input and $6.00/1M output. Actual usage may include model reasoning, input formatting overhead, long-context pricing, caching or optional tools. Pricing: https://docs.x.ai/developers/pricing ; model: https://docs.x.ai/developers/models/grok-4.3-latest
- Model `grok-4.3` supports `reasoning_effort: none` in the documented family. For initial reflective text, start with minimal reasoning, no tools, limited outputs, and re-evaluate quality vs costs after synthetic trials.
- Management APIs support per-key ACL restrictions by endpoint and model plus QPS/QPM/TPM. The team will benefit from a **third, scoped Reflect key**, revocable independently of existing apps. Never post the key in chat/GitHub, client code or logs. https://docs.x.ai/developers/rest-api-reference/management/auth
- API traffic is **not used for training without explicit permission**, but under default settings xAI retains API requests and responses for **30 days for audit**. `store:false` disables stateful Responses retrieval and does **not by itself promise zero audit retention**. Zero Data Retention must be verified separately under team settings, and enabling it may require deleting existing Files/Collections, so DO NOT enable team-wide ZDR without reviewing the other connected application. https://docs.x.ai/developers/faq/security
- The separate real Firebase App Check staging attestation is still **unverified**; previous Stage04C emulator accepts synthetic unsigned tokens by design. Official requirement: https://firebase.google.com/docs/app-check/cloud-functions

## Implemented in this Draft

`server/ai/xaiContract.cjs` plus `server/ai/xaiContract.test.cjs` and isolated `.github/workflows/reflect-xai-readiness.yml`:

- Fixed `grok-4.3`, `POST https://api.x.ai/v1/responses`, single selected user's message with fixed non-clinical system instruction, `tools:[]`/`tool_choice:none`, `store:false`, capped `max_output_tokens=512`, no automatic history, profile, files, or other context.
- Strict schema and model/output parser accepts only one completed assistant text response; ignores reasoning segments and rejects any tool calls and malformed/out-of-budget responses. Length/usage checks reuse Stage04A policy.
- Informational calculation from published *noncached* text token tariffs, not a guaranteed invoice or hard money cap. **No model SDK, actual fetch, network default, API key or deployed Firebase runtime is wired.**
- `simulateXai` requires a test-only fixture callback plus a synthetic-only gate. CI has no provider credentials; real credit spending is technically impossible under this code path. Stage04C callable remains wired to its fixed mock responder and `AI_SESSION_ENABLED = false` in the browser.

## Owner operations — 1 to 3 clicks per checkpoint

1. **Billing → Manage auto top-up → Turn OFF → Save.** Send screenshot showing it OFF. Do not remove your saved payment method or touch existing keys.
2. **Billing:** locate any `Monthly invoiced billing limit` or `Invoiced spending limit`; use **$0** if present. Confirm this on screenshot rather than assuming.
3. Only after controls are verified: **API Keys → Create API key** dedicated `Reflect-dev`; restrict to Responses endpoint and `grok-4.3` if the UI supports both. Set strict key-level QPM/TPM (suggested prototype 2 requests/minute, 2,000 tokens/minute) and optional expiry. Secret should be stored only in the chosen server's secret manager, **not sent to ChatGPT, Drive or GitHub**. If UI controls differ, collect screenshot of controls BEFORE creating key.

A team-side credit balance is shared among all its keys; a separate key is operational isolation but **not** a separate independent wallet. The $8.64 displayed may change due to unrelated app use. Recommend only an explicitly approved **$0.50 Reflect smoke-test allocation**, no unattended polling/retries; no real call until approval and protected staging verification. A live provider smoke test needs a separate staging project and one synthetic user question with at most 512 output tokens; compare xAI Usage/Billing before and after. **No live request has been made in this stage.**

## Stage04E / release gates

- Real Firebase web App Check with reCAPTCHA Enterprise (or another officially suitable provider), registered on a **different**, owner-approved staging project; actual verification with genuine signed and tampered App Check tokens, Auth token revocation, and no fallback to emulator debug headers. Staging Cloud Functions may incur costs; explicit approval required.
- Confirm ownership of separate `Reflect-dev` server-only key, its ACLs, expiry, rate limits, available credit type and billing settings; confirm provider ZDR/retention policy and applicable regional/legal/data-processing obligations before allowing actual diary text. Never treat API success as privacy readiness.
- If using real xAI, implement an actual server-only provider adapter referencing Firebase Secret Manager, run mocked load and injected failure tests, then run **one** explicit paid synthetic smoke within approved budget. Price/region/terms must be rechecked on date of test.
- Existing App Check v2 emulator logic, UID-only client path restrictions, atomic quota user+global ledger, server kill switch and per-message consent must remain active. Provider failure consumes budget reservation, no automatic retry, no transcript or private fields in logs.
- Only after owner approval: client controls (clear opt-in consent, no automatic data upload, save answer only on user's action), production release and rollback. Stage05 accessibility/mobile tests remain pending.

**Current disposition:** provider xAI feasible for low-volume development, but auto top-up is ON and real production attestation / key scope / recurring billing conditions are not verified. No live integration authorization is assumed from the console screenshots alone.
