# Reflect — Firebase / Vercel evidence update (2026-11-04)

Purpose: stage-00 read-only verification, with owner screenshots and authenticated Vercel metadata. **No changes to live Firebase / Vercel / data / secrets.**

## Firebase / Firestore observations
Source: owner console screenshots, 2026-11-04.
- Firebase project display name: `reflect`; project ID `reflect-8fdc8`. Billing plan: Spark (no-cost).
- Firestore database: `(default)`.
- In Firestore Data, `artifacts` collection has a document identified as `reflect-8fdc8` with `users` subcollection shown. The intermediate document is reported as nonexistent in console. This is valid for an ancestor with nested subcollections and **does not prove user data is absent**. Content, collection totals and individual accounts are unverified.
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
[ ] Inspect user collection names and record counts without disclosing UIDs, emails or journal text.
[ ] Inspect Firebase Auth providers/user count and Firebase Hosting site, read-only.
[ ] Define and execute a secure private backup including nested Firestore collections.
[ ] Verify isolated restore/readback and user identity mapping.
[ ] Evaluate rules via emulator (owner and non-owner access paths).
[ ] Verify release/rollback for each active hosting target.

Evidence quality: screenshots + connector metadata; tests/backup are pending. No security penetration test claimed.
