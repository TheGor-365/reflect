# Reflect 2.0 — Stage 03I: synthetic mood, goal, session Rules matrix

Date: 2026-11-07. Status: Draft stacked on Stage 03H PR #27. **No production change, no normal QA Firebase change, no import of user data.**

## Owner evidence and risk boundary

The user's local Stage03G aggregate-only schema review showed 3 records across profile and diaryNotes: zero unexpected fields or structural warnings, one legacy note entry without a version counter, one saved prior version and zero large documents. The collections goals, moods and sessions were **empty**, so no real-data compatibility evidence exists for those kinds.

Stage03H currently enforces field constraints for *new* profile/diary documents and preserves legacy unknown fields on updates. For goals, moods and sessions it deliberately enforces **UID ownership only**; a passing test must not be presented as schema validation or abuse-resistant validation of those three collections.

## Added engineering checks

The isolated staging-only matrix `tests/staging/rules-smoke.cjs` now creates synthetic records using current React/Firestore write shapes:

- Mood: mood kind, 1–5 intensity, comment, timestamp; owner create/read/update/delete, stranger read/update/delete and anonymous read denied, record absent after delete.
- Goal: checklist with text/purpose, status, completed state, subItems, reflections and createdAt; owner creates/pauses/changes subtask and deletes, stranger read/edit/delete denied.
- Session: title, chatHistory user/assistant entries, recommendations/exercises and createdAt; owner creates/reads/appends/deletes, stranger and anonymous access denied.
- For each collection, a deliberately unrecognized legacy field remains accepted **only for its authenticated owner** as evidence that no strict field validation is being applied blindly. Cross-UID and foreign namespace/nested path remain forbidden.
- Existing diary v1→v2 original version retention, profile validation and UID tests remain unchanged.

The suite uses **only** disposable `demo-reflect-stage03h-rules` Auth 19099 and Firestore 19081 in GitHub Actions. This stage does not add or change app-side schemas, active Firestore Rules, cloud deployments, keys, personal JSON imports or Firebase snapshots.

## Acceptance / remaining work

- Require exact-head staging CI green. Document the actual assertion count from the job log, not an estimate.
- Expand shape checks for goals/moods/sessions **only after** representative samples or documented domain contracts are reviewed; do not infer real users' field layouts from an empty export.
- For Stage04, build a **separate** opt-in, server-authenticated AI design and testable request policy. Browser direct model calls remain disabled by default and are not a valid interim implementation.
- Stage05 mobile/accessibility and reversible release remain future work. No merging stacked PRs to main without explicit approval.

Independent copy of the testing policy: never log auth tokens, full Firebase export JSON, chat transcripts, personal data, production secrets or UID values.
