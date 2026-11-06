# Reflect 2.0 — Stage 03H: staging-only field Rules candidate

Date: 2026-11-07. Status: stacked Draft on PR #26. No main merge, no production deployment, no change to normal Test emulators.

## Owner evidence and dependencies

After verified Auth+Firestore snapshot export, preflight and emulator import, the owner's screenshot shows the Test profile and both synthetic diary notes. The edited note exposes version 1 and version 2 in its history. The pre- and post-import UID have not been compared explicitly, so do not claim UID equality. Stage03G read-only schema-audit code has CI 3/3 success, but aggregate counts for the owner's own archive have not yet been provided. **Never activate strict field Rules on the existing user data until legacy compatibility is established.**

## Work implemented

- Candidate Rules: tests/staging/firestore.candidate.rules. Restricts fixed namespace and UID; new diary notes and profiles require permitted top-level fields and basic types; updates validate only changed keys, keeping untouched legacy metadata. Older note title updates preserve extra fields. createdAt is immutable on update. Other collections (goals/moods/sessions) stay UID-only pending evidence.
- Disposable configuration: tests/staging/firebase.json; project demo-reflect-stage03h-rules, Auth 19099, Firestore 19081; no import/export, no connection to Test 9099/18081 or backup 18080.
- Synthetic REST matrix: tests/staging/rules-smoke.cjs. Valid and invalid note writes, retained original revision, legacy update, profile validation, cross-UID and unknown-path denials. A demo-only privileged seed creates an old-shape fixture strictly within the disposable staging emulator.
- Dedicated Actions: .github/workflows/reflect-staging-rules-candidate.yml, pinned Firebase CLI. Isolated compile-and-test gate, independent of owner machine.

## Limitations

The candidate enforces only top-level note/profile structures and does not validate all nested entry fields or preserve a tamper-evident server-side version history. Other collections remain deliberately flexible. Passing staging tests is not a production safety claim. No Firebase Rules or app configuration used by the owner have been modified.

## Next gates

1. Check exact-head staging CI and existing app CI. If failures occur, repair in Draft before owner QA.
2. In an optional separate Stage03G worktree, inspect only an existing local owner-export JSON and share aggregate counts, never private raw data.
3. Review actual legacy shapes and extend candidate with new synthetic test cases, then seek explicit approval before any deployment.

Firebase field rules reference: https://firebase.google.com/docs/firestore/security/rules-fields
