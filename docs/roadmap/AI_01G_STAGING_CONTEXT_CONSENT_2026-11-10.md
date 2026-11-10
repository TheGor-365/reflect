# Reflect 2.0 — AI-01G staging consent API + management UI
**2026-11-10 | Draft code only | Not deployed | No historical AI read**

## Prerequisite
Stacked on PR #51 (AI-01F contract), PR #50 (UX-01F), PR #49 (UX-01E), PR #45 (AI Settings).
Owner accepted the staging AI settings persistence and section restore on 2026-11-10.

## New implementation, isolated by TWO flags
- **Server:** `REFLECT_CONTEXT_CONSENT_API_ENABLED=yes` explicitly authorizes a separate consent-management endpoint **only in trusted staging**. Default missing/anything else = OFF; Railway's current runtime is untouched. The existing `REFLECT_AI_ENABLED`, Auth+App Check, staging project/appId/origin, and per-account entitlement continue to apply. No production host is allowed.
- **Client:** `VITE_ENABLE_REFLECT_CONTEXT_CONSENT=true` in an isolated Hosting staging build, with existing public staging App Check config. Default OFF in `.env.staging.example`. Existing settings and one-message Grok reply are unaffected.

## Endpoint and data contract
`POST /v1/privacy/context-consent` (exact path, no query strings):
- `{action:"grant",grantId:"<UUID>",scope:"session-turns",sourceId:"<existing-own-session-ID>",consentVersion:"2026-11-10-01"}`: requires signed, unrevoked Firebase Auth; consumed limited-use App Check; exact staging appId/Origin; active staging-only account entitlement; and session existence in UID namespace. Expires in 15 minutes from trusted server clock.
- `{action:"revoke",grantId:"<previous grant>"}`: still requires signed Auth/AppCheck, but deliberately **not paid account entitlement**, so access can be revoked even after entitlement expires. Revocation retains an immutable server-side tombstone and invalidates subsequent checks.
- `{action:"list"}`: returns bounded **active** grant IDs, source IDs and expiries to the verified current owner, without transcript/UID. Nothing is loaded until explicit owner UI action.

All operations go to `/_reflectAiPrivate/reflect-8fdc8/contextGrants/{uid}/grants/{grantId}` through Firebase **Admin** SDK; browser Firestore access remains forbidden by current Rules. No browser-created grant is trusted. No request contains personal notes or transcript.
HTTP errors use only bounded safe codes and no raw internal messages.
**Issuer is NOT connected to the AI reply handler or provider context pipeline.** A grant currently cannot cause any AI historical data read.

## UI
AI Settings → “Контекст и доступ к истории”: owner-only saved session dropdown, explicit consent checkbox, “Разрешить на 15 минут”, “Проверить разрешения”, and “Отозвать”. When the feature is OFF the panel displays a clear unavailable state. Existing AI preferences save remains separate, and never doubles as consent.

## QA gates
1. CI: isolated Node 22 contract test covers signed Firebase Auth/App Check boundary (App Check verifier is an injected deterministic fixture, **not a live signed staging token**), entitlement (including revoke post-expiry), strict JSON/body/path/Origin checks, owner/replay/TTL.
2. Firebase **Auth + Firestore Emulator** on `demo-reflect-context-consent`, ports `19099/19081`; synthetic Auth login, Admin Firestore transaction + owner separation; live Firestore Rules deny browser read/write to `_reflectAiPrivate`; real data and project never used. **App Check is not emulated** — testing its real consumable tokens remains a later staging-only acceptance gate.
3. Exact-head Vite CI + TypeScript + browser QA; test UI disabled and enabled flows; verify no raw session text or foreign UID in API requests.
4. Only after CI and owner staging go/no-go: separately deploy **server source** with consent flag OFF, negative Auth/App Check tests; then separately approve turning flag ON and UI staging-only. No setting of both flags without explicit user authorisation.
5. Before connecting to Grok, implement *new* privacy scope-aware provider endpoint with source preview, hard byte/token caps, current user entitlement and grant recheck just before read/send, cancellation, auditing, deletion and billing review. No provider history reading in this PR.

## Explicit stop
- No merge to main, production deploy, Firestore Rules publish, new entitlement or billable provider call.
- Even if a user explicitly issues a grant once this is enabled later, **Grok still receives only the one-message context** until a separate reviewed integration.
- Do not log or publish real UIDs, Auth/App Check tokens, session contents, email, screenshots of secrets.
