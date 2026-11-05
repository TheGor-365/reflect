# Reflect 2.0 — UX and business-logic audit, Stage 02B, 2026-11-05

**Source of truth**: owner screenshots of desktop/mobile dark/light 2026-11-05 and source code in preceding Draft PR #7. Screenshots contain user-specific display content; **do not copy them into public GitHub**. This document describes confirmed issues and proposals without client data.

## Verdict

The shell, theme switch, navigation and mobile dock established a credible visual baseline. The diary, sessions and goals still have independent styles and early-prototype workflows; UI-only restyling would conceal actual data-safety and ordering issues.

## P0 — reliability and trust before decoration

### 1. Session composer
Confirmed code `src/features/Sessions/Sessions.jsx`: fixed single-line `<input type="text">`, `bg-stone-100/80` strip that appears gray even in dark theme, and `setUserInput('')` executed **before** AI and Firestore success. AI provider intentionally returns error until secure server available.
- Stage 02B1 Draft PR: dedicated auto-growing `<textarea>` minimum 112px, cap 280px and internal scroll, Enter newline, Ctrl/Cmd+Enter submit if enabled, proper accessible label, polished light/dark panel, visible AI unavailable status and disabled send.
- Preserve text on error, remove any optimistic failed user message, show error without forging assistant response.
- No automatic local persistence in this PR: personal reflections are sensitive; unencrypted localStorage autosave without an explicit privacy decision is unsafe. **UI explicitly states draft is not automatically stored**. Stage 02B2 must design user-scoped encrypted/offline/local vs Firestore draft semantics with expiry, export and consent.
- The current AI service is fail-closed and this PR does not enable network AI or alter existing Firebase data.

### 2. Journal save status and duplicate write safety
`Diary.jsx` immediately uses `addDoc` for mood and note, with no saving state, no feedback, no user-facing catch and no disabled duplicate-send. Failures can result in unhandled rejected promises. For notes, the title fallback `first three words + '...'` is arbitrary and can leak sensitive content into headings.
- UI states: composing → saving → saved (confirmed Firestore id) / failed (edit preserved; retry). Disable duplicate submit pending promise, avoid retry creating duplicate IDs: preallocate `doc()` IDs and upsert with deliberate idempotency when safe; never change historical IDs in bulk.
- Use explicit display title or first-line excerpt only with user control. Draft privacy decision required before persisting to browser storage.

## P1 — chronological integrity

### Current source behavior
`Diary.jsx` groups *session entries* and attached goals by `sessionId`, then groups moods, notes and unassigned goals by UTC date (`toISOString().split('T')[0]`). It sorts **groups** by session's original `createdAt`, not latest linked goal or message. Each session's attached goals appear inside that older group even if added much later. Appended note content in `entries` is rendered inside the original note card instead of appearing near its own timestamp. An entry missing `createdAt` is silently omitted from daily groups; time-of-day ties use only timestamp sort (no deterministic id fallback).
- UTC boundary can misgroup evening/morning entries for Armenian local time. A note posted at 01:00 local may appear under previous UTC date.
- Proposed pure *view-model* event stream (no Firestore migration):
  `{eventKey, sourceKind, sourceId, displayAt, parentSessionId, payload, isPending}`
  for sessions, session actions, moods, notes/append entries and goals/reflections as product policy permits. Aggregate from existing documents without writing back; dates use user-selected timezone or local calendar components. Group by **local calendar day**, sort descending by event timestamp then stable `eventKey`. Show pending timestamp entries in a clear pending group rather than silently dropping them.
- Session details may be collapsed beneath a dated event with link to full session; do not dump entire chat into the diary timeline.
- Filters `Все · Заметки · Настроение · Цели · Сеансы`, search across authorized data, optional pagination, dedicated event cards with source icon and readable summary.

## P1 — diary information hierarchy
Current "Быстрая запись" panel combines mood picker and free-text journal, making the journaling affordance secondary. After selecting mood it shows up to 5 repeated identical emoji for intensity; card display repeats emoji `intensity` times, conflating intensity with repeated emotions.
- New title: "Сегодня"; one prominent expand-on-focus text field for "Записать мысль", large save-state button. Mood as an **optional compact chip** plus separate 1–5 intensity scale with textual endpoints ("Слабо" → "Сильно"), no repeated emoji. Common save lifecycle optional joint transaction only once product semantics are defined; do not accidentally convert two independent Firestore collections to one doc.
- Mood cards: one icon, name, subtle color band, intensity label, timestamp and optional comment; not five repeated faces.
- Replace generic repeated white rounded cards with 3 card templates: Note, Mood, Session/Goal, each with semantic color + icon + concise data, contextual action menu. Gradient icon treatments must not replace labels or accessible names.

## P1 — goals and tasks
`Goals.jsx` uses one long flat form with two buttons, a text field for "Зачем?", a subtask list without edit/remove during creation, required date without clearly explaining why, and ungrouped status. `handleToggleSubItem` shallow-copies the array but mutates `newSubItems[index].completed` (object is shared with current snapshot); no mutation failure UI. `groupedGoals` groups by `sessionTitle` string (not stable ID), and does not explicitly sort. `new Date(newGoal.date)` interprets date-only input as UTC rather than desired local calendar date.
- Board or grouped list: `Активные · На паузе · Завершённые`, progress `x/y`, due date/overdue. Creation via staged form: Title + type; optional purpose and optional due date; inline subtask add/remove/edit; category/priority only if product research warrants.
- Checklist should have legible checkbox and label (not icon-only) and success/error status. Immutable nested updates, safe concurrent writes, server confirmation, no automatic disabling of tasks after all completed without explicit review.
- Visual identity: colored duotone icons per semantic type (journal, mood, goal, session, reflection); clear accessible labels; avoid arbitrary bright button palette.

## P1 — sessions layout and AI integrity
Existing 50/50 session grid wastes a large empty left panel, chat composer appears detached, recommendations shown on blank initial session without actual data. Existing AI response scores fall back to `50` on invalid input; that is a pseudo-quantitative metric and should not be treated as clinically valid.
- Desktop `minmax(0,1.6fr) minmax(300px,1fr)`, persistent composer in chat column, right-context panel only when there are real results. Mobile single-column message workspace with safe-area dock offset, optional expandable context sheet.
- Initial state: "Сеанс" intro, clear disabled-AI message, freeform user input without accidental send; no pretend interactive AI. When backend enabled, use authenticated server endpoint, rate limits, idempotency, error retries and key rotation first.
- Avoid derived emotional health scores without validated meaning and user consent. Avoid auto-creating multiple reflection goals from AI response unless user confirms each item.

## Visual/UI system
- Use restrained dark and light palettes, not a colorful gradient on every button. Accent colors have semantic use: journal teal, goal amber/indigo, session violet, mood coral/lime by valence; accessible contrast 4.5:1 normal text target and 3:1 focus/icon UI.
- Standardize `Button`, `TextArea`, `Input`, `Card`, `Badge`, `IconSurface`, `Feedback`, `EmptyState` with semantic tokens and states. Legacy Tailwind utility bridge is temporary, not the design system itself. Existing project has **Tailwind**; screenshots may look Bootstrap-like but `bootstrap` is not installed as an npm dependency.
- Keep descriptive text with icons on major actions and nav. Use Lucide icons with color-accent surfaces rather than icon-only meaning; mood pictograms can use selectively rich artwork if consistent/licensed.
- Test widths 320/360/390/430/1280/1440/1920, with long RU copy, browser zoom 200%, keyboard, WCAG AA contrast checks, screen readers.

## Roadmap / release order
- **02B1 NOW**: isolated session textarea + error-preserving send + dark/light composition (Draft PR #8).
- **02B2**: journal save-state reliability and idempotency, deliberate privacy-aware draft persistence.
- **02B3**: pure event-based chronological view model with RU timezone tests, search/filters, redesign mood/card hierarchy.
- **02C**: goals task forms/immutable updates, statuses/progress and redesign; session context panel and generated exercise confirmation.
- **03**: secure AI backend, user account linkage, isolated Preview Firebase and user-controlled data export/restore before production release.

**Hard boundaries**: No production merges/deploys or live Firebase writes. All demo testing under `demo-reflect-auth-qa` Auth/Firestore emulators, preserve old IDs, anonymous account integrity and encrypted backups. New schema migrations require separately approved plan and backup.
