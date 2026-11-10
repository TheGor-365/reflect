# Reflect 2.0 · AI-01B.3 · Firestore consent rules · 2026-11-10

**Draft candidate only. NOT DEPLOYED to actual Firebase Test, staging, or production.**

## Confirmed starting point

- UX-01D journal kind switcher: owner confirmed functioning in deployed Firebase Hosting staging.
- UX-01E AI Settings: owner terminal log confirmed Hosting-only deploy from `3a167114d28f36ee0b2a7e08d5683cbeb9bca06f`. Reload persistence has NOT been owner-verified.
- PR #46 AI-01B.2 server reader: isolated library and synthetic tests only; **not wired into Railway or live xAI**.
- The current `server/hosted/firestore.rules` still has a broad UID-scoped recursive write permission. Therefore it would allow the browser to create `aiContextGrants` if deployed unchanged. Do not treat such grants as trusted until this security boundary is deployed and tested. No grant reader may be activated prematurely.

## Scope of this PR

Dedicated *synthetic* staging candidate `tests/staging/firestore.candidate.rules` now includes:

1. `/artifacts/reflect-8fdc8/users/{uid}/aiSettings/preferences`:
   - Owner-only get, create and update. No delete or list.
   - Mandatory schema version 1, exact allowlisted fields and types, known response-depth/tone/frequency values.
   - A true `autoSaveRecommendations` requires `recommendationsEnabled` true.
   - No field that could mint memory access, provider credentials, billing privileges, or unbounded token budgets.
   - `updatedAt` optional Firestore timestamp, matching web `serverTimestamp()` save behavior.
2. `/artifacts/reflect-8fdc8/users/{uid}/aiContextGrants/{grantId}`:
   - Owner-only get/list for visibility.
   - **NO client create/update/delete**, including from the same authenticated user.
   - Only a future trusted, Auth+App Check-validated server endpoint may create or revoke those documents through Admin SDK; this separate consent protocol is NOT implemented yet.
3. Existing diary/profile/mood/goal/session candidate rules preserved. This change does not remove legacy support or modify any user data.

New synthetic REST integration: `tests/staging/ai-context-smoke.cjs`, run in the same disposable demo environment as `tests/staging/rules-smoke.cjs` (Auth 19099, Firestore 19081, `demo-reflect-stage03h-rules`). Covers same-owner settings create/read/edit, cross-owner and anonymous denial, extra field and invalid schema denial, contradictory preference flags, blocked deletes, blocked self-issued grants, server-created synthetic grant visibility, blocked forged scope/expiry/revocation changes, and private ledger isolation. No real user content or xAI key.

The existing GitHub Actions workflow `reflect-staging-rules-candidate.yml` now runs **both** suites in one emulator process, so legacy-write compatibility and new permission restrictions are jointly checked.

## Security boundary and planned next stages

**Do not deploy candidate directly.** This is a field-rules proof, not a final production Rules deployment or server consent service. The test-mode rules may coexist with broader hosted Rules; broad Rules can override narrow ones through OR semantics. Before activating:

- Audit all currently deployed Firestore rules, including recursive `match` blocks, and remove any broader allowance for `aiContextGrants`.
- Confirm the owner has read/export/backup of existing data and check legacy schema, including UID mapping.
- Implement a versioned authenticated consent endpoint with explicit per-source opt-in and a trusted server timestamp. It must support inspection/revocation and protect against replay, cross-owner IDs, expired or deleted sources.
- Emulate the **final effective ruleset** (not only the isolated candidate) before deploy.
- Connect `ownerContextAccess` to verified Auth + App Check, then to source-scoped context retrieval and the token/budget planner. Reject missing/invalid grants; never fetch all diary data to filter afterward. Apply per-source allowlist at query time.
- Verify that AI preferences are never interpreted as a grant, and that enabling an option does not cause paid background requests.
- Only after these gates: context indicator and recommendations with source citations and opt-in frequency.

## QA commands (CI-owned)

```bash
# Avoid executing against any real project or importing any personal JSON.
cd tests/staging
GCLOUD_PROJECT=demo-reflect-stage03h-rules firebase emulators:exec \
  --config firebase.json --project demo-reflect-stage03h-rules \
  --only auth,firestore \
  "node rules-smoke.cjs && node ai-context-smoke.cjs"
```

A successful CI run establishes only isolated candidate behavior. **UI settings persistence is still a separate owner acceptance test.**

**Definition of done for this PR:** candidate Rules compile, original Stage03H synthetic suite passes, added permission/security matrix passes; no active Firebase Rules, Railway or xAI deployment.
