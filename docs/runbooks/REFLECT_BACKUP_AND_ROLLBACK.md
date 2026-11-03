# Reflect — backup and rollback runbook (draft; NOT EXECUTED)
Date: 2026-11-04. This is a runbook; it is not a backup receipt.

## Safety rules
Do not delete/replace an existing Firebase project, auth user, Firestore collection, Hosting channel, Vercel production alias, API key or data volume during inventory. Never paste keys, tokens, service account JSON, private logs, Firestore export files or identifying user content into GitHub or shared portfolio Drive.

## Read-only inventory
1. In Firebase Console, locate the project used by the running app (compare non-secret projectId and appId metadata to local config), Firestore database(s), Security Rules, Authentication sign-in methods, Hosting sites/releases. Record date and non-sensitive IDs privately. Avoid publishing real account UIDs from screenshots.
2. In Vercel, inspect the `reflect` project, Git repo/production SHA and aliases; inspect only **names and targets** of env vars, not their values. Confirm whether `reflect-three.vercel.app` is the authoritative production URL; do not assume it is Firebase Hosting.
3. Identify whether anonymous accounts must be preserved before changing Firebase Auth. Do not sign out or clear site storage as an experiment.

## Backup evidence gate (human-controlled, private)
- Choose an available Firebase-native managed backup / export path consistent with the actual Firebase plan, region, database type and retention requirements. Record export job ID, timestamp, source database, destination storage access policy and encrypted artifact location **privately**. Do not invent a working backup path or assume export is supported until verified.
- Perform an isolated restore/import in a NON-production environment/project with matching schema and rules. Validate a bounded non-sensitive record count and actual reads; assess auth-UID association and data migration needs. Record reviewer and result. Do not restore into live database.
- Keep original production database and credentials intact; obtain explicit owner confirmation before any destructive operation.

## Rollback gates
- Frontend: preserve original Git SHA `b3a72c240bd193e89346a0a5655861cc726f4d61`; keep existing production deployment available, verify procedure for restoring previous Vercel/Firebase Hosting release.
- API: use versioned endpoints/prompts, feature flags and separately deployable routes; disable only the new integration if errors occur.
- Data: prefer additive schema migration, backward-compatible reads and staged cohort tests; never plan to rollback a destructive Firestore migration without a tested restore.

## API secret hygiene
Current `REACT_APP_GEMINI_API_KEY` in browser is not secret. Do not copy or inspect the value in a chat. A future trusted dashboard operation should revoke or rotate any affected key, replace with a server-only secret, apply provider restrictions and verify quotas. This phase intentionally does NOT connect or rotate live keys.

## Stage exit condition
All evidence above is recorded and restore succeeds in isolation. If provider access is missing, mark 'BLOCKED' and continue only non-destructive, independent work.
