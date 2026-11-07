# Reflect 2.0 — staging Hosting setup (PR #35, 2026-11-08)

**Scope:** only Firebase project 'reflect-ai-staging', public static
React/Vite build and signed App Check startup. Not the main/production
Firebase project, not iLab, not a Cloud Functions deployment. No xAI
API key is present in the build or required to publish it.

## Verified before this runbook

- Firebase CLI 15.34.2 authenticated on owner's Linux Mint;
  'firebase projects:list' returned iLab, original Reflect and NEW
  'reflect-ai-staging' (project number 599679789981).
- Isolated '~/reflect-stage35-hosted' git worktree exists, originally at
  code revision 'ec6e447'. This is a detached worktree; update it
  explicitly when new Draft PR #35 commits pass CI.
- Firebase Anonymous Auth enabled, Firestore (default) created, UID
  rules and private AI ledger deny rules published; Firebase App Check
  registered with Fraud Defense/recaptcha Enterprise. None of these
  establishes a working signed token from the published browser.
- Owner's Firebase Hosting setup wizard has advanced to 'Initialize
  your project'. Firebase CLI is installed; do not install again.
  The Hosting site shown in console URL is 'reflect-ai-staging'.
  The site has NOT yet been confirmed serving a deployed React build.

## New code: deliberate split of App Check from paid AI

- 'firebase.staging.json' at repository root defines **only** Hosting:
  exact site 'reflect-ai-staging', 'public: dist', SPA fallback rewrite,
  defensive headers. It has no Firestore or Functions deployment sections.
- '.env.staging.example' provides public Firebase Web config placeholders
  for the *new* project only. Fill from Firebase Console -> Project
  Settings -> 'Reflect AI Staging Web', along with the public reCAPTCHA
  Enterprise Site Key. No xAI token or Firebase service-account JSON.
- 'src/firebase/config.js' recognizes
  'VITE_ENABLE_STAGING_APP_CHECK=true' independently from
  'VITE_ENABLE_REFLECT_CLOUD_AI=false'. This allows the first static
  staging site to receive genuine signed App Check tokens before the
  backend is deployed and before paid AI actions become visible.
- '.env.staging.local' and hosted Functions env files are Git-ignored.
  'npm run build -- --mode staging' loads the local stage public
  settings; 'dist/' is ignored. Do not commit generated binaries.

## Owner's Linux commands (AFTER PR #35 CI is green)

1. First check that local detached worktree is unmodified:
   ```bash
   cd ~/reflect-stage35-hosted
   git status --short
   ```
   The output must be empty. If nonempty: stop and inspect; do not
   reset/clean/delete unrelated changes.
2. Update only this new detached worktree to the approved PR #35 HEAD:
   ```bash
   git fetch origin work/reflect-stage04g-hosted-ai-bridge-2026-11-07
   git switch --detach FETCH_HEAD
   npm ci
   ```
3. Copy the safe public example to a local ignored file and edit
   **only public** values from Firebase Console:
   ```bash
   cp .env.staging.example .env.staging.local
   nano .env.staging.local
   ```
   Replace 'FIREBASE_PUBLIC_WEB_API_KEY' with the Firebase **Web**
   'apiKey' (not the private xAI key). Replace
   'PASTE_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY' with the *public*
   score-based site key you registered for
   'reflect-ai-staging.web.app' / '.firebaseapp.com'.
   Keep 'VITE_ENABLE_STAGING_APP_CHECK=true' and
   'VITE_ENABLE_REFLECT_CLOUD_AI=false'. Do not expose either key in a
   screenshot; the first is public Firebase config but keeping local
   avoids accidental posting of an unrelated secret.
4. Check the exact configured Hosting site and build:
   ```bash
   firebase hosting:sites:list --project reflect-ai-staging
   node --test tests/ai-stage04g/hosting-config.test.cjs
   npm run build -- --mode staging
   ```
   Stop if the site is missing, the CI/source revision does not match,
   or build fails. Do not deploy a default Firebase placeholder.
5. AFTER explicit review of steps 1–4, publish **Hosting only**:
   ```bash
   firebase deploy --config firebase.staging.json \
     --project reflect-ai-staging --only hosting
   ```
   Check exact reported site URL and open
   'https://reflect-ai-staging.web.app'. Inspect the browser for
   console errors, Firebase Auth sign-in, App Check token acquisition,
   and any denied Firestore access. Do not share private logs or tokens.

## Boundaries

- Hosting on Spark may be available for static assets within plan
  quotas. Upgrading to Blaze for Functions v2 and linking a Google
  Cloud billing account is an INDEPENDENT, later owner decision.
- The hosted AI callable is deliberately **OFF** in the first stage
  build. The existing localhost proxy on :19107 is irrelevant to
  this hosted site; leave it alone.
- Firebase App Check registration alone is not an enforced signed
  request; test a real staging browser session before enabling
  Firebase App Check enforcement.
- Never use 'firebase init' or deploy without --project here.
  Do not merge to main or modify Firestore/Functions/Secret Manager
  until the corresponding separate owner action.

Sources:
https://firebase.google.com/docs/hosting/full-config
https://firebase.google.com/docs/hosting/test-preview-deploy
https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
