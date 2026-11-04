# Reflect 2.0 / Stage 01A — CRA → Vite foundation (DRAFT)

Source branch: `work/reflect-auth-stability-2026-11-04` (draft PR #3).
This branch is **not merged or deployed**. It must not be merged directly into `main`: it depends on PR #3.

## Scope
- Replace Create React App webpack dev/build with Vite 7 and React plugin.
- Migrate Jest-style mocked tests to Vitest while keeping their assertions.
- Preserve React 18, Firebase SDK 10, Firestore paths, Auth provider and existing user data.
- Move `public/index.html` to Vite root `index.html` and `src/index.js` to `src/main.jsx`.
- Keep Tailwind 3/PostCSS.
- Fail **closed** unless `VITE_FIREBASE_CONFIG` and `VITE_APP_ID` are explicitly provided. Do **not** fall back to existing Vercel `REACT_APP_*` values (Preview currently uses the real project).
- The previous client-side Gemini key is **not** migrated. AI messages deliberately return a user-visible unavailable error until a protected backend API is implemented. Do not provide/commit client AI secrets.
- No TypeScript conversion, Auth provider/Firestore migration, Firebase SDK upgrade, or UX redesign in this PR.

## Node and local QA
Use `Node 22.23.4` (already installed via asdf on the owner's workstation). Do not alter existing React QA environment without creating a separate checkout.

```bash
git clone --single-branch --branch work/reflect-vite-foundation-2026-11-04 \
  https://github.com/TheGor-365/reflect.git ~/reflect-vite-qa
cd ~/reflect-vite-qa
asdf set nodejs 22.23.4
npm ci --no-audit --no-fund
npm test
npm run build
```

**Lockfile now regenerated on Linux Mint with Node 22.23.4.** The owner verified `npm ci`, all 11 Vitest tests and `vite build`; CI is configured to repeat `npm ci`. Never run `npm audit fix --force` to disguise dependency warnings. No production environment was changed.

## Local demo Auth/Firestore only
Do not run the app using existing production Firebase or Vercel Preview settings. Use the independent demo environment on ports 9099 and 18081; it is separate from the personal-data restoration emulator at 18080.

Terminal A:
```bash
cd ~/reflect-vite-qa/tests/emulator
firebase emulators:start --project demo-reflect-auth-qa --only auth,firestore
```

Terminal B:
```bash
cd ~/reflect-vite-qa
export VITE_FIREBASE_CONFIG='{"apiKey":"demo-only-key","authDomain":"demo-reflect-auth-qa.firebaseapp.com","projectId":"demo-reflect-auth-qa","appId":"1:12345:web:demo"}'
export VITE_APP_ID=reflect-8fdc8
export VITE_USE_FIREBASE_EMULATORS=true
npm run dev
```

Visit only `http://127.0.0.1:3100`. Use invented names and journal content. Do not use Auth sign-out/clear storage on the real Vercel origin. Stopping a local dev server via Ctrl+C is safe.

## CI gates / limitations
- Unit tests PASS, Vite production build PASS with demo-only credentials, synthetic browser E2E PASS.
- Lockfile matches dependency graph, `npm ci` successful before approving PR.
- Existing journal, moods, goals, session list, profile and phone-sized layout visually unchanged. AI intentionally unavailable pending a secure server.
- Confirm no credential, live Firebase project config, private Firestore data, Auth JSON, journal content or token enters repo or CI.
- Actual Vercel Preview is **not** a safe Firebase test environment until its env variables are isolated. Do not trust a Preview build as permission to create test profiles there.
- No production deployment/merge until owner reviews screenshot and rollback plan.

## Vercel Preview diagnosis — 2026-11-04
- Vite build itself succeeds. Vercel was retaining the old CRA output-directory setting (`build/`), while Vite emitted `dist/`. Build failed with `[STATIC_BUILD_NO_OUT_DIR]`; source: authenticated Vercel deployment events for `ffa1e17`.
- A branch-owned `vercel.json` now sets the Vite framework, `dist` output directory, `npm run build`, and `npm ci`, without modifying the Vercel project-wide settings used by Production.
- The former `engines.node >=22.12.0` caused Vercel to select Node 26. Restrict `node` to `22.x` in package and lock metadata to match locally tested Node 22.23.4.
- A Vercel Preview deployment becoming READY is **not** safe to browse for test writes. It has no authorized isolated Vite Firebase config and must fail closed, while existing `REACT_APP_*` Preview variables still target production. Test real app behavior at `127.0.0.1:3100` with separate demo emulators instead. Never add production Firebase config or Gemini secrets to Vite browser env.
