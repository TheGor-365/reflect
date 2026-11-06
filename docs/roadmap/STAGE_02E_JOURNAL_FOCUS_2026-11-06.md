# Reflect 2.0 — Stage 02E: Notebook-first journal (2026-11-06)

**Status:** Draft PR #22, stacked on PR #21. No production, staging/rules deployment or main merge.

## Owner-reported problem

The diary is the core of Reflect, yet the first viewport was consumed by five oversized mood emoji, a full-size form and an always-open category/date/search panel plus weekly mood analysis. Actual chronological entries were below the fold. A new note seemed to require reloading before appearing, which conflicts with a fluid journal experience. The screenshots and UX description were provided on November 6 in CAREER. No private text, credentials or exported JSON are stored in this document.

## Information architecture

- Narrow readable timeline column (maximum 900px), small heading and compact actions.
- One continuous textarea starts at about 44px, automatically expands with text to 232px then scrolls internally. An optional title is behind an icon, not permanently visible.
- Mood opens as a small inline chooser: five compact icons, numeric 1–5 intensity and optional comment. Seven-day mood analytics is hidden by default.
- Search, type chips and date-range filters are collapsed by default, revealed via one icon and reset without server calls.
- Protected local draft controls stay opt-in and are accessible inside a collapsed privacy disclosure.
- Default aggregation is now labeled **Лента** rather than **Все**. Plain journal content displays as **Запись**; actual typed source collections display **Настроение**, **Цель**, and **Сеанс** on each entry card. This does not invent Firestore fields or an AI category: an actual custom taxonomy is outside this incremental UI-only stage.

## Save semantics and safety

After a successful awaited Firestore setDoc, useEntrySave invokes a UI callback carrying the SAME stable document ID. The diary displays a short-lived confirmed local representation without waiting for onSnapshot and scrolls that entry into view. When the owner-scoped Firestore subscription includes that ID, the authoritative record replaces the echo without duplicates. The echo is retired once seen by the subscription so subsequent deletion cannot resurrect it. Failed writes keep original text and original retry ID. No optimistic false success, no UID mixing, no unencrypted client draft storage or AI calls.

## Acceptance tests

Vitest checks the default collapsed layout, title and mood controls, live confirmed note/mood cards before parent props change, snapshot reconciliation, failed-write retry and no duplicates. Emulator Chromium checks original encrypted draft recovery and owner data export, account UID, cross-user rules, mobile navigation, live typed journal and compact one-line-to-multiline input geometry.

Manual owner QA still needed at 320/360/390/430/1280/1440px, dark and light modes, keyboard-only, long text and scroll after save. No guarantee of perfect WCAG compliance merely from CI. Existing imported Firebase rules remain unchanged until a controlled emulator restart. The earlier failed attempt to run another emulator on occupied 9099/18081 was a port conflict, not proof of data deletion. The original Test UID is not yet verified after an intentional clean local snapshot reimport.

## Local continuation after PR #22 CI

Keep existing Auth 9099 and Firestore 18081 untouched; fetch the new branch into a separate detached worktree named ~/reflect-stage22-qa (preserve stage21 and older worktrees), npm ci, stop ONLY Vite 3100, and launch stage22 Vite with demo-only config. Compare the new entry composer and journal feed in the same synthetic Test account; do not re-register or upload private JSON.

Remaining: finish Stage 03F verified Auth+Firestore reimport with new scoped rules, staging security/field validation, then opt-in server AI, final UX/accessibility, rollback and explicit production approval.
