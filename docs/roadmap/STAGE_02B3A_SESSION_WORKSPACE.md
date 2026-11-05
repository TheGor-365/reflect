# Reflect 2.0 — Stage 02B3A: session workspace redesign / message integrity

Status: **DRAFT**, owner screenshots reported an obsolete light-gray single-line composer and wrong placement. Browser screenshots were made while the old instance was still serving port 3100; cloning `reflect-diary-qa` and `npm ci` alone does NOT switch the running server. This stage solves the actual layout as well and requires new local visual QA.

## User request and UX direction
- New session should feel like a modern chat: messages in a scrollable panel, textarea **at the bottom**, auto-expanding from ~72 to 280px for long entries, respecting line breaks; no light/gray Bootstrap-like bar.
- Professional dark/light Midnight Aurora; mobile 390px/320px bottom dock must not cover the input.
- Empty start screen should show action rather than a fake assistant message, and no fake recommendations/"How it works" results.
- Business logic should not simulate working AI while the secure server is not ready; make a useful alternative workflow that **saves as a journal entry** with explicit Firestore acknowledgement.

## Implemented
- Layout: `reflect-main--sessions` fills remaining viewport; `reflect-session-screen` -> `reflect-session-chat` (flex column) -> conversation bar / internal scrollable messages / bottom composer, with responsive safe-area accounting. Show context panel **only** when actual session recommendations or exercises exist. Initial no-selection state has a primary Start Session button.
- Composer: separate Markdown-safe plain-text `textarea`, dynamic height 72–280px; visible text and keyboard shortcuts; action `В дневник` saves user-typed text using Stage 02B2's existing `useEntrySave('diaryNotes', uid)` stable ID retry scheme. It does NOT write to sessions or pretend the AI call completed; `AI_SESSION_ENABLED=false` stays fail-closed.
- After successful Firestore `setDoc`, composer clears and save status is shown. On error the text remains editable and retry uses same allocated document ID. No browser localStorage autosave; warnings remain.
- Removed **automatic AI-created goals** in new send path (recommendations must be reviewed by user) and removed default invented score 50. Historical session data is untouched; no schema migration.
- Chat bubbles: separate roles, no white legacy Tailwind bars; long lines wrap and audio buttons receive accessible labels.
- Current assets: Lucide icons, coherent color-coded actions, no external image/font or new packages.

## Scope controls
- No change to production Firebase, Auth, Firestore paths, saved identifiers, payment systems or Vercel production. `main` stays unchanged, all stacked PRs remain Draft.
- The AI remains disabled and no secrets are placed in browser; secure AI backend, quota, explicit consent, account linking, Preview isolation, data export/restore still block release.
- "В дневник" is a new **explicit** user action for current text; it is not an anonymous chat session or automatic save. Browser reload before action may still lose text; privacy-first durable draft design remains a later review.
- Assistant replies/results in old sessions are read-only until a real server is implemented. No new AI-based metrics.

## Acceptance checklist
- [ ] `npm ci`, TypeScript, 27 existing + new UI tests, Vite production build, full npm audit.
- [ ] Isolated Chromium E2E: mobile 390px new session; `textarea` visibly grows, composer sits above dock, send disabled when AI unavailable, save to Firestore notes and user isolation, no real network requests.
- [ ] Owner desktop 1440px and mobile 390/320px dark/light screenshots with 5+ paragraphs and browser zoom 200%; test keyboard, focus, long text, local scroll, audio button.
- [ ] Confirm full-height screen has no secondary page scroll or hidden field under mobile dock.
- [ ] Next after visual sign-off: separate journal chronology/search/filter PR (Stage 02B3B); goals/task mutation safety and modern cards; secure server AI and recoverable drafts.

## Known edges and future QA
- Avoid persisting personal reflections in localStorage without privacy review; current text stays in React state only until journal save.
- Real-device viewport keyboard behavior and screen reader verification not proven by headless Chromium. WCAG 2.2 AA is a target, not certified.
- Sessions stored long before Vite may contain historical pseudo-scores; UI will eventually hide unvalidated numeric score display; do not rewrite existing documents without explicit migration.
