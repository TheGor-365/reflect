# Reflect P0 — isolated Auth + Firestore browser QA

Only run this with the dedicated `demo-reflect-auth-qa` project. There are NO live Firebase resources for a `demo-` project. Ports: Auth 127.0.0.1:9099; Firestore 127.0.0.1:18081; React 127.0.0.1:3100. These intentionally differ from the restored-private-data Firestore Emulator at port 18080. All browser test data are synthetic.

The React app opts into emulators **only** when `REACT_APP_USE_FIREBASE_EMULATORS=true`, the browser is on localhost, and `REACT_APP_FIREBASE_CONFIG.projectId` is exactly `demo-reflect-auth-qa`. Otherwise, startup throws before any request to prevent an accidental live-project connection. This flag is **never** configured for Vercel Preview or Production.

## Automated QA
GitHub Actions runs `firebase emulators:exec --project demo-reflect-auth-qa --only auth,firestore` and starts the CRA dev server with an explicit, dummy web config. Playwright verifies:
1. An anonymous user can create a profile and a journal note on the demo project;
2. Reloading **the same origin and browser context** preserves the UID, profile, and note;
3. A fresh isolated browser context has a different anonymous UID and cannot see the first user's note;
4. All requests made by the test browser are restricted to fixed local service ports. No AI requests or production credentials.

This automated test does NOT verify restoration of a previously lost browser credential. A user with a cleared browser profile or different device needs a future account-linking feature.

## Local manual QA
Use a new checkout, separate from the private backup-tools clone. On Linux, ensure Node 22 or 24 and Java 21.

Terminal A:
```bash
cd ~/reflect-auth-qa/tests/emulator
firebase emulators:start --project demo-reflect-auth-qa --only auth,firestore
```

Terminal B:
```bash
cd ~/reflect-auth-qa
npm ci
export REACT_APP_FIREBASE_CONFIG='{"apiKey":"demo-only-key","authDomain":"demo-reflect-auth-qa.firebaseapp.com","projectId":"demo-reflect-auth-qa","appId":"1:12345:web:demo"}'
export REACT_APP_APP_ID=reflect-8fdc8
export REACT_APP_USE_FIREBASE_EMULATORS=true
HOST=127.0.0.1 PORT=3100 BROWSER=none npm start
```
Open only `http://127.0.0.1:3100`. Create a **synthetic** profile and journal note, reload and confirm the UID and note persist. Never use real journal content in demo QA. No `firebase deploy` or production database access is involved.

If production Firebase credentials are present in a local `.env` file, the explicit demo config and emulator-only guard must take precedence. Stop if the browser displays a real project ID or a nonlocal Firebase endpoint.

## CI evidence
Check `.github/workflows/reflect-auth-emulator-e2e.yml` for the actual running smoke tests and exact commit before claiming PASS. This README is not a substitute for a green workflow or manual browser observation.
