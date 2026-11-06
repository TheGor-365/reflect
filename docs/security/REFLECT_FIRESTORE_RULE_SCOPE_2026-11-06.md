# Reflect 2.0 — Firestore Security Rules hardening: QA candidate (2026-11-06)

Draft PR #20, stacked on the UI scrollbar fix PR #19 and the owner JSON export PR #18.

## Threat model and scope

The prior **demo-only** emulator rules contained a recursive authenticated owner wildcard, permitting every nested document under `artifacts/{appId}/users/{uid}/**`. Although it prevented cross-UID access, it allowed arbitrary unreviewed collections, nested paths, and application namespaces.

The new rule candidate in `tests/emulator/firestore.rules` is **explicit and fail-closed**:
- Fixed app namespace: `artifacts/reflect-8fdc8/users/{userId}`.
- Single profile document: `profiles/userProfile`, with only get/create/update permitted.
- UID-owned `diaryNotes/{id}`, `moods/{id}`, `goals/{id}`, `sessions/{id}` with get/list/create/update/delete, preserving existing UI operations.
- Any other path, nested collection, arbitrary profile, other app ID, user root, or unauthenticated request is denied by default.
- `request.auth.uid == userId` is enforced **on the server**, not from an untrusted client-provided user ID.

## Verified tests

The isolated Firebase Auth/Firestore Emulator E2E runs `tests/emulator/rules-smoke.cjs` against the actual Firebase REST gateway using two brand-new synthetic anonymous identities. It asserts success only for authorized owner operations and 403 rejection for cross-user, unauthenticated, unknown, nested and other-app paths. The existing browser QA additionally exercises owner-only diary, moods, goals, session-to-diary save, JSON owner export, and Auth+Firestore snapshot recovery.

Functional CI: https://github.com/TheGor-365/reflect/actions/runs/42252987164 — SUCCESS, all direct rule assertions PASS. No real account or production system accessed.

## Deliberate limitations

These are **emulator-only candidate rules**. They are **not deployed** to Firebase production or to a staging service. Existing browser-side data shapes are not narrowed here, to avoid accidentally locking out previously stored legacy goals, chat histories, or journal entries. Field-level validation, document limits, production-equivalent staging, indexes, account deletion, audit logs, backup restore and real email confirmation remain separate release gates.

Changing source files does **not** reconfigure a Firestore Emulator that was started earlier from another checkout. Before locally activating new rules:
1. From an additional terminal in the existing checkout, run `npm run qa:state -- save` and `npm run qa:state -- status` while emulators remain live.
2. After both succeed, stop the running QA emulator via a clean Ctrl+C. This preserves old state and invokes export-on-exit.
3. Start `npm run qa:state -- start` from the new PR #20 worktree. It imports the latest private Auth+Firestore snapshot while loading this checkout's new rules. Then verify the **same UID**, profile, and diary entries; never recreate the user simply because rules changed.

The separate production backup and local Stage-00 private restore emulator on port 18080 are unrelated and must not be touched.

## User-specific QA checkpoint

The owner confirmed a local synthetic account with display name **Test**, email **test@example.com**, visible as connected in the UI. No password, auth code or token is recorded here. Earlier private QA snapshot success does not establish whether this newly observed account was already included; the owner must explicitly save a new versioned QA snapshot before restarting any emulator.
