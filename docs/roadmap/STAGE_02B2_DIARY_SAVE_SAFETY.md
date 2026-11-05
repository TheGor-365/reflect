# Reflect 2.0 — Stage 02B2: safe Firestore writes for new journal entries

**Checkpoint 2026-11-05 — Draft PR #9**, stacked on Draft PR #8 → #7 → #6 → #5 → #4 → #3. No merge or production deploy.

## Confirmed former defects
`src/features/Diary/Diary.jsx` used `addDoc` for both new notes and moods with no saving state, disable/locking, error handling or user-visible confirmation. A rejected write left an unhandled promise and might encourage a second `addDoc`, producing a duplicate after an ambiguous network acknowledgement.

## Implementation in this PR
- `useEntrySave` allocates one new Firestore `doc(collection)` reference for an attempted save and retains the same ref if `setDoc` rejects; retry with the same ref avoids creating a *second document ID* for the same logical attempt.
- Separate write states for new notes and moods: idle / saving / saved / error. Accessible progress, server acknowledgement, uncertain status; disable form controls during pending write; preserve all user input on failure.
- A **confirmed** successful save clears the form; the next new note allocates another ID. Mood selection and comment likewise preserved on failure. No change to historical Firestore document IDs or collection paths.
- Default note title is the local calendar date displayed in the form, not an automatic excerpt of private note text.
- Diary is keyed by Firebase Auth UID to avoid UI draft bleed when the anonymous identity changes.
- Explicit privacy notice: in-memory forms are **not durable across reload/crash**. No localStorage/IndexedDB/remote draft autosave is silently introduced; a separate privacy-approved architecture is required.
- Additional mocked component tests: note success, ambiguous network error/retry with stable ID, double-submit lock, mood error/retry, next confirmed note gets a new ID. The baseline PR #8 has 22 tests; target is **27 tests**.

## Semantic limitations
- Repeating `setDoc` with the same ID after an *ambiguous* failure prevents duplicate IDs but may overwrite the document previously accepted by Firestore, using currently visible form content. UI does not claim a false exactly-once transaction guarantee.
- Retrying `serverTimestamp()` updates `createdAt` if the initial write reached Firestore. Fixing immutable server event timestamps would require a carefully defined schema/transaction design, not a silent migration.
- A page close before Firestore confirms the write may lose the unsaved in-memory text. Browser-local sensitive drafts require owner consent and encryption/expiry decisions.
- Status `saved` means Firestore `setDoc` promise resolved, not external backups or cross-device account recovery. Anonymous account persistence remains browser/origin-bound.
- Existing goals, sessions, historical diary `entries`, schema and old records remain untouched.

## Release/QA gates
- Local `npm ci` using existing locked npm graph; full npm audit (previous Stage 01C was 0 known findings).
- Strict TypeScript, Vitest, Vite build, isolated demo Chromium Auth/Firestore E2E (no live Firebase writes).
- Owner visual QA of status messages, failed/pending states and light/dark/mobile. Mock tests do not substitute for real offline/reconnect integration tests.
- Next Stage 02B3: rearchitect diary timeline as a pure, user-timezone-aware event view-model, filters/search and independent goal/session links; do NOT migrate Firestore documents without separate review.
- Stage 02C: goals immutable subtask updates, error feedback, tasks visualization and session layout.

**Data safety:** keep `main`, real Firestore, Auth and Vercel production unchanged. Do not expose Firebase config/private journals in PR logs, screenshots or GitHub.
