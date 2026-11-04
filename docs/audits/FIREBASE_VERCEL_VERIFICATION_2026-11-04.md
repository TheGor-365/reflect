# Reflect — Firebase / Vercel evidence update (2026-11-04)

Purpose: stage-00 read-only verification, with owner screenshots and authenticated Vercel metadata. **No changes to live Firebase / Vercel / data / secrets.**

## Firebase / Firestore observations
Source: owner console screenshots, 2026-11-04.
- Firebase project display name: `reflect`; project ID `reflect-8fdc8`. Billing plan: Spark (no-cost).
- Firestore database: `(default)`.
- In Firestore Data, `artifacts` collection has a document identified as `reflect-8fdc8` with `users` subcollection shown. The intermediate document is reported as nonexistent in console. This is valid for an ancestor with nested subcollections and **does not prove user data is absent**. Content, Firestore document totals and individual account-to-document mappings are unverified.
- Firestore Rules screenshot shows active rule version selected 2025-07-07 9:17 PM; do not interpret this UI timestamp as an independently verified CLI rule release ID.
- Rule text transcribed:
```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
- Meaning: Authenticated Firebase clients are restricted by their UID when accessing matching user-scoped document paths. Anonymous Firebase Auth users are included. Nonmatching paths are implicitly denied unless another rule exists (the screenshot shows none).
- Weaknesses: no write-schema checks, document size/field constraints or operation-specific permissions. Nested wildcard is intentionally broad. Rules logic NOT tested against distinct real user accounts in this review.
- Caution: rules apply to Firebase client SDK access; privileged backend/admin SDK requests bypass Firestore Security Rules and require server IAM controls.

## Authentication inventory (owner screenshots, 2026-11-04)
- Authentication > Users showed **11 entries** (table footer: 1–11 of 11), each identified as **(anonymous)**.
- Authentication > Sign-in method showed **Anonymous: Enabled** as the only listed sign-in provider; Google sign-in was suggested by the UI but NOT enabled.
- 11 auth records do **not** establish 11 unique humans, 11 active users, or 11 Firestore user documents. Created dates span 2025–2026; some may be older browser installations.
- Do NOT delete anonymous accounts, clear browser storage, sign out from existing Reflect client, disable the Anonymous provider, or change authentication settings before verifying a safe identity-linking pathway and backup. Do NOT publish identifiers or personal journal data.
- Upgrade plan: enable an approved permanent sign-in provider only later, link the authenticated anonymous account to the permanent credential without changing its UID where supported; validate in isolated tests first. Official guidance: https://firebase.google.com/docs/auth/web/anonymous-auth
- Account count verified visually; Firestore user documents and content remain unverified. The next read-only check is to click the `users` subcollection in the right-hand Firestore Data pane, then report only collection names and approximate non-sensitive counts.

## Backup feasibility
- Official documentation: Firestore managed export/import and managed backups require billing enabled, Firebase Blaze plan. Source URLs:
  - https://firebase.google.com/docs/firestore/manage-data/export-import
  - https://firebase.google.com/docs/firestore/backups
- Current Spark does not support those provider-managed options. Do **not** upgrade plan or run a paid export without separate user authorization.
- Evaluate a private, local client/SDK-based export and an isolated restore test after collection inventory, supported data types, and a secure admin access method are confirmed. This is **not** a substitute for a validated backup or restore.
- No backup, verified restore or Auth export has been produced.

## Vercel observations
Source: authenticated Vercel connector after owner approved access, 2026-11-04.
- Project `reflect`; project ID `prj_R9SFmPlNlnVYiZ69QDGuDzeJxsUi`; framework `create-react-app`.
- Production aliases include `reflect-three.vercel.app`. Latest inspected production deployment was `READY`, from source SHA `b3a72c240bd193e89346a0a5655861cc726f4d61` (`main`).
- Verified only names/types/targets of three Vercel environment variables:
  - `REACT_APP_FIREBASE_CONFIG` (encrypted; prod/preview/development)
  - `REACT_APP_APP_ID` (encrypted; prod/preview/development)
  - `REACT_APP_GEMINI_API_KEY` (encrypted; prod/preview/development)
- Environment values, secret health, Google Gemini API authentication and quotas NOT tested.
- A preview deployment was automatically triggered by documentation-only branch commit `820af9bc3240f8bea16b981755fe3859d3132c35`; deployment `dpl_DqjNWfT9w9ZJoRtM5ampZnsC7Q4H` is `ERROR`. **The production deployment remains READY**. Failure occurred because `react-scripts build` treats warnings as errors with `CI=true`:
  - `src/features/Sessions/Sessions.jsx:49`: `textToSend` assigned but unused (`no-unused-vars`)
  - `src/firebase/config.js:19`: `analytics` assigned but unused (`no-unused-vars`)
- Do not set CI=false to bypass this. Make a distinct small code-fix PR with a real build test in the next independent engineering step, after evidence capture, and do not merge/deploy to production without release gate.

## Hosting distinction
Owner referred to Firebase Hosting, but Firebase Console project/Firestore screenshots by themselves do not identify an active Firebase Hosting site. Vercel production IS confirmed. To establish dual hosting, inspect Firebase Console > Hosting & Serverless > Hosting, sites, release history and domains, read-only.

## Stage-00 remain open
[~] Inspect user collection names and record counts without disclosing UIDs, emails or journal text (7 visible UID paths; sample nested collections; total reads pending).
[x] Inspect Firebase Auth provider inventory/user count by owner screenshot (11 anonymous accounts; Anonymous provider only).
[x] Inspect Firebase Hosting console: onboarding/Get started screen, no deployment shown.
[ ] Define and execute a secure private backup including nested Firestore collections.
[ ] Verify isolated restore/readback and user identity mapping.
[ ] Evaluate rules via emulator (owner and non-owner access paths).
[ ] Verify release/rollback for each active hosting target.

Evidence quality: screenshots + connector metadata; tests/backup are pending. No security penetration test claimed.


## Follow-up evidence: user collections, Hosting and repeated onboarding (owner screenshots, 2026-11-04)
- Firestore path: `artifacts/reflect-8fdc8/users`. The console displays **seven visible UID paths** under this collection. Some ancestor document snapshots may not exist while their subcollections do; **do not interpret seven visible paths as seven existing parent documents**.
- One historical UID path visibly has subcollections `diaryNotes`, `moods`, `profiles`; real records were displayed under all three (from 2025). Session/goal content and full-document counts for all UIDs remain **unverified**.
- Profile sample contains personally provided profile fields; never copy the displayed profile name, age, exact UID, or journal content into public GitHub or a shared/AI-indexed Drive folder.
- The Firebase Hosting console shows the `Get started` onboarding view with no release history or existing deployment dashboard. This is strong evidence that Firebase Hosting was **not set up** for this Firebase project at inspection time; Vercel remains the verified frontend host.
- Owner reports the UI asks for profile/registration on each visit. Source `src/hooks/useAuth.js` signs in anonymously whenever it sees no user, potentially creating a new UID if previous browser auth state is lost. `src/App.jsx` shows the profile-creation modal both when the profile document does not exist **and when Firestore `getDoc` fails**. Thus transient read failure is misrepresented as registration. Actual browser failure cause (auth persistence vs changed UID vs Firestore error vs race) is NOT established.
- Product acceptance requirement: persisted auth identity on a browser restart, distinguish transient profile load failure from new-account onboarding, preserve anonymous UID by supported credential linking, test same browser / another browser / deleted local storage / offline / two independent accounts. Do not disable anonymous auth or clear browser storage until backup and linking are validated.
- Firebase web auth defaults to local persistence: https://firebase.google.com/docs/auth/web/auth-state-persistence
- Firebase anonymous-link flow: https://firebase.google.com/docs/auth/web/anonymous-auth

## Stage 00 backup implementation status
- A separate draft PR #2 prepares a read-only Firestore REST inventory/archive tool: https://github.com/TheGor-365/reflect/pull/2
- The utility traverses missing ancestor documents via REST `showMissing=true` and `listCollectionIds`, uses local ADC and produces a private typed-JSONL archive plus hash manifest. This is NOT Firebase managed export, an Auth export, a point-in-time snapshot, or a tested restore.
- The first offline mocked CI run for PR #2 returned success, 2026-11-04. **No production data exported.**
- Separately, `firebase auth:export` can export user-account metadata, to be stored privately after review: https://firebase.google.com/docs/cli/auth
- To close the checkpoint: real private Firestore+Auth export with verified counts/sha256, isolated Firestore restore/readback and identity preservation tests, plus rollback decisions.

## Live Firestore read-only inventory — owner terminal output, 2026-11-04
- Environment: Linux Mint, Python 3.12.3, Google Cloud CLI and Firebase CLI installed, isolated Python venv; no credentials or private records supplied.
- Source: actual `python tools/backup/reflect_firestore_backup.py --project reflect-8fdc8 --inventory-only` run in cloned backup-tool branch, not a mock.
- Run completed without REST error; reported `documents=26`, `missing_ancestors=8`, `paths_checked=34`.
- Collection counts: `diaryNotes=3`, `moods=7`, `profiles=7`, `goals=6`, `sessions=3`. Sum 26.
- Six offline unit tests also passed locally (6/6), in addition to successful GitHub Actions offline tests. These tests do **not** validate production restore.
- ADC emitted a warning: no quota project specified. It did not stop this read-only inventory. Do not change IAM or billing merely to suppress a warning.
- This is **inventory only**; no .jsonl archive, checksum evidence, separate Firebase Auth export, or restore confirmation has been received. The 11 anonymous Auth users remain intact as far as shown by previous console screenshots, but no independent new Auth count was read here.
- Next acceptance: owner runs private local Firestore JSONL archive outside Git repo, validates hash/doc count, independently exports Auth metadata to a private JSON file, then tests isolated restore; never share archive contents or token values.

## Private archive evidence — owner terminal output, 2026-11-04
- Owner executed `reflect_firestore_backup.py --project reflect-8fdc8 --output <private local archive>` successfully on Linux Mint. Firestore archive contains **26 documents**.
- Owner independently calculated SHA-256 and checked against manifest: **MATCH**. Counts: **MATCH**. Unique Firestore document paths: **MATCH**. Do not publish, transmit or commit the raw archive.
- Owner executed `firebase auth:export` into a separately protected local JSON archive: **11 Auth accounts exported successfully**; independently re-counted 11.
- Firestore typed archive and Auth metadata are **present and integrity-checked**, but not independently encrypted/off-machine or recovered. Firebase Auth anonymous browser sessions cannot be restored from Auth JSON alone.
- The Google ADC quota-project warning was nonfatal; read/export succeeded. Do not change billing just to silence the warning.
- Stage 00 gate now **BACKUP CREATED / LOCAL INTEGRITY VERIFIED; RESTORE TEST PENDING**. Production data and authorization remain unchanged by the export scripts.
- Draft PR #2 now additionally contains a strictly localhost/demo-project restore verifier and local-emulator instructions. No real restore has yet been confirmed; do not mark stage 00 completed.

## Java emulator blocker and CI portability — owner log, 2026-11-04
- On Linux Mint, `java -version` returned `command not found`; therefore `firebase emulators:start --project demo-reflect-restore --only firestore` failed before starting any local server.
- The subsequent `verify_emulator_restore.py --restore` failed with `Connection refused` to fixed local `127.0.0.1:18080`. It did **not** connect to the production project or write restored documents.
- Offline tests initially 12/13 on owner's machine because `test_rejects_nonprivate_directory` created a directory with `mode=755` but shell `umask 077` masked permissions; test setup was corrected to explicitly `chmod(0o755)`, commit `953883e6e0056e221f1214103ab8f39279ec6145` in PR #2. Both subsequent GitHub Actions runs succeeded on that SHA. A fresh local test run is still pending.
- The local integrity `--check-only` passed for 26 docs and matching SHA-256. **Isolated restore remains UNVERIFIED.**
- Next owner action: install OpenJDK 21 headless, pull PR #2 working branch, rerun 13 offline tests, start Firebase emulator and verify listening on 127.0.0.1:18080 before attempting restore again.

## Local emulator startup — owner terminal evidence, 2026-11-04
- OpenJDK 21.0.12.1 successfully installed on Linux Mint.
- The owner's checkout of PR #2 fast-forwarded to commit `953883e6e0056e221f1214103ab8f39279ec6145`.
- The entire offline suite passed on the owner's workstation: **13 tests; OK**.
- Firebase CLI started the Firestore Emulator for fixed `demo-reflect-restore` project, with Firestore bound to `127.0.0.1:18080` and Emulator UI to `127.0.0.1:14000`. Console displayed “All emulators ready.”
- This confirms the local emulator infrastructure only. **Owner has not yet provided evidence that the 26-document archive was restored or verified through field readback.** Do not close stage 00 on emulator startup alone.
- Next: run `verify_emulator_restore.py --check-only` and then `--restore` against the local emulator; verify 26 documents and exact typed-field readback. No real user data is to be uploaded to GitHub/chat.

## Emulator restore regression analysis and correction — 2026-11-04
- Owner's first local restore attempt failed before writes with a generic `Emulator not empty/ready` message. The UI showed empty; the previous code incorrectly grouped all non-404 errors under that message. A hypothesis of unauthenticated HTTP 403 was NOT established as the specific cause.
- After adding an emulator-only `Authorization: Bearer owner` header, the owner observed exact **HTTP 400** on the preliminary probe. The probe used `__probe__`, which violates Firestore's documented document-ID restriction `__.*__`: https://firebase.google.com/docs/firestore/quotas#collections_documents_and_fields.
- PR #2 removes that artificial probe and checks each real archived document path for 404 before any write, refusing 400/403/200. No live Firebase data is modified.
- Real Firestore Emulator integration tests using **synthetic, non-user data** subsequently exposed canonical timestamp formatting at microsecond precision. The verifier now accepts equivalent fractional-second formats only when extra digits are all zero; nonzero lost precision remains a fatal mismatch.
- Both GitHub workflows passed on latest PR #2 commit `54a10d1101057d484c5f29d5d738a0ff58dec885`: offline tests and a real-emulator synthetic restore/readback plus no-overwrite check. CI source: https://github.com/TheGor-365/reflect/actions/runs/41820203954.
- IMPORTANT: No owner evidence of actual 26-document restore/readback has been provided yet. Stage 00 restore gate remains OPEN. Do not treat a successful synthetic CI run as a restoration of the private archive.

## Owner-verified local Firestore recovery — 2026-11-04
- User terminal output confirms checkout `54a10d1101057d484c5f29d5d738a0ff58dec885` of backup tools and **16/16 offline tests passing**.
- Local restore command `verify_emulator_restore.py --archive <private firestore JSONL> --restore` completed SUCCESSFULLY against the fixed `demo-reflect-restore` emulator at `127.0.0.1:18080`.
- Returned `restored_documents: 26`, `field_readback: MATCH`, `firestore_restore_verified: true`, `auth_identity_restore_verified: false`. The original source archive SHA256/checksum had also been independently verified prior to restore.
- Scope: relative Firestore document paths and typed user fields confirmed in a **local isolated emulator**. Original server-owned `createTime/updateTime` metadata is NOT preserved. Google-managed point-in-time backup, Auth account sessions and recovery are NOT claimed.
- Production Firestore, Firebase Auth, Vercel and GitHub `main` were not modified by the described local commands.
- Stage 00: **Firestore recovery gate PASS**; complete private Auth↔Firestore UID mapping, encrypted off-device copy, local Security Rules tests and auth continuity plan before auth/schema production migrations.
- PR #2 now includes offline aggregate-only Auth↔Firestore UID checker and encryption runbook `tools/backup/IDENTITY_AND_OFFSITE.md`. Identity mapping against owner's private files has not yet been run.

## Firestore ↔ Auth UID association — owner terminal evidence, 2026-11-04
- Local, offline tool `python -m tools.backup.check_identity_links` completed successfully on exports already stored in a private Linux folder. It did **not** contact Firebase or change production.
- Firestore archive: 26 documents under **7 distinct UID scopes**. Firebase Auth export: **11 accounts**.
- Exact UID intersection: **7 matched**; **0 Firestore scopes without an exported Auth account**; **4 exported Auth accounts without matching Firestore documents**.
- Per-collection totals: `diaryNotes=3`, `goals=6`, `moods=7`, `profiles=7`, `sessions=3`. Do not publish original UIDs or private profile/diary fields.
- `all_firestore_scopes_have_auth_records=true` confirms the exported identities are referentially aligned **at backup time**. This is **not** a successful Auth import, browser-session restore, identity linking, or account recovery.
- GnuPG 2.4.4 is installed with AES256 support. **No encrypted off-device copy or decryption test reported yet**; that remains the next operator action.
- Status: Firestore archive integrity PASS; isolated Firestore restore/readback PASS; Auth metadata export PASS; UID association PASS; encrypted off-device copy PENDING; Auth login continuity/security tests PENDING.
