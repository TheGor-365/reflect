# Reflect 2.0 — Stage 02F: content-first Goals and bottom-anchored Sessions (2026-11-06)

**Status:** implementation branch, Draft PR pending full exact-head CI and owner visual acceptance. This branch is stacked on Stage 02E (Draft PR #22), not main. No production/Firebase deployment.

## Scope

- Goals: retain Firestore transactions, stable IDs, no-deadline goals, checklist/reflection, subtask editing/progress and status actions. Use an initially one-field 44px composer; optional type, purpose, deadline and draft steps remain accessible under an icon disclosure, without clearing typed drafts when collapsed.
- Show active goals in a narrow content column by default. Paused/completed goals use accessible status tabs instead of three mostly empty columns. Source remains the UID-owned onSnapshot; an awaited transaction-confirmed new goal can briefly render by stable document ID before the authoritative snapshot catches up, without duplicates or cross-UID echoes.
- Sessions: the message input and its controls are the last fixed element in the compose dock. AES-GCM opt-in draft controls remain mounted inside a collapsed settings disclosure/popover **inside** the composer; no separate full-width card beneath. Textarea starts at 44px, grows to 248px and scrolls internally; field remains in the bottom dock.
- Empty session state uses one quiet sentence. Save to Diary remains an explicit Firestore action; disabled AI send does not create a fake dialogue. Optional speech-input control appears only when recognition is supported. Save errors and status appear above the form.
- Midnight Aurora tokens and mobile bottom navigation remain intact; no schema change or new Firebase database.

## Test and acceptance gates

Existing Goals/SessionComposer/Sessions Vitest tests updated. New cases: initial closed goal fields; preserving purpose/step text through toggle; ID-based post-transaction echo and snapshot reconciliation; paused/completed tab views; encrypted draft settings contained inside composer. Isolated emulator Playwright script adapted for compact goals, paused-state navigation after reload and session dock geometry.

**CI must prove on the final PR head:** npm typecheck, npm test, npm build, locked Vite audit and Auth/Firestore/Chromium E2E with private synthetic accounts, owner-only Rules and archive recovery. This document is not evidence of a passing run.

**Owner QA still required:** 320/360/390/430 and desktop 1280/1440; light/dark, 0/1/20 goals, keyboard-only, creation with optional date/steps, 1-to-many-line editor, save-to-diary persistence, reopening protected draft, no mobile dock overlap. Preserve the existing Test login and Firebase emulator state.

## Privacy and release constraints

No AI key in browser, no real secrets, no local Test password, no production deploy, no merge to main, no emulator reset or clearing worktrees. Existing owner-local Auth+Firestore full restore and Stage 03F scoped rules release gate remain unverified. No visual approval inferred from CI.

## Next owner actions after exact-head CI green

1. Stop **only** the old Vite server on 3100 using Ctrl+C in the correct terminal; keep Auth emulator 9099 and Firestore 18081.
2. Fetch the new branch into a separate detached `~/reflect-stage23-qa` worktree (do not touch `~/reflect-stage22-qa`); use installed Node 22, `npm ci`, and existing demo-only Firebase Vite config.
3. Show Goals and New Session at 390px and desktop; accept or report discrepancies by screenshot.

## Stage 02F owner feedback refinement — local QA (2026-11-06)

Owner screenshots and local shell output showed **Stage 02E** `0933ff5` still running, not this PR: `git fetch origin` did not install the nonstandard branch refspec, so `git worktree add` failed. The previous Vite server remained on port 3100; no emulator or user records need modification.

This follow-up reduces **session-only** encrypted draft copy to an unobtrusive icon-opened compact panel (with explicit passphrase opt-in and original AES-GCM behavior unchanged), anchors the popover to the composer so it stays in the 390px viewport, and adds unit + emulator Chromium geometry coverage. The journal's existing protected draft UI is unchanged.

Safe local checkout from `~/reflect-stage22-qa`:

```bash
git fetch origin refs/heads/work/reflect-goals-session-focus-2026-11-06:refs/remotes/origin/work/reflect-goals-session-focus-2026-11-06
git worktree add --detach ~/reflect-stage23-qa refs/remotes/origin/work/reflect-goals-session-focus-2026-11-06
cd ~/reflect-stage23-qa
export ASDF_NODEJS_VERSION=22.23.4
node -v
npm ci
```

Stop only prior Vite on 3100 (Ctrl+C in the Vite terminal) before starting the new Vite with existing demo-only env; keep local Auth 9099 and Firestore 18081. Confirm `git rev-parse --short HEAD` matches the latest PR #23 head, not the old `0933ff5`. Await exact-head CI and owner mobile/desktop approval; no merge or production deployment.
