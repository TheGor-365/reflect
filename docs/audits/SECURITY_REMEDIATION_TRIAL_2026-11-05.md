# Reflect 2.0 — trial security remediation, 2026-11-05

**State: EXPERIMENTAL DRAFT, NOT VERIFIED, NOT DEPLOYABLE.** This branch is stacked on Draft PR #5 and is separate from `main` and production.

## Root cause and owner audit evidence
Owner's local `npm audit --omit=dev --json`: 14 runtime-tree findings (10 moderate, 2 high, 2 critical). Four named high/critical transitive dependencies are `protobufjs@7.5.3`, `websocket-driver@0.7.4`, `@grpc/grpc-js@1.9.15`, and `undici@6.19.7`, all via `firebase@10.14.1`. `fixAvailable: true` did **not** prove an automatic compatible version resolution.

Advisory ranges include:
- `protobufjs`: many advisories up through `<=7.6.4`. Trial patched 7.x release `7.6.6`, verify against **every** reported advisory.
- `websocket-driver`: affected `<0.7.5`; trial `0.7.5`.
- `undici`: most restrictive reported finding `<6.29.1`; trial `6.29.1` within Node 22-supported 6.x.
- `@grpc/grpc-js`: `<1.13.6` is vulnerable and the Firebase Firestore dependency pins `~1.9.0`; trial `1.14.5`, but this override is **outside Firestore's declared range** and may duplicate an unsafe nested `1.9.x` copy. DO NOT assume the override resolves the finding.

References:
- https://github.com/protobufjs/protobuf.js/security/advisories/GHSA-j3f2-48v5-ccww
- https://github.com/advisories/GHSA-m9gg-hp2v-232j
- https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c
- https://github.com/firebase/firebase-js-sdk/issues/10400
- https://docs.npmjs.com/cli/configuring-npm/package-json/#overrides

## Experimental package.json change
- Move `@testing-library/react` and `@testing-library/user-event` from runtime `dependencies` into `devDependencies`; no application imports of these packages are expected.
- Pin four trial `overrides` named above. **These settings do not prove every nested instance was replaced.**
- Do not change `firebase` major, Firestore paths, Auth persistence, existing IDs, real data or API keys. No production deployment.

## Required owner local gate: regenerate lock and inspect nested copies
Because `package-lock.json` has NOT been regenerated in GitHub, initial CI/Vercel checks on this branch may fail `npm ci`. This is an expected **unresolved work state**, not a successful build.

In an **isolated checkout** of this exact branch, with Node `22.23.4`:

```bash
npm install --package-lock-only --no-audit --ignore-scripts
npm ci --no-audit --no-fund
npm ls @grpc/grpc-js protobufjs websocket-driver undici --all
npm audit --omit=dev
npm run typecheck
npm test
npm run build
```

`npm audit` returns nonzero when vulnerabilities remain; report the output and the FULL nested version tree **without** suppressing nested copies. Treat any stale `@firebase/firestore/node_modules/@grpc/grpc-js@1.9.x` as a blocker. Do not hide audit failures with `|| true`.

If overrides throw `EOVERRIDE`, `ERESOLVE`, or other errors: STOP and report exact text; do not run `--force` or `npm audit fix --force`.

Only after lockfile and tests pass, commit `package-lock.json` and any necessary compatible manifest adjustments to this experimental branch. Keep `.tool-versions` local. Then rerun GitHub Actions and Chromium demo-only Auth/Firestore E2E, and re-audit moderate issues.

## Outstanding release blockers
- Secure server-side Gemini API and controlled key rotation (client AI intentionally disabled in PR #4).
- Vercel Preview has Firebase environment overlap with production; do not write demo users to Preview.
- Safe permanent Auth account linking and rollback planning are not completed.
- The three preceding PRs (#3, #4, #5) are still DRAFT, unmerged. This security experiment does not authorize their merge or a production release.

## Owner's resolved graph + remaining development advisories — 2026-11-05
- Owner independently executed `npm install --package-lock-only --no-audit --ignore-scripts` and then `npm ci --no-audit --no-fund` in the separate `~/reflect-security-qa` checkout. Both PASS.
- Exact local `npm ls @grpc/grpc-js protobufjs websocket-driver undici --all` shows **only** `@grpc/grpc-js@1.14.5`, `protobufjs@7.6.6`, `websocket-driver@0.7.5`, and `undici@6.29.1` for those four packages, with no vulnerable nested copies, under unchanged `firebase@10.14.1`.
- Owner `npm audit --omit=dev` says `found 0 vulnerabilities`. This is npm's current report on locally installed runtime-classified dependencies, NOT a guarantee of runtime compatibility or all security flaws.
- Owner `npm run typecheck` PASS, Vitest **14/14** PASS, `npm run build` Vite 7.3.7 PASS. Pre-existing React act warnings, mock permission errors and 531.55 KB chunk-size warning are non-blocking.
- Owner committed **only** `package-lock.json` as `d296c21eb0010fc4427187c090844bf2b9cece56` and successfully pushed to PR #6. Local `.tool-versions` remains untracked.
- Full `npm audit --json` still reports **9 development-inclusive advisories: 8 high, 1 moderate, 0 critical**. Their package names and dependency paths are **not yet identified**; this needs a separate read-only audit triage.
- GitHub workflows `reflect-ts-foundation-ci.yml` and `reflect-auth-ci.yml` on commit `d296c21` both PASS (runs `41920025779`, `41920025846`). Chromium demo E2E run `41920025770` remained in progress at recording time; its completion must be checked.
- Added a dedicated CI security gate `.github/workflows/reflect-runtime-audit.yml` in commit `c186ba59826df503ffe5ad79f0d00d3d855838a2`. It runs `npm ci` then `npm audit --omit=dev --audit-level=moderate`; must inspect run before claiming PASS.
- Remaining release blockers: potential Firebase gRPC API incompatibility outside declared Firestore semver range, detailed 9-advisory dev audit, Preview Firebase isolation, AI server-backed API, anonymous account upgrade/rollback. No production merge/deploy; PR #6 DRAFT, stacked on #5.

## Development dependency findings — owner full npm audit (2026-11-05)
- Owner executed `npm audit --json` on isolated `~/reflect-security-qa`; remaining **9 findings**: HIGH `brace-expansion`, `browserslist`, `glob`, `minimatch`, `nanoid`, `picomatch`, `postcss`, `source-map-js`; MODERATE `postcss-selector-parser`. All `fixAvailable: true`, only `postcss` is an `isDirect: true` dependency, classified as dev in the project. Production audit still 0.
- Verified exact locked instances and parents from GitHub `package-lock.json`:
  - `brace-expansion@2.0.2` <- `sucrase/node_modules/minimatch@9.0.5`;
  - `browserslist@4.25.1` <- `autoprefixer@10.4.21`, `@babel/helper-compilation-targets`;
  - `glob@10.4.5` <- `sucrase@3.35.0`; `minimatch@9.0.5` <- nested glob;
  - `nanoid@3.3.11` and `source-map-js@1.2.1` <- `postcss@8.5.6`;
  - `picomatch@2.3.1` in three nested 2.x packages (`anymatch`, `micromatch`, `readdirp`) and `picomatch@4.0.7` at root; investigate the 2.x copies, not blindly override 4.x;
  - `postcss@8.5.6` is a direct devDependency and consumed by Vite/Tailwind;
  - `postcss-selector-parser@6.1.2` <- Tailwind CSS 3.4.17 / postcss-nested 6.2.0.
- Public maintainer release notes identify compatible patches within existing major lines for several packages: `postcss-selector-parser@6.1.5` (backported security fix for Tailwind 3), `picomatch@2.3.2` (security patches), `nanoid@3.3.12`, `source-map-js@1.2.2`, `brace-expansion@2.0.3`. These are candidate baselines, **not yet verified against all npm advisories**. Updated PostCSS `8.5.x` versions exist. Always verify actual npm audit advisory `via[].range` and resolved `npm ls`.
- Do **not** add unconditional root overrides for multiple major lines of `picomatch`, `brace-expansion`, or `minimatch`; those can break other tooling. Prefer existing allowed semver resolution first.
- Next owner action: gather per-package advisory ranges and `npm audit fix --dry-run` candidate to determine whether patch updates are enough, then run a single scoped fix in the already isolated security PR #6 branch (not a separate production branch). No updates applied yet.
- CI on security branch HEAD `f32d5d`: locked TypeScript, Vitest 14 and Vite build PASS; standalone runtime audit PASS; synthetic Chromium Firebase Auth/Firestore E2E PASS (run 41920385644). Does not prove postcss tooling advisories resolved.
