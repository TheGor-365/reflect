# AI-01K Gate 5 — Jack staging fixture preparation
**12 Nov 2026 · Draft code only · no Hosting or Railway deploy.**

## Goal and product boundary

The owner authorized preparation for test account **Jack** and states **Eric** is also test-only. Keep Jack/ Eric separate; do not copy personal or legacy Eric content to Jack. Goal is a **reproducible signed browser security acceptance**, not another demo UI or an xAI paid request.

Existing Gate 5 status-only QA transport (PR #61 stacked into PR #65) targets the exact fixture:
- Firestore source ID: `ai01k_gate4_synthetic_20261111`
- Title: `AI-01K Gate 4 Synthetic QA`
- Owner path: `artifacts/reflect-8fdc8/users/{signedUser.uid}/sessions/{sourceId}`
- Exactly five short synthetic user/assistant turns, of which last four are included in Preview. No real text, secrets or personal data.

This Draft adds a gated **create-if-absent-only** client fixture creator in the Gate5 QA panel. It only writes the signed user's own `sessions` document and is **OFF in ordinary builds**. No grant, runtime flag, entitlement or provider request is created. It requires Firebase project `reflect-ai-staging`, namespace `reflect-8fdc8`, App Check enabled, the Gate5 QA/Consent/Preview staging build flags, `auth.currentUser.uid` match, non-anonymous verified email, explicit checkbox and click. A transaction refuses a collision; it never overwrites an existing document. Repeated clicks on an exact fixture are idempotent.

Before the fixture action becomes available, owner manually probes `_reflectAiPrivate/reflect-8fdc8/entitlements/{own UID}` using the real signed Firestore client. Required result **PERMISSION_DENIED**, even when no document exists. An accessible empty result is **FAIL**. The component never reads/outputs entitlement content; no token/UID/code is shown. This only proves denial for the currently signed owner — full Rules audit and guest/cross-user negatives remain separate.

## Readiness and deployment gates

1. Code/CI: exact-head synthetic unit/UI/transport/regression tests and build must pass. PR remains Draft.
2. Obtain separate owner **GO** for Firebase **Hosting staging QA build** (PR head exact SHA; three extra Vite flags for Consent, Preview, Gate5 QA=true; cloud/Railway AI=false). Stage still targets `reflect-ai-staging`. Preview backend remains OFF. Other Hosting public app visitors may see QA UI only under eligible Auth conditions; avoid leaving diagnostic build running beyond test. Do not touch production.
3. In account **Jack** (verified registered account), open staging AI settings and click **Проверить защиту приватного реестра**. Must report PASS: denied. If unsafe/unavailable, STOP. Then check dedicated fixture checkbox and click **Создать синтетический сеанс (без AI)**. Observe one new session; refresh and verify title. Does not grant any access.
4. **Admin provisioning is separate** from normal Firestore browser client. In staging Firebase Console (never share UID in chat or GitHub), identify the Jack UID in Authentication Users and cross-check emailVerified. Only after full active Firestore Rules review and owner permission, use Firebase Console/Admin to create a private doc under `_reflectAiPrivate/reflect-8fdc8/entitlements/{Jack UID}`:
   - `enabled`: Boolean `true`
   - `role`: String `staging_tester`
   - `model`: String `grok-4.3`
   - `expiresAt`: Firestore Timestamp, **1–2 hours ahead**, at most 31 days
   A normal browser must **never** be allowed to create this doc. No service credentials exported, copied or published. No client provisioning endpoint. Verify the server's current entitlement before proceeding. When no longer needed, disable/revoke **only** Jack's entitlement by privileged console after explicit approval; never touch Eric.
5. Obtain **separate** owner GO for a **temporary Railway staging Preview ON**: `REFLECT_CONTEXT_PREVIEW_API_ENABLED=yes`, controlled health negative smoke, manual owner issue one 15-minute synthetic-only consent grant, then manual replay/cross-route/revoke. All HTTP results must be status-only:
   - Same-token Preview 200→401
   - Cross-route Preview→Consent and Consent→Preview 200→401→200→401
   - Revoke with fresh token, owner list no grant, direct Preview 403
   - Backend Preview OFF again, final POST 404 with Railway SUCCESS.
   No actual xAI dispatch. **No automatic grant**; never revoke other sessions. Unexpected 200/replay or private Rules readable → STOP and rollback.
6. After Gate5 live PASS, separately approved paid Grok 4.3 Stage05B one-message synthetic E2E. Check provider current rates, real budget, entitlement, anti-replay, quota, no secret leaks. Public production separate GO.

## Current known infrastructure (read-only, 12 Nov 2026)

- Railway staging project `reflect-ai-railway-staging`, service `reflect-ai-api`, deployment `ecee79ff-d991-4e54-9a3d-b5c4abd38990` SUCCESS, source PR #59 SHA `71e64a5d`; no staged patches. Connector withheld live variable **values**; owner prior rollback reported Preview OFF.
- Firebase Hosting staging PR #65 SHA `bef748fe` deployed with Consent/Preview/Gate5 QA flags **false**; the preparatory fixture UI in this Draft is NOT live.
- Jack real email verified; separate Firefox session retains diary entry `Reflect QA Stage05A`; same account persists. Eric has older broader fixture data; no need to modify it.
- Prior default Firebase Email action template update was blocked with `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`; do not revisit, it does not block Gate5.

## Evidence discipline

Use exact commit SHA, CI workflow links, Firebase/Hosting deployment results and **only status-only screenshots**. Never record UID, raw headers, Firebase/App Check tokens, entitlement document JSON with personal IDs, one-time action URL, real chat history, service-account credentials, xAI keys. CI PASS is not proof of live signed provider behavior. Keep two distinct statuses **code ready** and **live authorized**.

## Product direction

Gate5 is not scope creep. It is the security barrier for opt-in session context, which cannot be sent to xAI before a fresh, per-session and per-dispatch consent and backend recheck. Concurrent product work should prioritize **Stage05B real single-message Grok** with quotas and bounded cost; then Diary/Moods/Goals/Sessions and responsive Midnight Aurora acceptance, security+privacy, production go-live. Avoid delaying launch over Firebase email template customization; existing Firebase Auth flow is operational.
