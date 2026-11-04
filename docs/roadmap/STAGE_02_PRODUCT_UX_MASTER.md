# Reflect 2.0 — Stage 02 product UX / Midnight Aurora

Status: **APPROVED DIRECTION, WORKING DRAFT IMPLEMENTATION**. Supersedes no earlier safety gates. Design decision was accepted by owner on 2026-11-04 and reconfirmed in conversation 2026-11-05. Draft PR only, not a release.

## Restore product intent and distinguish built vs planned

### Verified in current source
- Daily diary notes; dated timeline combining notes, moods, sessions and session-linked goals; quick mood check-in.
- Goals: checklist/reflection, deadlines, postpone and feedback; there is no safe-save indicator, search/filter or browser-independent persistent login yet.
- Session chat UI and stored session history. **AI network calls are intentionally unavailable in the Vite candidate** while secure provider backend is missing; do not label chat fully functional.
- Firebase anonymous account, user-scoped Firestore, profile modal, audio playback/optional speech recognition (browser-dependent).
- Existing nav: 4 sections (diary, sessions, goals, session schema), one desktop sidebar and mobile drawer.

### Approved Reflect 2.0 minimum product scope (2026)
1. Usable journal: save state and retry-safe writes, auto/offline drafts, full-text client-safe search/filter and meaningful empty/error states.
2. Goals: nested actionable steps, clearer progress/status and link to sessions.
3. Mood: user-reported tracking and understandable weekly review/charts, **not diagnostic or invented psychiatric scores**.
4. Sessions: recoverable user input, previous sessions, structured optional AI suggestions; server-verified identity, quotas and consent before any AI analysis.
5. Durable account upgrade/linking preserving anonymous UID data, privacy export/delete and safe migration.
6. UX: Midnight Aurora with polished desktop workspace and independent mobile IA, dark/light, RU first then EN, WCAG 2.2 AA as test target, widths 320/360/390/430 and 1280/1440/1920, reduced motion and keyboard navigation.
7. Release: Vercel Preview isolated from production Firebase, secure server-side Gemini API with key rotation, smoke and rollback.

### Long-term 2025 vision, NOT a current implementation claim
- Roles, Mindspace, BodyMap, stress/energy metrics, AI/expert/group sessions, specialist handoffs, exercises, voice, PWA/native, notifications, optional integrations. These were earlier product ideas or partially implemented in other prototypes; this repository must be checked feature by feature before claiming they exist.
- Never silently fabricate ratings or mental-health diagnoses. AI is an optional tool, not a therapist or medical service.
- Payments and white-label are discovery only until supported by users, operational constraints and verified lawful payouts.

## UX architecture

### Desktop >=1024px
- Left permanent deep-navy rail: brand, 4 primary destinations, high-contrast new session CTA, session history, profile.
- Sticky, readable global header: current section in Russian and theme switch.
- Centered fluid content canvas (max 1480px) with generous spacing and clear heading hierarchy.
- Existing content is temporarily themed with scoped design-token bridge. Later phases must migrate real components instead of indefinitely overriding Tailwind utilities.

### Mobile <=1023px
- Sticky compact topbar; accessible drawer with Escape/backdrop/close button.
- Bottom safe-area dock with 4 existing destinations and prominent New Session action.
- Five 44px-ish icon targets; maintain readable labels at 320px. Test with keyboard, touch and screen reader rather than assuming compliance.
- Sidebar session list remains accessible via drawer, not duplicated into the dock.

### Theme and accessibility
- Default midnight dark, optional light; theme saved as **non-sensitive local browser preference only**, never transmitted to Firestore.
- Body tokens: app bg, content, muted, card, border, accent. Prefer reduced motion; visible focus outline; skip link; semantic nav, buttons, `aria-current`.
- Do not claim WCAG AA until contrast checks, mobile keyboard tests, screen reader and automated checks all pass.

## Implementation slices and acceptance

### 02A shell — current DRAFT PR #7
- Scope: `App.jsx` shell only, `Sidebar`, `NavItem`, `Header`, `MobileDock`, CSS tokens; 4 independent UI tests. No change to Firestore paths, auth provider, profile writes, AI service, package graph or data.
- Verify: `npm ci`, strict `npm run typecheck`, Vitest **18/18 expected** (14 existing + 4 new), Vite build and isolated demo Chromium E2E.
- Owner visual QA: desktop 1440px and mobile 390px + 320px, dark and light; check diary, goals, sessions, opening/closing drawer, Escape, dock buttons, text contrast, wrapping and any overlay with modal.
- No deploy; no app approval until owner sees real screenshots. Static concept pictures are inspiration, not verified product UI.

### 02B journal and mood — next
- Replace legacy white Tailwind forms/cards with real theme-aware components, hierarchy and keyboard labels.
- Add draft-first note saving, explicit save/pending/failed state and error handling BEFORE AI. No silent loss on reload.
- Timeline filters/search and empty states with existing data only; schema-preserving tests.

### 02C sessions and goals
- Responsive two-pane desktop session workspace, mobile split steps, pause/failed AI state without misleading success.
- Goal cards, substeps, progress and exercises; add idempotency for AI-derived writes before enabling.
- Replace legacy generated numerical AI scores from UX (retain old data fields until migration decision).

### 02D analytics and inclusion
- Charts from self-reported data, optional weekly review, content export, accessibility and RU/EN.
- Mindspace and BodyMap require separately approved UX/product definitions and privacy review.

### 03–05 release blockers
- Anonymous-to-permanent Auth account linking and recovery, Firestore rules testing and true export/delete.
- AI provider only via verified server with rate limits, budgeting, redacted logs and rotated secret.
- Staging on a distinct Firebase demo/staging project; production explicit owner approval and rollback. Do not merge stacked PR #3→#7 automatically.

## QA matrix / stop conditions
- Breakpoints 320 / 360 / 390 / 430 / 1280 / 1440 / 1920.
- No horizontal page overflow, no hidden controls behind fixed dock; keyboard focus and click targets, Escape close, restore after refresh.
- Display preexisting synthetic UID, profile, notes/moods and no network access except local emulators.
- Light/dark covers overlays, forms and validation states; if not, log as incomplete before UI acceptance.
- All new tests/build and CI, no production mutation; preserving existing anonymous user/browser context is mandatory.
