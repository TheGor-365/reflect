# Reflect 2.0 — Stage 03G: privacy-safe legacy schema inventory (2026-11-07)

**Status:** development Draft, stacked on Stage 02G PR #25 and preceding Stage 03F PR #24. No main merge, Firebase Rules deployment, staging migration, private archive upload, Test account reset, or external AI call.

## Why this stage is next

- Stage 02G desktop screenshots show content-first note cards and a manually edited synthetic title. Isolated CI confirmed previous/current versions persisted in demo Firestore across reload with the original authenticated synthetic UID.
- Existing locally tested Firestore Rules allow only the four known UID-scoped data collections and one profile, but do not validate their fields or shapes. A sudden strict rule change could block valid legacy notes, goal task objects, session history, or the new per-entry revision records.
- Stage 03F is still awaiting the **real owner's machine** QA save and preflight output, followed by separately approved same-UID Auth+Firestore restore. A CI demo export/import cannot replace that proof. Do not stop or duplicate Auth 9099/Firestore 18081, touch backup emulator 18080, delete the Test user, or change the current deploy.

## What was implemented

A pure JS auditor at src/security/schemaAudit.js accepts only the already validated, in-memory output from inspectOwnerArchive. It checks top-level schema expectations for profile, diaryNotes, moods, goals, sessions, and basic nested diary entry/version shapes. It counts:

- number of inspected documents and nonempty collections;
- top-level unfamiliar field occurrences, but **never field names**;
- shape warnings, legacy entries without an explicit revision counter, and the number of existing historic versions;
- encoded record sizes approaching a conservative Firestore document budget.

The result is numeric buckets and booleans only. It contains **no** user UID, document IDs, paths, field names from the archive, note contents, profile identity, dates, secret values, raw metadata or entire records. No network calls, Firestore SDK writes, localStorage writes, or upload of selected files are added.

OwnerDataRecovery.jsx displays this information behind a nested, collapsed-by-default disclosure labelled "Совместимость данных со staging", inside the **existing** optional archive inspector. It does not enlarge the journal feed or trigger any other action. The previously validated recovery input remains unmodified, with its existing explicit checkbox/typed confirmation and demo-only write gate. The user may inspect an existing local JSON owner export without uploading it to ChatGPT, GitHub, or Google Drive.

## Limits and strict-rule decision

- This is **advisory**. Unknown fields, old date-based note titles, missing legacy version counters and optional extra metadata are not assumed corrupt and are not dropped. A clean result does not prove production readiness, especially if some collections are empty.
- The auditor checks some field types and encoded JSON sizes but does **not** certify all nested Firestore types, Auth recovery, semantic consistency, Rules authorization, absence of secrets, or staging isolation.
- The current tests/emulator/firestore.rules and emulator ports are **unchanged**. No strict candidate Rules are deployed until actual legacy compatibility has been reviewed using only safe aggregate counts and an isolated staging project.
- The next engineering step after owner-side Stage03F restore and schema counts is a separately tested staging-only Rules candidate with create/update/delete plus old-record transition tests. Later Stage04 is opt-in, server-authenticated AI with user consent, minimized payloads, rate/cost caps and verified billing; Stage05 is accessible/rollback-safe release. AI remains disabled in the browser.

## Verification

- schemaAudit.test.js: records and versions, legacy signals, unexpected field counts with zero raw disclosure, corrupted shapes, empty archive coverage, size limits, cross-namespace/path rejection, read-only input.
- OwnerDataRecovery.test.jsx: collapsed disclosure with only aggregate counts; verified archive passed unchanged into restore.
- Isolated Chromium synthetic Auth+Firestore browser QA checks the disclosure inside the existing owner archive inspector.
- Exact final PR head and CI must be checked; user visual acceptance is not inferred from CI.
- User-side QA save+preflight, same-UID restore, 390px mobile QA, and staging Rules compatibility remain **unverified**.

**Owner 1–3 next steps when approved:** Keep Auth/Firestore running, run existing Stage24 QA save and preflight; only when successful, preview Stage03G through a separate worktree/new Vite (not a second Firebase); open an existing local owner JSON export in the optional archive inspector, expand the schema disclosure, report only numeric results—not the private JSON.
