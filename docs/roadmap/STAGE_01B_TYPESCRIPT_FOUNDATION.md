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

## Locked TypeScript verification

Vite transpiles TS but **does not type-check**. The owner pinned
`typescript@5.9.3` as an exact development dependency and committed both
`package.json` and `package-lock.json` together in `0e0762c`.
The CI workflow has been switched from temporary `npx --package` to
the project's locked TypeScript compiler:

```bash
cd ~/reflect-ts-qa
git pull --ff-only
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
```

The owner's initial pre-push run reported `typecheck` PASS, 14/14 Vitest
and Vite build PASS. GitHub CI is rechecking the pushed and locked graph.
Do not merge solely because Vite build succeeds.

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

## Mobile and safety evidence — 2026-11-05
- Owner provided Chrome iPhone 14 Pro Max (430px) screenshot: sidebar opened correctly, dimmed backdrop, close X, navigation and profile visible. Closing/menu navigation not yet independently demonstrated.
- Owner locally reported 23 npm audit findings (11 moderate, 10 high, 2 critical) while installing TypeScript. This is an advisory count, not verified exploitable vulnerabilities in browser production; triage dependency paths and direct/runtime reachability separately before release. Do not run `npm audit fix --force`.
- CI strict TypeScript workflow was changed to `npm ci` → `npm run typecheck` → `npm test` → `npm run build`; demo-only E2E is configured to trigger on this TypeScript branch. Await green run results before claiming browser smoke after push.
- Existing AI API is not production-safe in Vite migration until it moves server-side, and Vercel Preview is not a safe Firebase test environment. PR #5 remains DRAFT and stacked; no production data writes.
