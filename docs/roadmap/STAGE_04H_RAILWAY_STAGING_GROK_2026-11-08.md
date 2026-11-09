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
