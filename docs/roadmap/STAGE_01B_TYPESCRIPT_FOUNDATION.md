# Reflect 2.0 — Stage 01B / gradual strict TypeScript

Stacked DRAFT PR based on `work/reflect-vite-foundation-2026-11-04` (PR #4); not main.

## Scope

1. Add strict `tsconfig.json` with `moduleResolution: "Bundler"`, `isolatedModules`,
   `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
2. Allow legacy JavaScript/JSX to keep running with `allowJs: true` but do NOT
   turn on `checkJs` globally. All new `.ts`/`.tsx` modules are subject to
   strict checking as they are migrated.
3. Establish minimal types corresponding to already-used journal and mood fields.
   They do not change Firestore schemas or existing records.
4. Migrate only `formatDate` pure display helper from JS to TS, with regression
   tests for null timestamps and identical Russian locale formatting.
5. No React, Firebase SDK or Tailwind upgrades; no UI/theme redesign or AI work
   in this narrow PR. No production release.

## Required reproducibility gate (NOT YET DONE)

Vite transpiles TS but **does not type-check**. A TS compiler and locked
dependency must be installed before this PR is ready for review:

```bash
cd ~/reflect-ts-qa
npm install --save-dev --save-exact typescript@5.9.3
# Later, after the "typecheck" script is committed:
npm run typecheck
npm test
npm run build
```

Commit `package.json` and `package-lock.json` together and switch CI back
to `npm ci` with `npm run typecheck` gate. Never merge solely because Vite
build succeeds.

## Isolation and safety

Use dedicated `demo-reflect-auth-qa` Auth/Firestore Emulators for any manual
QA. Do not use Vercel Preview to write synthetic records; existing Preview
Firebase credentials are shared with production. Never clear browser storage
or sign out existing anonymous production users.

Type additions do NOT prove that old Firestore records conform to a schema.
They only type new application modules; original JSONL and Auth backups are
untouched. Preserve PR #4's AI-release blocker pending protected server API.

## Acceptance

- Strict `tsc --noEmit` PASS.
- Existing 11 tests plus new date-format regression tests PASS.
- Vite build PASS.
- Chromium E2E on demo Auth/Firestore PASS.
- Existing desktop/mobile behavior unchanged; no production merge.
