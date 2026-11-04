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
