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

## AES-256 private archive validated — owner terminal evidence, 2026-11-04
- Owner produced a locally stored encrypted bundle named `reflect-private-retry1.tar.gpg` containing three private files: Firestore JSONL, its integrity manifest, and Firebase Auth JSON. **None of the private files or the encrypted bundle were shared into this repository or chat.**
- Verified via `test -s`, `stat`, `sha256sum` and `gpg --decrypt | tar -tf -`.
- Encrypted file size: **6217 bytes**, permissions **0600**, ciphertext SHA-256 `27eec4e1c214d2feb1a78217c0f639c0b2b5bea9038a893edadf8c5cc8c1ccb4`.
- GnuPG reported **AES256.CFB** and one passphrase; all three intended filenames were listed; pipeline exited successfully with **DECRYPT + TAR: PASS**.
- This validates local encrypted-bundle readability, **not** recovery from a second physical/cloud location. Off-device copy with restricted access and hash readback remains pending. Do not store or publish passphrase; keep it in a password manager.
- Stage 00 evidence summary: 26 Firestore docs backed up and recovered locally with typed-field readback MATCH; 11 Auth records backed up; all 7 Firestore UID scopes map to exported Auth records, with 4 Auth entries having no Firestore data; encrypted bundle readable. Auth sign-in persistence/credential linking tests and Firestore Security Rules emulator checks have not been executed.

## Off-device copy and live UI follow-up — owner screenshots / CLI, 2026-11-04
- Owner opened the local Firestore Emulator UI at `127.0.0.1:14000`, where seven user UID paths are visible and missing parent documents are correctly represented. This is visual supporting evidence for the already-confirmed 26-document restore/readback; private UID values are not copied.
- Owner also showed current production Firebase Console usage dashboard and Vercel Reflect journaling UI in desktop/mobile viewport. The dashboard's read/write counters are insufficient to attribute writes to any particular operation. Vercel UI displayed no entries for the currently active anonymous profile, which is not evidence that the 26 exported documents are missing.
- A checksum command for presumed Drive-downloaded `reflect-private-retry1.tar.gpg` failed because there was **no file** at the guessed `$HOME/Загрузки/reflect-private-retry1.tar.gpg` path. This is **NOT a hash mismatch**, and no downloaded copy was compared.
- Read-only search of accessible connected Google Drive found neither exact `REFLECT_PRIVATE_BACKUPS` folder nor exact `reflect-private-retry1.tar.gpg` filename. This is a limited search result (may reflect another account or indexing lag), not proof of absence in every Drive account.
- Keep off-device backup marked **UNVERIFIED**. User must confirm file upload in private restricted folder, download to a known location, and validate SHA-256 against `27eec4e1c214d2feb1a78217c0f639c0b2b5bea9038a893edadf8c5cc8c1ccb4` before marking complete. Never upload plaintext, passphrase or secrets.

## Off-device SHA-256 VERIFIED / private Drive permissions — 2026-11-04
- Owner screenshot shows `reflect-private-retry1.tar.gpg` uploaded into Google Drive folder `REFLECT_PRIVATE_BACKUPS`, under `My Drive / Reflect idea`. Do NOT publish raw backup or decryption passphrase.
- Owner independently downloaded the encrypted file again to `~/Загрузки/reflect-private-retry1.tar.gpg`; terminal `sha256sum` printed `27eec4e1c214d2feb1a78217c0f639c0b2b5bea9038a893edadf8c5cc8c1ccb4`, EXACTLY matching local source encrypted archive hash.
- Connected Google Drive `get_file_metadata` on `REFLECT_PRIVATE_BACKUPS` (folder ID `10xuY5SSYEQqXi0jKgynNVJBPCicKMhU1`) returned `shared: false`, permissions with only one `user` role `owner`, `source_visibility_status: permission_metadata_available`, and the parent `Reflect idea` was previously observed as `shared:false`. Screenshot and hash verification supplement connector search, which did not enumerate the encrypted file itself.
- **Backup off-device recoverability gate PASS**, scoped to encrypted ciphertext transport integrity and earlier local passphrase decryption test; not a fresh full restore from downloaded ciphertext.
- No plaintext archive, Auth JSON, passphrase, UID, API token or user content was placed in GitHub, shared Drive, or the chat.
- Stage 00 remaining: current production Firestore Security Rules client-isolation tests, Auth persistence/upgrade QA, rollback plan. Do not claim old anonymous browser sign-in can be recovered via an Auth JSON export.
- P0 auth/profile fixes are being prepared in separate draft PR #3. They are NOT merged or deployed.

## Synthetic client Security Rules isolation tests + draft P0 auth PR — 2026-11-04
- Local emulator CI used the previously recorded snapshot of production Firestore Security Rules (`match /artifacts/{appId}/users/{userId}/{document=**}` with `request.auth.uid == userId`). No live rule changes or production Firestore writes were made.
- With `@firebase/rules-unit-testing@3.0.4` and Firebase SDK 10.12.2 against `demo-reflect-restore` on fixed loopback, **12 synthetic security assertions passed**: 4 owner-allowed and 8 cross-user/unauthenticated/out-of-scope denied.
- CI job passed BOTH synthetic Firestore restore/readback and synthetic owner-isolation checks: https://github.com/TheGor-365/reflect/actions/runs/41838230974. This tests the snapshot, **not independent fresh confirmation that live production Security Rules are unchanged**.
- Created DRAFT PR #3 `work/reflect-auth-stability-2026-11-04` based on unchanged GitHub `main`. It fixes repeated Auth subscription, redundant anonymous sign-ins, profile load error misclassified as onboarding, UID-scoped collection state, and missing save/read error visibility. Preserves existing fields via `setDoc({merge:true})`, without changing any Auth provider or persistence setting.
- The PR #3 mocked-unit workflow passed **11/11 tests (3 suites)** and `CI=true npm run build` with non-production demo Firebase config: https://github.com/TheGor-365/reflect/actions/runs/41837662756. No merge or deployment was performed by the assistant.
- Stage 00 status: exported private Firestore/Auth archives and owner-only encrypted Drive copy VERIFIED, local Firestore recovery VERIFIED, UID associations VERIFIED, **synthetic Security Rules isolation PASS**. Auth browser persistence across reload/origin, permanent provider account linking/upgrade design, real preview smoke and final rollback acceptance are still open; anonymous sessions cannot be restored from backup JSON alone. Advance with careful draft PRs, not uncontrolled production migrations.

## Auth QA Preview-environment safety — 2026-11-04
- Owner screenshot shows GitHub draft PR #3 with green checks and Vercel Preview deployment on branch `work/reflect-auth-stability-2026-11-04`; GitHub CI passed 11/11 mocked React/Auth/Firestore tests and `CI=true npm run build`.
- Read-only Vercel inspection for project `reflect` found `REACT_APP_FIREBASE_CONFIG`, `REACT_APP_APP_ID`, `REACT_APP_GEMINI_API_KEY` targeted to **production, preview, and development**. No variable values were decrypted or accessed. Vercel Preview is NOT an isolated Firebase environment and could contact live Auth/Firestore or AI. Do not create synthetic users or write notes on Preview.
- A new, independent LOCAL-only demo project `demo-reflect-auth-qa` is configured in draft PR #3 with Auth `127.0.0.1:9099`, Firestore `127.0.0.1:18081`, UI disabled; app browser `127.0.0.1:3100`. The separate Firestore port avoids the restored owner archive on local `18080`. The opt-in emulator code fails closed on wrong browser hostname or project ID.
- A Chromium E2E CI test now exercises synthetic profile+diary writes, same-origin anonymous UID persistence across reload, and second-browser identity/data isolation. Do not mark E2E passed until its GitHub workflow finishes successfully; first attempts failed due Ubuntu 26/Playwright incompatibility and then a blocked outside-demo browser request (network gate worked; exact origin under investigation). CI runner pinned Ubuntu 24.04; browser requests remain restricted to localhost demo ports.
- GitHub `main` and Vercel Production remain on original SHA `b3a72c240bd193e89346a0a5655861cc726f4d61` as previously verified. No merge/promotion/production data changes authorized.
- Later production release must remove client-side Gemini key exposure by moving AI access server-side and rotating the credential; no keys or tokens were disclosed.

## Local demo Auth/Firestore real-browser E2E — 2026-11-04
- Draft PR #3 current HEAD `40a3be70ca0583390ac47401369224f9754dc92c`, based on unchanged GitHub `main=b3a72c240bd193e89346a0a5655861cc726f4d61`. Unmerged, no production deployment or Firebase modification.
- `reflect-auth-ci.yml`: **11 unit tests across 3 suites** and `CI=true npm run build` PASS. Workflow: https://github.com/TheGor-365/reflect/actions/runs/41888572728.
- `reflect-auth-emulator-e2e.yml`: real headless Chromium + Firebase Auth Emulator `127.0.0.1:9099` + Firestore Emulator `127.0.0.1:18081` under a dedicated NO-CLOUD demo project `demo-reflect-auth-qa`. React app `127.0.0.1:3100` with explicit dummy config and strict guard. Workflow PASS: https://github.com/TheGor-365/reflect/actions/runs/41888572675 (identical checked HEAD, two successful job runs).
- Browser evidence (synthetic data only): (1) anonymous UID persisted after a full reload in the same browser origin/context; (2) profile and diary note persisted after reload; (3) independent browser context received a distinct UID and could not view first user's data; (4) all application/test network traffic allowed only to fixed localhost demo ports; pre-existing Google Fonts were blocked and fallback typography used.
- CI reliability corrections: pinned Ubuntu 24.04 for Playwright support, kept `tests/emulator/node_modules` entirely separate from CRA's pinned `npm ci` dependency tree. Earlier attempts failed before meaningful browser verification due runner version, external font request blocking, and webpack eslint overlay from mixing dependency trees; these were repaired and latest CI is green.
- This verifies the **patch in a synthetic demo browser**, not an existing real production anonymous user's UID retention after release. Never clear storage or log out of an existing anonymous account. Permanent account upgrades/linking, server-side AI key rotation, deployment preview isolation and rollback release remain open.
- Vercel Preview is still configured with Firebase and AI env variable keys targeted to Production+Preview; synthetic QA on that Preview is NOT safe. Build/deploy status alone is not an isolation proof.
- User action gate: review the current PR #3 Files changed and CI, then (if desired) run `tests/emulator/README.md` in a separate Linux checkout with synthetic data, or explicitly approve a reviewed production release after final security checks. Never merge automatically.

## Stage 01A Vite draft and manual Auth QA — 2026-11-04
- Owner manually opened the PR #3 app at `http://127.0.0.1:3100`, created a local QA profile and mood/diary entries in `demo-reflect-auth-qa`, and refreshed. Subsequent screenshot confirms profile still displayed, two entries still visible, original synthetic anonymous UID unchanged. **Manual local reload PASS**; no production write.
- New stacked DRAFT PR #4: https://github.com/TheGor-365/reflect/pull/4 , branch `work/reflect-vite-foundation-2026-11-04`, base PR #3 branch (not `main`). CRA bundler switched to Vite 7.3, React plugin, Vitest, root HTML entry and Tailwind/PostCSS; React 18, Firebase 10, Firestore schema and Auth provider remain unchanged. Strict localhost-only emulator guard retained.
- Built frontend no longer imports/reads `REACT_APP_GEMINI_API_KEY`. The client AI service was intentionally disabled with a visible error until a verified server-side API exists. **This is a functional limitation and must be resolved before a production merge.**
- PR #4 CI PASS on SHA `1cf62731b4918936b8f5d421f75f117f7c1be26c`: unit tests and Vite build https://github.com/TheGor-365/reflect/actions/runs/41904965221 ; real Chromium demo-Auth/Firestore reload + isolation https://github.com/TheGor-365/reflect/actions/runs/41904965224 . Tests use synthetic accounts and loopback-only endpoints.
- **Lockfile remains stale**: checked-in `package-lock.json` from CRA, initial PR #4 CI uses `npm install` and is NOT yet a reproducible `npm ci` result. Next action is regenerate lockfile with Node 22, commit it only to PR #4 branch, then switch CI back to `npm ci`.
- Vercel Preview is not isolated from production Firebase and must NOT be used to write synthetic data. No code merge, production deployment, auth-provider changes, Firestore writes or private backup uploads made for Vite migration.

## Stage 01A — locked Vite build & Vercel Preview correction — owner/CI evidence 2026-11-04
- Owner Linux Mint `~/reflect-vite-qa`: Node `22.23.4`, `npm install` migrated CRA lockfile, then `npm ci --no-audit --no-fund` PASS, Vitest **11/11**, Vite **7.3.7** build PASS (531.55 KB JS bundle; non-blocking chunk size warning).
- Owner committed only `package-lock.json` as `ffa1e17508da21d3bddd39e4c3cff39fb9646d12` to PR #4; local `.tool-versions` left untracked (not published).
- Vercel Preview for `ffa1e17` failed **after** a successful Vite build due to `[STATIC_BUILD_NO_OUT_DIR]`: Vercel still expected CRA `build/` while Vite generated `dist/`. Build log also warned `engines.node: >=22.12.0` selected Node 26 despite project Node 22 settings. This was a configuration mismatch, not a React test failure.
- PR #4 patch `19721ad4508b4147cccd8275e6251ce53bb8fb42`: branch-local `vercel.json` overrides framework to `vite`, output to `dist`, install to `npm ci`, build to `npm run build`; `engines.node` pinned to `22.x` in package.json and root lockfile metadata. Two workflow jobs restored strict `npm ci`, without editing Vercel project-wide settings or production configuration.
- On latest PR #4 HEAD, CI PASS: unit/build workflow https://github.com/TheGor-365/reflect/actions/runs/41907372315 and real Chromium demo Auth/Firestore E2E https://github.com/TheGor-365/reflect/actions/runs/41907372318 .
- Latest Preview deployment `dpl_PcPG2fdPVVKJgrCvsWp9raarmfDb` reached **READY**; build logs confirm `npm ci`, `vite build`, files under `dist/`, and deployment completed. Preview READY is NOT proof of Firebase runtime functionality.
- **Security warning remains:** legacy Vercel `REACT_APP_*` preview vars map to production Firebase, while Vite deliberately requires explicitly supplied `VITE_*` variables and has no unsafe fallback. Do NOT set any real production credentials on Preview. The Preview app may display a configuration error until isolated environment variables are designed.
- PR #4 remains DRAFT, stacked on PR #3; no merge, production deployment, Firebase production changes or Auth mutations. AI service currently intentionally unavailable in Vite candidate pending safe server-side implementation.
- Next operator check: pull PR #4 locally, stop only the previous CRA server at port 3100 while retaining demo Auth/Firestore emulators on 9099/18081, start Vite with explicit synthetic `VITE_*` config on localhost, compare desktop/mobile and UID/journal persistence. If emulator restarted, synthetic data may have reset; never infer a production logout.

## Local Vite desktop QA — owner screenshot, 2026-11-04
- Owner pulled PR #4 HEAD `19721ad4508b4147cccd8275e6251ce53bb8fb42` into the separate `~/reflect-vite-qa` checkout and ran `npm ci` successfully.
- Initially Vite `--strictPort` refused to start while previous CRA occupied `127.0.0.1:3100`. Owner then started Vite 7.3.7 on the same localhost address; terminal reported `ready in 179 ms`, local URL `http://127.0.0.1:3100/`.
- Owner screenshot of the Vite app at `127.0.0.1:3100` showed the existing synthetic QA profile and both existing test diary/mood entries intact, with the **same displayed UID** as on the earlier CRA screenshot. Desktop layout has no obvious visible regression. This is evidence for cross-bundler/origin state continuity, not yet for an additional post-Vite `Ctrl+R`.
- Previous synthetic Chromium E2E under Vite already passed full reload, persistence and cross-browser isolation in isolated demo Auth/Firestore Emulators. Current manual remaining gate: perform `Ctrl+R` on Vite and verify viewport ~390 px including mobile navigation. Do not change production Auth, Firestore, Vercel deployment or Firebase provider.
- PR #4 remains draft; no merge. The AI-session frontend is deliberately nonfunctional until protected backend exists; production release remains blocked.

## Vite visual QA — desktop and 430 px mobile, owner screenshots 2026-11-04
- After initial local Vite smoke, owner supplied new screenshots from `127.0.0.1:3100` (desktop and Chrome DevTools iPhone 14 Pro Max viewport 430x932).
- Profile `gor` and **both synthetic mood/diary cards** still visible on desktop and mobile after Vite app startup. The desktop UID matched earlier CRA QA screenshots. Owner had previously confirmed reload persistence in CRA; latest screenshot is not independent proof of another full reload on Vite unless user explicitly states so.
- At 430px, title, emoji row, form fields, Save action and grouped entries fit within the narrow column without visible horizontal page overflow. The second card is partly below viewport fold, as expected.
- Small localization debt observed: mobile header reads `Diary` while page heading reads `Дневник` (RU). This is UI phase 02 work, not evidence of a data migration bug.
- **Mobile hamburger open/close and touch navigation have not been evidenced by a screenshot**; leave that check open before full 01A UX acceptance.
- `main` and Vercel production remain untouched by QA; PR #4 is still draft and its AI path is intentionally disabled pending a protected backend.

## Stage 01B TypeScript groundwork — DRAFT PR #5, 2026-11-04
- Owner desktop and Chrome DevTools iPhone 14 Pro Max **430 px** screenshots of Vite app on `127.0.0.1:3100` show preserved synthetic profile and two entries, layout fits mobile width without visible horizontal scrolling. Mobile hamburger opening is NOT yet independently verified.
- Created stacked DRAFT PR #5 https://github.com/TheGor-365/reflect/pull/5, branch `work/reflect-typescript-foundation-2026-11-04`, based on PR #4 head `19721ad4508b4147cccd8275e6251ce53bb8fb42`. It does NOT change `main`, Firebase projects, real user data or Vercel production.
- Initial TypeScript foundation changes: strict `tsconfig.json` with JS allow/no global JS check, minimal legacy journal/mood read types, pure `formatDate.js` converted to `formatDate.ts` with identical `ru-RU` behavior and 3 new regression tests (total now 14).
- Explicit `npm run typecheck` script added. Interim CI uses an exact TypeScript 5.9.3 `npx --package` compiler, because `package.json` and `package-lock.json` do not yet include locked TypeScript dependency. Do NOT claim reproducible TS compiler install until owner pins it and commits both files together.
- Initial PR #5 head `af7ac99909b60f50c488d1ba9ababb100b6abdea`: GitHub unit/build and temporary strict typecheck PASS (GitHub Actions runs `41910804384`, `41910804562`). No E2E Chromium rerun for this TS helper yet; existing PR #4 Chromium E2E passed previously.
- Remaining gate: owner creates separate `~/reflect-ts-qa` checkout, installs exact `typescript@5.9.3` as devDependency, runs `npm run typecheck && npm test && npm run build`, commits `package.json` and `package-lock.json` only, pushes branch. Then switch CI from on-demand npx to locked `npm run typecheck` and rerun E2E. No release approval or production merge.

## Stage 01B local TS verification and mobile navigation — owner evidence 2026-11-05
- Owner opened the Vite app on `127.0.0.1:3100` in Chrome's iPhone 14 Pro Max 430px viewport. Screenshot shows hamburger-open mobile sidebar overlay, navigation links, close X, masked background and bottom profile section. **Opening the mobile menu PASS**; closing by X and navigating pages were not separately demonstrated.
- Owner cloned PR #5 branch `work/reflect-typescript-foundation-2026-11-04` to `~/reflect-ts-qa`, selected Node `22.23.4`, and locally ran `npm install --save-dev --save-exact typescript@5.9.3`.
- Local `npm run typecheck` (`tsc --noEmit --project tsconfig.json`) PASS; Vitest **14/14 PASS** across 4 files; `npm run build` Vite 7.3.7 PASS (JS 531.55 kB pre-gzip). Existing React act deprecation and mocked Firestore permission errors are test output, not test failures.
- `npm install` reported **23 dependency advisories: 11 moderate, 10 high, 2 critical**. The risk requires a scoped `npm audit --json` inspection later; do NOT auto-upgrade with `npm audit fix --force`, and do not infer that all 23 apply to shipped runtime code.
- Local `git status --short`: modified `package.json` and `package-lock.json`, plus untracked `.tool-versions`. **Neither modified dependency file has been pushed/committed yet**, so do not claim TypeScript compiler reproducibility from GitHub CI. Only these two files should be staged, committed and pushed by owner; keep `.tool-versions` local.
- PR #5 remains DRAFT, based on DRAFT PR #4; `main` unchanged and production not deployed. After push, switch temporary CI `npx --package typescript` to pinned `npm run typecheck`; repeat strict CI and emulator E2E.

## Stage 01B locked TypeScript and Chromium QA complete — owner and GitHub Actions evidence, 2026-11-05
- Owner commit `0e0762c67588914f2d3e0d19a449aba1a24600f8` updates ONLY `package.json` and `package-lock.json`; exact TypeScript 5.9.3 devDependency appears in both, and local `.tool-versions` remains intentionally untracked.
- Owner's `npm run typecheck` PASS, Vitest **14/14 PASS**, Vite 7.3.7 build PASS. Prior mobile 430px screenshot confirms hamburger/sidebar **opens** with visible close X and dimmed backdrop; actual closing and section navigation still unverified.
- PR #5 `work/reflect-typescript-foundation-2026-11-04` CI updated to use only pinned dependencies: `npm ci` → `npm run typecheck` → `npm test` → `npm run build`. Strict typecheck, tests and Vite build **PASS** at head `f272d80fbef42bf16899de5f0a454f0e9b68ef3d`: https://github.com/TheGor-365/reflect/actions/runs/41915455369 . Standard Vite CI also **PASS**: https://github.com/TheGor-365/reflect/actions/runs/41915455552 .
- E2E workflow now triggers for TypeScript branch and relevant source/dependency changes. Real Chromium **PASS** under isolated `demo-reflect-auth-qa` Auth `127.0.0.1:9099`, Firestore `127.0.0.1:18081` with only synthetic journal/profile data. UID persisted through reload, journal/profile persisted, second browser got separate UID and could not see first-user records; network restricted to localhost demo ports. https://github.com/TheGor-365/reflect/actions/runs/41915455549
- Additional documentation-only commit `4605d11b4b3b6465de9bddfae09c1d8c5326fc45` updates the Stage 01B runbook; code tested in the prior head was unchanged by docs. PR #5 remains **DRAFT**, stacked on DRAFT PR #4 on DRAFT PR #3; GitHub `main` and Vercel production not merged/deployed.
- Owner's npm install reported 23 advisories (11 moderate, 10 high, 2 critical), **not audited for package path or runtime reachability**. Separate security-triage gate required; do not apply `npm audit fix --force`.
- Existing release blockers: client Gemini AI intentionally disabled in Vite; implement server-side AI with secret management and rate limits before production. Vercel Preview Firebase config not isolated; do not create users/notes there. Anonymous auth is still origin/browser-bound without permanent provider linking.

## Stage 01C security trial — 2026-11-05
- Owner `npm audit --omit=dev` confirmed 14 runtime-tree advisories (2 critical, 2 high, 10 moderate) with full titles/ranges. Reported four transitive Firebase 10.14.1 packages: `protobufjs 7.5.3` (latest affected range through 7.6.4), `websocket-driver 0.7.4` (<0.7.5), `@grpc/grpc-js 1.9.15` (<1.13.6), `undici 6.19.7` (<6.29.1). Local `npm audit` also reported all four `fixAvailable: true`, but such status does not prove Firebase semver compatibility.
- Public documentation cross-checked: protobufjs 7.6.5 patched for one latest-known advisory and 7.6.6 exists; undici 6.29.1 includes 2026 fixes; gRPC 1.13.6/1.14.5 are patched. Firebase issue https://github.com/firebase/firebase-js-sdk/issues/10400 reports Firestore's persistent `~1.9.0` pin and possible nested vulnerable copies even with npm overrides. Browser-only Firestore may not import Node gRPC in shipped JS; not yet verified for this project.
- Created stacked **DRAFT PR #6** https://github.com/TheGor-365/reflect/pull/6 on branch `work/reflect-dependency-security-2026-11-05`, based on PR #5. Trial `package.json` overrides for `protobufjs 7.6.6`, `websocket-driver 0.7.5`, `undici 6.29.1`, `@grpc/grpc-js 1.14.5`, plus moving two test libraries to devDependencies. **No lockfile update, dependency install, or tests performed yet on PR #6.** Failures in CI due to stale package-lock expected until owner regenerates lockfile.
- Next operator action: in a separate new checkout of PR #6, run `npm install --package-lock-only --no-audit --ignore-scripts`, `npm ci`, inspect `npm ls @grpc/grpc-js protobufjs websocket-driver undici --all`, and repeat `npm audit --omit=dev`. If ANY vulnerable nested copy remains or npm install rejects an override, treat as blocker; do not `npm audit fix --force` or merge.
- Production, auth-provider settings, Firestore data, Vercel deployment and existing encrypted backups remain unchanged. PRs #3/#4/#5/#6 DRAFT and stacked.

## Stage 01C security graph at zero known npm advisories — owner and CI 2026-11-05
- Owner in `~/reflect-security-qa`: `npm audit fix --ignore-scripts --no-fund` reduced full audit to 3 moderate. An isolated `npm update sucrase --ignore-scripts --no-fund --no-audit` resolved `sucrase@3.35.1` without the vulnerable legacy `glob` and `minimatch` dependency chain. No `--force`; no Firebase SDK major upgrade.
- `npm audit` returned **0 vulnerabilities** across all dependencies and `npm audit --omit=dev` **0**; TypeScript `tsc --noEmit` PASS, Vitest **14/14**, Vite 7.3.7 build PASS. Full type/test/build verification occurred with exact locally regenerated dependency lockfile.
- Owner pushed only `package-lock.json` to draft PR #6 commit `3b065e13a037a06e4cd52b2b03e41a0c7c91466a`; `.tool-versions` is untracked local data and not committed. Lockfile checked on GitHub: includes `sucrase@3.35.1`, `postcss@8.5.32`, `@grpc/grpc-js@1.14.5`, `protobufjs@7.6.6`, `websocket-driver@0.7.5`, `undici@6.29.1` and updated dev dependencies.
- GitHub CI on that lockfile: TypeScript / 14 tests / build PASS https://github.com/TheGor-365/reflect/actions/runs/41933709451 ; separate Vite CI PASS https://github.com/TheGor-365/reflect/actions/runs/41933709430 .
- Audit workflow strengthened on PR #6 commit `ffda76694312f642bc4cb6999639c39379ae290a` from runtime-only to **full** `npm audit --audit-level=moderate`; full locked install + all-dependencies security audit PASS https://github.com/TheGor-365/reflect/actions/runs/41933817331 and https://github.com/TheGor-365/reflect/actions/runs/41933824292 .
- Chromium Auth/Firestore E2E for the new lockfile is still **in progress** at this checkpoint: https://github.com/TheGor-365/reflect/actions/runs/41933709386 ; parallel run for audit workflow change https://github.com/TheGor-365/reflect/actions/runs/41933824263 . Do not label E2E passed until confirmed.
- PR #6 remains DRAFT, stacked on #5, #4, #3. `main` unchanged at `b3a72c240bd193e89346a0a5655861cc726f4d61`; Vercel production and real Firebase data untouched. Known blockers: AI server key migration/rotation; isolated Preview Firebase; account linking/rollback; forced Node gRPC version outside declared Firestore ~1.9.x range (browser smoke does not prove complete Node gRPC API parity). Unknown future advisories may emerge.

## Stage 01C Chromium E2E final verdict — 2026-11-05
- Real Chromium + isolated demo Auth/Firestore E2E **PASS** on PR #6 `ffda76694312f642bc4cb6999639c39379ae290a`, which includes the zero-advisory lockfile change `3b065e1`: https://github.com/TheGor-365/reflect/actions/runs/41933824263
- CI log independently confirms anonymous UID persists across page reload, synthetic profile and journal survive reload, second browser sees independent UID without first user's records, and test browser network confined to localhost demo ports. No production Firebase changes.
- Full `npm audit --audit-level=moderate` **PASS** on same revision https://github.com/TheGor-365/reflect/actions/runs/41933824292 . Code/type/test/build checks passed at `3b065e1` and later audit-only edit didn't change application code or lockfile.
- PR #6 DRAFT, stacked on DRAFT #5, #4, #3; user data backup still preserved and production untouched. Despite zero known npm audit advisories, forced gRPC override compatibility outside Firestore semver and secure server AI, Preview Firebase isolation, permanent account linking/rollback remain release gates.

## Stage 02A Midnight Aurora draft — 2026-11-05
- User explicitly requested continued feature expansion and professional modern frontend, referring to previously approved 2026 Reflect 2.0 design and older 2025 feature vision. Recovered "Midnight Aurora" design direction: independent desktop/mobile IA, responsive navigation, dark/light, WCAG 2.2 AA as a **target**, and preserving journal/mood/goals/sessions with later search, autosave/drafts, secure AI, analytics, account linking/export.
- Older vision includes roles, Mindspace, BodyMap, voice, exercises, native/PWA etc; these are **not all verified current features**. Scope distinction captured in `docs/roadmap/STAGE_02_PRODUCT_UX_MASTER.md`.
- Created stacked **DRAFT PR #7** https://github.com/TheGor-365/reflect/pull/7 on `work/reflect-midnight-aurora-shell-2026-11-05`, based on DRAFT PR #6 (which depends on #5/#4/#3). App state/data code unchanged; App shell uses browser-local theme preference, localized header, responsive layout, desktop sidebar and accessible mobile bottom dock; design tokens and reduced motion focus treatment.
- Added 4 new React layout tests: **18/18 Vitest PASS**, strict TypeScript and Vite build PASS: https://github.com/TheGor-365/reflect/actions/runs/41936178831 and https://github.com/TheGor-365/reflect/actions/runs/41936179062 . No new npm deps, Firebase project configuration, Auth accounts, Firestore records or Gemini API secrets changed.
- Initial browser E2E failed because test expected always visible literal `ID:`, but new UI collapses UID in explicit account-details disclosure; test updated, then baseline synthetic Chromium E2E PASS at `2fb7121`: https://github.com/TheGor-365/reflect/actions/runs/41936178947 .
- Extended E2E added: 390px mobile dock Goals↔Diary, mobile drawer Escape, theme persistence over reload, horizontal page overflow; test's legacy sidebar UID checks restored to desktop width in commit `04f8814`. This **extended run was in progress when written**: https://github.com/TheGor-365/reflect/actions/runs/41936706469 . Do not claim extended QA PASS before confirmed.
- Still need real screenshots, visual contrasts and accessibility QA on desktop 1440/mobile 390+320, including forms and modals. This is an early design system/shell, **not a completed professional redesign**. Stage 02B diary/forms and Stage 02C goals/sessions follow.
- No merge of PR #3–7, no production deploy, no real data migration. Firebase demo-only browser tests; Preview still not isolated, AI server not built, UID account linking unresolved.

## Stage 02A additional responsive E2E PASS — 2026-11-05
- Current DRAFT PR #7 HEAD `08b55effcb87f6f5a50161bf5bee2dbd04c19af7` passes TypeScript strict `tsc --noEmit`, **18/18 Vitest (6 files)** and Vite build. Actions: https://github.com/TheGor-365/reflect/actions/runs/41937088640 and https://github.com/TheGor-365/reflect/actions/runs/41937088532 .
- Real Chromium isolated demo Firebase Auth/Firestore E2E **PASS**: https://github.com/TheGor-365/reflect/actions/runs/41937088435 . Test confirms anon UID and synthetic journal/profile persist over reload, isolated second browser cannot see first-user entries; at 390px mobile dock can switch Goals↔Diary, drawer closes via Escape, theme persists over reload, and no horizontal document overflow; all test browser network stays on permitted localhost demo ports.
- E2E helper was adapted to changed semantic UI: account UID now disclosed in explicit details rather than always visible in sidebar; mobile tests are placed AFTER baseline journal persistence to keep failures separately attributable. The previous two E2E attempts failed due stale test expectations/order; final run is green.
- **Next owner gate:** clone new separate `~/reflect-ux-qa` checkout on PR #7, launch on same `127.0.0.1:3100` browser origin while leaving existing demo emulators running (9099/18081), inspect full desktop 1440 and mobile 390/320 screenshots, light/dark forms, actual menu and modal. A frontend is not visually approved on CI alone.
- No merge to main, no production deploy or real Firestore/Auth mutation. No new live AI keys. Work then proceeds to Stage 02B diary/mood and reliable draft/save states.

## Stage 02B1/02B2 session composer and journal writes — 2026-11-05
- User's visual review approved Stage 02A shell direction but identified broken single-line session composer, mixed legacy forms, weak diary hierarchy, and need for professional icons/components and event ordering. Source audit identified `Diary.jsx` UTC day bucketing, session-linked goal misordering, appended notes hidden in older groups, missing failed Firestore write states and `Goals.jsx` nested mutation.
- **DRAFT PR #8**, https://github.com/TheGor-365/reflect/pull/8, on branch `work/reflect-session-composer-2026-11-05`: auto-growing multiline 112–280px session textarea, Enter newline/Ctrl+Enter send when AI available, clear disabled-AI status, preserve failed send text in React memory. Strict TypeScript, 22/22 tests, Vite build and synthetic Chromium Firebase Auth/Firestore E2E PASS: https://github.com/TheGor-365/reflect/actions/runs/41941511797 and https://github.com/TheGor-365/reflect/actions/runs/41941511740 .
- **DRAFT PR #9**, https://github.com/TheGor-365/reflect/pull/9, `work/reflect-diary-save-safety-2026-11-05` on PR #8: new diary/mood writes use a stable preallocated Firestore document ID, block in-flight duplicate submissions, keep text and mood/comment upon rejection, show idle/saving/saved/unconfirmed status. Do not copy private content into default note headings; date becomes default heading. Different anonymous UID remounts diary composing component.
- PR #9 HEAD `ff83e44eb572dd1f12687f6fba17046abe46be01`: strict TypeScript, **27/27 Vitest** (8 suites) and Vite build PASS https://github.com/TheGor-365/reflect/actions/runs/42024996527 . Chromium emulator synthetic UID/profile/journal persistence and second-user isolation PASS https://github.com/TheGor-365/reflect/actions/runs/42024996475 .
- Privacy boundary: **no durable autosave** implemented, drafts exist only in React state until confirmed server acknowledgement; closing/reloading early can still lose text. In ambiguous retry `setDoc` uses the same ID and may replace same logical document, timestamps may update, but it will not create a new ID for that attempt. Tests for ambiguous errors are mocked, NOT live network fault injection.
- Source-backed roadmap: `docs/audits/STAGE_02B_UX_LOGIC_AUDIT_2026-11-05.md` (PR #8), and `docs/roadmap/STAGE_02B2_DIARY_SAVE_SAFETY.md` (PR #9). Next Stage 02B3 is pure local calendar event-stream sorting and filters/search without Firestore schema migration, then goals/tasks UI+immutable updates.
- Production **UNCHANGED**, `main` remains `b3a72c240bd193e89346a0a5655861cc726f4d61`; PR #3–9 all DRAFT and stacked. AI backend, Firebase Preview isolation, anonymous account linking and private data recovery remain release gates. Owner still needs local UI screenshots and acceptance of PR #8–9 before any merge/release.
