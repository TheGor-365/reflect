# Reflect P0 — isolated Auth + Firestore browser QA

Only run this with the dedicated `demo-reflect-auth-qa` project. There are NO live Firebase resources for a `demo-` project. Ports: Auth 127.0.0.1:9099; Firestore 127.0.0.1:18081; React 127.0.0.1:3100. These intentionally differ from the restored-private-data Firestore Emulator at port 18080. All browser test data are synthetic.

The React app opts into emulators **only** when `VITE_USE_FIREBASE_EMULATORS=true`, the browser is on localhost, and `VITE_FIREBASE_CONFIG.projectId` is exactly `demo-reflect-auth-qa`. Otherwise, startup throws before any request to prevent an accidental live-project connection. This flag is **never** configured for Vercel Preview or Production.

## Automated QA
GitHub Actions runs `firebase emulators:exec --project demo-reflect-auth-qa --only auth,firestore` and starts the Vite dev server with an explicit, dummy web config. Playwright verifies:
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
export VITE_FIREBASE_CONFIG='{"apiKey":"demo-only-key","authDomain":"demo-reflect-auth-qa.firebaseapp.com","projectId":"demo-reflect-auth-qa","appId":"1:12345:web:demo"}'
export VITE_APP_ID=reflect-8fdc8
export VITE_USE_FIREBASE_EMULATORS=true
HOST=127.0.0.1 PORT=3100 BROWSER=none npm start
```
Open only `http://127.0.0.1:3100`. Create a **synthetic** profile and journal note, reload and confirm the UID and note persist. Never use real journal content in demo QA. No `firebase deploy` or production database access is involved.

If production Firebase credentials are present in a local `.env` file, the explicit demo config and emulator-only guard must take precedence. Stop if the browser displays a real project ID or a nonlocal Firebase endpoint.

## CI evidence
Check `.github/workflows/reflect-auth-emulator-e2e.yml` for the actual running smoke tests and exact commit before claiming PASS. This README is not a substitute for a green workflow or manual browser observation.

## Stage 03C — private local persistence for **synthetic QA only** (2026-11-06)

The standard `firebase emulators:start` command **does not persist** Auth users or Firestore documents after a normal stop unless an export is made. The private stage-00 restore on port **18080 is separate** and must never be imported into demo QA. This workflow persists **both** Auth and Firestore together; it does not make a production account recoverable.

`npm run qa:state -- status` only reports whether a complete private snapshot exists.

**Existing owner QA session still running on 9099/18081: save it before stopping anything.** From the *updated* `~/reflect-chat-qa` checkout, with both emulators still running:

```bash
cd ~/reflect-chat-qa
npm run qa:state -- save
npm run qa:state -- status
```

The tool looks up the Firebase hub specifically for `demo-reflect-auth-qa` and validates the hub is serving Auth `127.0.0.1:9099` and Firestore `127.0.0.1:18081`, **not** the separately restored Firestore `18080`. If validation fails, export is refused. It never invokes `firebase deploy`, never contacts a live Firebase project, and never overwrites older snapshots.

Only after `save` has reported success, stop the **Auth + Firestore QA terminal tab** using `Ctrl+C`; keep the private 18080 restore running. For subsequent starts, use one dedicated terminal tab:

```bash
cd ~/reflect-chat-qa
npm run qa:state -- start
```

This imports the newest validated snapshot and configures automatic export on a **clean `Ctrl+C` stop** to a **new versioned directory**. Killing a process, a power failure or an emulator crash can skip the export; use `save` for a checkpoint before risky operations. If the newest snapshot is incomplete, the helper refuses to start empty rather than silently abandoning your previous data.

The export directory is fixed outside this Git checkout:

```text
~/.local/share/reflect-qa/demo-reflect-auth-qa/snapshots/
```

Its parent directories are owner-only (`0700`). **This is NOT encrypted** and MAY contain personal text, Auth account metadata and password hashes. Do not upload it to GitHub, Google Drive or a shared folder; do not screenshot its contents, share Auth recovery links, or transfer it to the private Stage-00 restored database. Enable full-disk encryption if you plan to retain sensitive QA data locally, and use synthetic content whenever possible.

**Staging is a different workstream:** a brand-new Firebase staging project and verified real email delivery are still required before release. Stage 00's owner-only encrypted production backup and restoration rehearsal are unchanged.

CI unit tests validate the storage root, no-overwrite behavior, malformed manifest rejection and exact emulator hub ports. Actual owner-environment snapshot restoration of the existing QA user remains unconfirmed until the owner performs the two commands above and verifies login + diary after a clean restart.

Official Firebase reference: https://firebase.google.com/docs/emulator-suite/install_and_configure
