# Reflect 2.0 Stage04G — permanent hosted Grok architecture (staging first)

Date: 2026-11-07. State: stacked Draft, no deployment and no production
data modification. The xAI key stays with the owner until an explicitly
approved separate Firebase staging secret configuration.

## Current owner's error is not an invalid key

The updated ~/reflect-stage34-live client posted a scenario object to
127.0.0.1:19107, but an older Stage04E Node process still owned that port.
The old proxy rejected the extra scenario property with HTTP400 invalid-payload
before any provider call. Starting the updated proxy failed with EADDRINUSE.
The local fix would be to identify the old listening process with
ss -lptn 'sport = :19107' and stop only that known old process.
This is NOT the permanent integration architecture.

## Full hosted path

1. A separately approved reflect-ai-stage-* Firebase Web App enables signed
   reCAPTCHA Enterprise App Check and a Firebase Functions client.
2. React Sessions sends one selected message, a unique request ID, and explicit
   versioned consent through Firebase httpsCallable with limited-use App Check
   tokens. No profile, history, UID or diary archive in the API payload.
3. A Functions v2 onCall function enforces App Check, consumes the limited-use
   token, requires Firebase Auth, checks the registered staging app ID, and
   binds the server-only REFLECT_XAI_KEY via Firebase Secret Manager.
   It fails closed unless the actual project matches a separate approved
   reflect-ai-stage-* ID AND REFLECT_AI_ENABLED=yes.
4. The durable Firestore server-only ledger atomically reads a kill switch,
   user/day and project/day limits and a never-expiring hashed request ID.
   Failing/time-out requests keep their budget reservation; the same request
   ID can never automatically spend again.
5. Server sends only the chosen text to xAI grok-4.3 Responses, store:false,
   no tools, capped output, timeout and no automatic retry. A completed reply
   is displayed in Sessions. User explicitly clicks Save Session to persist
   the chosen conversation; a failed reply does not erase their draft.

## Staging budget and important limitation

Provisional reserved ticks per call = 100000000 ($0.01); per owner per UTC day
= 500000000 ($0.05); global daily = 2000000000 ($0.20). These limits bound
newly admitted server requests, NOT necessarily the final vendor charge.
Actual usage.cost_in_usd_ticks is recorded when available. A cost above the
per-call reserve disables new requests; ambiguous failures are never refunded.
A separate xAI provider-side budget and review of currently ON auto top-up
is required. Cloud Functions, Firestore, App Check Enterprise and Secret
Manager may charge Google Cloud separately from existing xAI credits.

## Owner-owned staging deployment prerequisites

Use a NEW Firebase project with a verified ID matching reflect-ai-stage-*,
not the current live/Test project. Enable Auth, Firestore, Cloud Functions
billing where required and register the intended staging Web App with real
reCAPTCHA Enterprise App Check. Confirm GCP billing and roles before deploy.

From the approved PR worktree run:

    node server/hosted/scripts/prepare-functions.cjs
    npm install --prefix server/hosted/functions --no-audit --no-fund

Create locally in server/hosted/functions, never in Git, an environment
file named .env.<STAGING_PROJECT_ID> containing:

    REFLECT_AI_ENABLED=yes
    REFLECT_AI_APPROVED_PROJECT=<STAGING_PROJECT_ID>
    REFLECT_AI_APP_CHECK_APP_ID=<REGISTERED_FIREBASE_WEB_APP_ID>

Then only AFTER the owner approves this exact staging project and potential
Google Cloud charges, run the Firebase CLI with the explicit --project flag:

    firebase functions:secrets:set REFLECT_XAI_KEY --project <STAGING_PROJECT_ID>
    cd server/hosted
    firebase deploy --config firebase.json --project <STAGING_PROJECT_ID> --only functions:reflect-ai-staging

The first command prompts for the key locally: NEVER paste it into chat, Git,
Vercel or any VITE_ variable. No key or production deployment is done in CI.

For a separate Vercel Preview (not production), set these PUBLIC variables:

    VITE_FIREBASE_CONFIG=<PUBLIC_STAGING_WEB_CONFIG_JSON>
    VITE_APP_ID=reflect-8fdc8
    VITE_USE_FIREBASE_EMULATORS=false
    VITE_ENABLE_REFLECT_CLOUD_AI=true
    VITE_AI_STAGING_PROJECT_ID=<STAGING_PROJECT_ID>
    VITE_APP_CHECK_SITE_KEY=<PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY>

Register the Preview site as an App Check-approved domain and authorize it
for Firebase Auth. Existing Firestore data and rules are NOT automatically
migrated. Before enabling client saving, review UID-scoped session rules and
explicitly DENY client access to _reflectAiPrivate. A unique, isolated stage
is essential; do not expose the original Test project to these changes.

## Current acceptance vs remaining gates

The Draft contains a deployable hosted Functions package (generated from
vetted server/ai modules), browser callable, server-owned money/token ledger,
per-message consent, explicit Save Session and isolated emulator fixtures.
CI performs no paid xAI request. Success in the emulator does NOT establish
real signed App Check; hosted staging must confirm it before production.
No main merge, no production deploy, no real diary data transfer, no
assumption that $8.64 xAI credits cover independent Google Cloud costs.

Official docs: https://firebase.google.com/docs/functions/callable
https://firebase.google.com/docs/app-check/cloud-functions
https://firebase.google.com/docs/functions/config-env
https://docs.x.ai/developers/rest-api-reference/inference/responses
https://docs.x.ai/developers/cost-tracking


## Stage-only Firestore Security Rules and real App Check

The dedicated staging rules in server/hosted/firestore.rules permit only
authenticated UID-owned artifacts/reflect-8fdc8/users/{uid}/... documents;
they **deny all client reads and writes** to the protected
_reflectAiPrivate tree, including kill switch, quota ledger and per-user
budget counters. Admin SDK Cloud Functions bypass the client rules.
Deploy only to the verified NEW staging project, in a separate owner-approved
operation (the Functions-only deploy does NOT deploy rules):

    cd server/hosted
    firebase deploy --config firebase.json --project <STAGING_PROJECT_ID> --only firestore

Check staged data/schema and deny rules before testing browser saving.
Never point this command at the existing owner Test/production Firebase
project, because a rules deploy replaces its existing rules.

Official App Check guidance requires a score-based reCAPTCHA Enterprise
Web key registered for the staging domain, with signed real attestation.
Do not register localhost in a future production key. The site key can
be public, but the xAI key is a server-only Secret Manager value.
The limited-use App Check request option must match the function
consumeAppCheckToken=true setting and its service account needs the
required App Check Token Verifier permission. These are blocking
release prerequisites, not assumptions proven by emulator CI.

Official sources:
https://firebase.google.com/docs/cli
https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
https://firebase.google.com/docs/app-check/cloud-functions
