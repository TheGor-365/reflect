# Reflect 2.0 — AI-01I: owner-controlled per-session grant/list/revoke
**2026-11-11 | Draft UI gate | No real grant issued by developer tools**

## Evidence accepted
- Owner executed Firebase Hosting-only deploy pinned to `49746c5ad411f723eec229fc5a3636085a60032e`, with `VITE_ENABLE_REFLECT_CONTEXT_CONSENT` explicitly OFF.
- Owner screenshot of current signed-in staging AI Settings shows **PASS 4/4** for the newly activated `/v1/privacy/context-consent`: unsigned list denied, signed list accepted, replayed limited-use App Check denied, unknown test grant revoke accepted. This test creates no grant.
- Railway `reflect-ai-api` staging is Online at `b247312863c2593563f5f53bc01aaa6ca994e535`, deployment `e0752996-cddc-4c00-87f2-3b101837329e`; no staged changes at the start of this stage. Admin-only grant records + server-private daily grant quota were previously verified with Firebase emulator and real staging-source Firestore Rules.

## AI-01I hardening
The existing, gated ContextConsentPanel allows only an explicitly chosen signed-in account session with a separate unchecked consent checkbox and `Разрешить на 15 минут`. It never transfers session text, and `/v1/ai/reply` does not read session history.
- After successful `grant`, request a new signed `list` call and require the **same minted grant ID**, selected source ID, `session-turns` scope and future expiry. Otherwise display `grant-readback-mismatch`; do not claim success. Unknown result might still represent a real grant; user should use `Проверить разрешения` to inspect/revoke later.
- After successful `revoke`, request a new signed `list` call and require the ID to be **absent**. Otherwise display `revoke-readback-mismatch`. Never falsely claim revocation.
- The server owns UID and validates the selected session; `list` never implicitly issues a grant. Staging server limit remains 12 new grants/account/UTC day, TTL 15 minutes, revocation permanent, scoped to one session.
- Added regression tests for mismatching ID/source/expiry and false revoke confirmation; existing UI manual-grant and account-switch tests retained.

## Release and test gate
1. All exact-head CI workflows green. Keep this PR Draft; do not merge to main or deploy Railway/Rules/production.
2. For isolated Hosting staging only, owner builds this commit with their existing `.env.staging.local` and **temporary process-scoped** `VITE_ENABLE_REFLECT_CONTEXT_CONSENT=true` (the private env file must not be edited). Verify exact Firebase staging config, namespace, App Check, Railway origin, existing Railway AI flag, and exact Hosting site. Deployment command uses `firebase.staging.json` and `--only hosting`.
3. In the owner-authenticated staging browser, AI Settings → `Контекст и доступ к истории`: first click `Проверить разрешения` without selecting a source; expect a signed list, ideally `Действующих разрешений нет`.
4. Owner personally selects **one** saved session, checks `Я разрешаю доступ...`, clicks `Разрешить на 15 минут`. This is an explicit authorization to create a *private metadata grant*, not AI content access. Confirm grant entry appears after server readback; no session content leaves Firestore.
5. Owner clicks `Отозвать` for that grant; expect updated list and no active grants. Refresh and verify no current grant. A quota counter/tombstone remains in private Firestore for replay protection.
6. If the real grant operation returns `permission-denied`, `not-found`, `consent-unavailable` or mismatch, stop and inspect only safe error code + staging server logs. Do not weaken Auth, Rules, account entitlement, or project checks to force success.

## Privacy and scope
- Before enabling UI flag, authenticate in staging app. Never paste Firebase Auth tokens, App Check values, UIDs, raw session document paths or transcript text into chat.
- `VITE_ENABLE_REFLECT_CONTEXT_CONSENT=true` merely renders an explicit consent-management UI. A grant currently does **not** let Grok read history; that requires a separate source-specific provider integration, bounded preview, audit/delete policy and explicit rollout gate.
- No production, main, Firestore Rules, Railway, paid Grok or personal data mutations by this PR. Real grant created only via user's deliberate click.
