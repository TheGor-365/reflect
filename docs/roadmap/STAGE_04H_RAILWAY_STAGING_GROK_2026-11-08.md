# Reflect Stage04H — Railway Grok staging (2026-11-08)

## Existing systems and boundaries
This is an isolated alternative to Firebase Functions v2 in Draft PR #35, not a new Reflect app.
Production Vercel and original Firebase project reflect-8fdc8 remain untouched.
Railway project reflect-ai-railway-staging: 2843e21f-d811-4ee5-b773-ec626142ef77
Railway environment staging: 5342ac2d-d1a5-4828-871f-164e50ff5e2d
Existing public staging site: https://reflect-ai-staging.web.app
Staging Firebase ID: reflect-ai-staging
Registered Web App ID: 1:599679789981:web:d4d8743dbff0fe40af1d74

## Server deployment, disabled by default
Source: this Stage04H branch, pinned to an approved commit (not main).
Build command: npm install --prefix server --omit=dev --no-audit --no-fund
Start command: node server/railway/index.cjs
Healthcheck: /healthz
Railway non-secret environment variables:
- REFLECT_AI_ENABLED=no
- REFLECT_XAI_OUTBOUND_ENABLED=no (independent paid-request gate, OFF by default)
- REFLECT_AI_ALLOWED_UID=(empty until owner chooses test Firebase UID; required when paid egress enabled)
- REFLECT_AI_APPROVED_PROJECT=reflect-ai-staging
- REFLECT_AI_APP_CHECK_APP_ID=1:599679789981:web:d4d8743dbff0fe40af1d74
- REFLECT_AI_ALLOWED_ORIGIN=https://reflect-ai-staging.web.app
Check GET /healthz (200, aiEnabled false); correct-origin POST (503); invalid-origin (403). No real xAI call.

## Private credentials — owner-only, later
Set ONLY within the Railway service private Variables UI, never GitHub, chat, Drive, shell history, VITE variables or logs:
- REFLECT_FIREBASE_SERVICE_ACCOUNT_JSON: service account restricted to the isolated reflect-ai-staging Firebase project. Must have necessary private Firestore and App Check Token Verifier permissions. Confirm actual GCP project and least privileges. Key export can be restricted by policy; do not bypass it.
- REFLECT_XAI_KEY: reuse existing scoped Reflect-dev credential; never send it to the assistant.

The server refuses to start in enabled mode without both credentials, and rejects any Firebase service account whose project_id is not reflect-ai-staging.

## Security policy
- Explicit Auth ID token + signed, consumable Firebase App Check token (consume:true); wrong app, consumed token or wrong Origin is denied before model use.
- Existing server/ai/hostedHandler.cjs and hostedBudget.cjs keep the one-message consent contract, immutable request ID replay ledger, authenticated UID, exact model selection, atomic Firestore reservations and private no-logging rules.
- REFLECT_AI_ENABLED=yes alone is insufficient. The private Firestore runtime flag at _reflectAiPrivate/reflect-8fdc8/runtimeFlags/ai must also exist with enabled:true. It defaults OFF.
- Provisional money reservations: USD 0.01 per call / 0.05 owner per day / 0.20 staging project per day. They are NOT a provider-side absolute spending cap.
- xAI model and response are returned to the browser; server stores no message body/response. Response stays local until explicit Save Session.

## Browser activation — only after backend acceptance
Update only the isolated staging public build with:
VITE_ENABLE_REFLECT_CLOUD_AI=false
VITE_ENABLE_STAGING_APP_CHECK=true
VITE_ENABLE_REFLECT_RAILWAY_AI=true
VITE_REFLECT_RAILWAY_AI_ORIGIN=https://EXACT-Railway-service-domain.up.railway.app
Keep existing Firebase web project config and AppCheck public site key. Do not put the xAI or Admin credentials in Vite. Build npm run build -- --mode staging and deploy Hosting only through the existing firebase.staging.json after explicit owner release review.

## Real provider acceptance gates
1. Exact-head GitHub CI, Railway SUCCESS, /healthz green with AI disabled.
2. Owner-installed stage-only Admin identity, safe signed Auth and App Check replay verification, negative unauthorized access, exact CORS and project scope.
3. Firebase private ledger and kill switch (no client read/write); verify transaction behavior and spending controls.
4. Verify xAI team Usage and saved billing limits; get explicit consent for ONE synthetic non-personal paid request.
5. Confirm returned Grok model reply, actual provider cost receipt or unknown, UI consent and explicit Firestore Save Session. Never retry automatically on ambiguous results.
6. No production go/no-go, PR merge or personal diary requests without separate approval.

Reference: https://firebase.google.com/docs/app-check/custom-resource-backend
Reference: https://firebase.google.com/docs/auth/admin/verify-id-tokens
Reference: https://docs.railway.com/pricing


**2026-11-09:** Firebase Auth runtime may be enabled with `REFLECT_AI_ENABLED=yes` for negative authorization/attestation tests. Do not set `REFLECT_XAI_OUTBOUND_ENABLED=yes` or private Firestore runtimeFlags/ai enabled until explicit owner approval of a paid synthetic message. Even with valid Auth and App Check, HTTP returns `503 provider-disabled` while egress gate is OFF.

**Paid staging owner gate:** The public Firebase staging site may issue anonymous Firebase accounts. Auth + App Check are not an owner approval. The Railway HTTP bridge requires REFLECT_AI_ALLOWED_UID to equal the single signed-in staging owner UID before any provider call; if the value is absent, REFLECT_XAI_OUTBOUND_ENABLED=yes prevents startup. Owner copies UID privately from Firebase Auth → Users to Railway Variables, never into GitHub, source code or public Vite config. Keep outbound OFF during browser Auth/AppCheck QA.

## 2026-11-09 — Safe signed browser QA before any paid AI

Owner's Linux Mint curl evidence at 2026-11-09 13:39 UTC:
- GET https://reflect-ai-api-staging.up.railway.app/healthz returned HTTP 200, `{"status":"up","aiEnabled":false}`.
- POST /v1/ai/reply with correct Origin, JSON {}, no token returned HTTP 401, `{"error":"unauthenticated"}`.

**Independent browser signed precheck:** PR #36 now contains a staging-only diagnostic UI in Sessions. It is OFF by default and does not enable the normal AI send button. To activate in an isolated **local** staging build only, keep `VITE_ENABLE_REFLECT_CLOUD_AI=false`, `VITE_ENABLE_REFLECT_RAILWAY_AI=false`, set `VITE_ENABLE_REFLECT_RAILWAY_PRECHECK=true` and `VITE_REFLECT_RAILWAY_AI_ORIGIN=https://reflect-ai-api-staging.up.railway.app`. Keep all existing public Firebase config / App Check site key. No server-only secrets in Vite variables.

The one-shot button sends exactly `{}` to /v1/ai/reply with a signed Firebase Auth ID token and consumable App Check token, and validates **only** HTTP 503 `{"error":"provider-disabled"}` as signed-auth success. HTTP 401/403/500 or a generic 503 is a failure. A successful QA response means Auth + App Check server gates were passed; xAI provider egress remains forcibly disabled and no session content is transferred.

**Important:** Because the Railway API enforces exact browser Origin, a local `http://127.0.0.1:3100` build cannot prove this endpoint as signed staging browser QA. Publish only the reviewed **Hosting** bundle to `reflect-ai-staging` after explicit owner preview/release review; never merge to main or deploy production. Firestore private kill switch remains OFF. Real Grok calls and session-saving are separate acceptance stages requiring owner approval.

Keep the xAI outbound flag `REFLECT_XAI_OUTBOUND_ENABLED=no` throughout this precheck; do not enable `VITE_ENABLE_REFLECT_RAILWAY_AI` until signed precheck succeeds and separately approved one synthetic paid request is ready.


## Stage05B transition — private account entitlement (2026-11-09)

**Superseding design in Draft PR #37, not deployed:** the temporary
`REFLECT_AI_ALLOWED_UID` environment-variable gate described above is for the
old Stage04H Railway runtime. The proposed Stage05B code no longer reads that
variable; access requires a current verified Firebase account and a private,
expiring Firestore document. Read
`docs/roadmap/STAGE_05B_SERVER_ENTITLEMENT_2026-11-09.md` for the exact
schema, staging-only client-Rules verification, safety checks and rollout.
Do not infer a Railway deploy, a granted entitlement or an xAI response from
the GitHub commit. Paid egress remains off until owner-approved controlled QA.
