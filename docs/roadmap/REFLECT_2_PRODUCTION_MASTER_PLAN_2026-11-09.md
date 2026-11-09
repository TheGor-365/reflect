# Reflect 2.0 — Product-to-Production Master Roadmap
**Version:** 2026-11-09 · **Product owner priority:** working account → real AI → product QA/refinement → release.

This document supersedes the *execution order* in older technical roadmaps, not completed work or privacy/safety constraints. Source of truth: historical Reflect 2.0 Stage00–06 plan; `docs/roadmap/STAGE_02_PRODUCT_UX_MASTER.md`; Stage04H runbook; owner's verified staging browser/HTTP/CI acceptance on 2026-11-09. This is a **plan**, not evidence that unfinished features are deployed.

## A. Product contract and boundaries
Reflect is a private personal-reflection product: diary/timeline, user-entered mood, goals with steps, sessions with optional Grok AI support and explicit save. Not clinical diagnosis, psychotherapy or fabricated mental-health scores. One continuous user experience across desktop and mobile.

Approved design: **Midnight Aurora** (dark default + persisted light preference), teal / cyan / indigo accents, Russian UI, crisp content-first hierarchy, mobile-first, accessible focus and reduced motion. Avoid fallback white Stone/Tailwind pages or loaders. Preserve real user data, anonymous UID on upgrade, history and backups.

**Core loop:** sign in → write or choose a session → optional informed consent to send only one message to AI → see a real model response → explicitly save session or a note → derive optional actions/goals via user review → review history and progress.

**No repeated manual service wiring:** user configures a permanent account once; platform manages Firebase tokens/App Check and server authorization silently for every session. The transient `REFLECT_AI_ALLOWED_UID` staging QA gate is **not** the long-term entitlement model. Replace it with persistent account-level authorization / verified-email / plan policy before general rollout; do not simply remove payment access controls. Do not require owner to copy a UID at every demo.

**Environment boundary:**
- Current production: Vercel `reflect-three.vercel.app`, Firebase `reflect-8fdc8`, historic `main` — protected, not a release target until approval.
- Current staging: Firebase Hosting `reflect-ai-staging.web.app`, Firebase project `reflect-ai-staging`, Railway `reflect-ai-api-staging.up.railway.app`.
- GitHub stacked Draft PR #36 (Stage04H) and next Stage05A. PRs are not merged to main by merely passing CI. No secret JSON/key, user data, billing, or UIDs in GitHub, browser bundle or public documentation.

## B. Evidence checkpoint, 2026-11-09
**Verified:** staging API healthy 200 with `aiEnabled:false`; missing credentials POST 401; browser signed Firebase Auth + consumable App Check produced expected 503 `provider-disabled` after SDK `appId` bug fix. Railway deployed commit `1f3dd2c`, sealed Firebase Admin + xAI secret variables, paid egress OFF. Public staging browser built and deployed by owner from Stage04H; local Vitest 209 + Node QA 13 PASS; 7/7 CI on exact PR #36 HEAD.

**In code / unproven as live user journey:** Firebase anonymous-to-email link, email/password sign-in, reset/verification, Firestore owner-scoped saves, local encrypted drafts, goals, mood insights, export and demo-only recovery. These have unit/mock/emulator coverage but no complete production acceptance. Existing staging Firebase email/password provider availability remains **unverified**.

**Not verified:** true Grok 4.3 response through Railway, provider cost/usage receipt, persisted multi-device registered login, real session save after AI, recovery/delete data lifecycle, full 404/500 UI, favicon, themed bootstrap loader, production deployment and monitoring.

## C. Stage 05A: Account / permanent identity — P0
**Goal:** a real, self-service registration and sign-in, no mandatory manual UID onboarding.
1. Keep guest-first access optional, but show prominent Register / Sign in. Do not force a new UID when upgrading: Firebase `linkWithCredential` preserves guest content.
2. Enable Email/Password provider in **isolated staging Firebase Console once**; verify real sign-up → email verification → sign out/in → refresh → second browser/device → same UID and data. A one-time console setting is distinct from repeated account wiring.
3. Test existing-account sign-in with empty guest state; when guest has data, prevent silent data loss and offer link/migrate strategy requiring explicit owner decision (no implicit merge).
4. Password reset deep link/action handler, verification refresh, account-state feedback, good password guidance without exposing credentials, errors/lockouts/rate-limits, keyboard accessibility.
5. Server `verifyIdToken`; require verified linked email and persistent AI entitlement/plan record (independently of UI), not arbitrary anonymous Firebase account for paid use. Provision first staging tester once through a controlled approval flow; invite/onboarding or admin provisioning may be added if needed, but normal returning users never re-enter technical IDs.
6. UX: polished login/register/verification/recovery forms and empty/loading/errors consistent with Midnight Aurora. Separate public route vs account dialog only if user experience benefits.
**Acceptance:** account survives refresh; new device authenticates into same UID and sees previously saved synthetic notes; reset/verify flows function; guest history not lost; unauthorized/other UID cannot read data; logout and return behavior is predictable.

## D. Stage 05B: Real Grok 4.3 conversation — P0
**Goal:** one guarded real response, then normal signed-in chat without staging-only controls.
1. Server-only secret in Railway, fixed selected model, no key in Vite/HTML/source; signed Auth ID token, consumable App Check, exact origin, explicit per-message consent, canonical request ID and replay lock.
2. Entitlement authorization via verified account + private server-side access state, no public guest paid usage and no client-controlled privilege. Keep independent egress stop, private Firestore kill switch, atomic quota ledger.
3. Verify staging Firestore transaction permissions and private runtime flag OFF, reservation and replay handling; budget caps: provisional reserve USD $0.01/request, $0.05/user/day, $0.20/project/day (not absolute provider billing caps). Keep visible xAI platform spend controls. Do not assume that top-up limits are spend caps.
4. Enable access for one registered and verified staging tester through the durable account policy. Owner explicitly agrees to one non-personal synthetic paid model call; never automatically retry ambiguous or billed calls. Record provider model, success/error HTTP class and xAI Usage receipt; never log body/keys/tokens.
5. Confirm actual xAI Responses API schema/parser and reply shows in Sessions; no hallucinated success message or UI sample substitution. Then enable normal staging AI send for verified entitled accounts.
6. Consent for **current message only**, no whole diary/profile/history sent unless separately approved. Maintain local draft on error; explicit `Сохранить сеанс` persists original/user/AI messages to correct owner collection; reload/multi-device parity. No silent AI auto-save or psychiatric diagnosis.
7. Handle provider timeout, 401/403/429/5xx, insufficient credit, quota exhausted, revoked user, wrong App Check and repeated request ID.
**Acceptance:** controlled real response + traceable cost/usage; correct model response; safety/permissions; user-verified data flow, reload and ownership; repeat requests denied or idempotent.

## E. Stage 05C: Unified Midnight Aurora presentation — parallel P1
1. Brand icon favicon SVG and browser title/meta/theme-color; later PNG/Apple Touch icon and webmanifest/PWA.
2. First-paint HTML splash and React loader share tokens/layout and respect saved light/dark theme; no white screen, white spinner or style flash on refresh. Provide accessible live region, reduced motion and no fake indefinite progress percentage.
3. Unified error component 404 (unrecognized routes), 500 (unexpected client exception), 503 (dependency/service temporarily unavailable) and no-data/network/permission states. Explain distinction between visual SPA 404 and real HTTP status from Hosting; do not claim 500 HTTP for a client-side crash.
4. ErrorBoundary with safe recovery; never leak Firebase exceptions, credentials or user content. Network retry preserves user drafts; offline indicators and refresh controls.
5. QA desktop 1280/1440/1920 and mobile 320/360/390/430, including input keyboard, dark/light, modal overlays, screen reader labels, focus order, reduce motion. Contrast WCAG 2.2 AA is a goal to test, not a certification.
**Acceptance:** favicon visible, no theme flicker on cold/refresh, branded loader/error states, no broken navigation or data loss.

## F. Stage 05D: Full functional acceptance — P1
- Diary: safe notes, timeline, title, versions, date grouping, filters/search, retry/failure, reopen after reload.
- Moods: self-rated scale, saved check-ins, weekly review derived from actual entries, zero fake clinical scores.
- Goals: create, nested steps, progress/status, due dates, postpone, link to accepted session suggestions.
- Sessions: new/existing, streaming optional future, user input draft, AI answer, save, list/scroll, text-to-speech/microphone graceful fallback.
- Profile & data: update, export, verification/reset, deletion request (real account and Firestore cleanup), backup/recovery design and retention policy. Do **not** upload private backups as QA fixtures.
- Performance/accessibility: code splitting to reduce 664kB staging JS, keyboard/mobile QA, browser support, readable errors, no sensitive logs.
**Acceptance:** test matrix with screenshots and expected Firebase persisted results, no unintended writes to another UID.

## G. Stage 05E: Security, observability and release engineering — P0 for public
- Verify cross-user Firestore Rules, real signed/consumed App Check, scoped service account, private quota docs deny rules, rate-limit by UID/IP as available, abuse handling, account enumeration protection and content retention boundaries.
- Data export and deletion, privacy policy/user consent including third-party xAI retention, terms/disclaimers; accessibility and incident response; key rotation and revoke leaked legacy browser Gemini credential.
- Monitor health, provider error classes, aggregate latency/token/cost, non-sensitive request IDs only. Alerts on exhausted credits, increase in 401/429/5xx, crash/restarts; documented rollback/kill switch.
- CI gates: unit, integration/emulator, signed staging browser E2E, bundle and routing checks, dependency audit; snapshot/restore preflight. Plan safe stacked PR flatten/merge, branch-by-branch review and production rollback rehearsal.
- Deploy only after owner approval to Vercel production + production Firebase with distinct credentials, verified billing/service entitlement and rules; one smoke for registered test user, confirm real use and monitor.

## H. Stage 06: Product evolution / revenue after stable V1 — NOT MVP blockers
- PWA install and offline draft improvements; EN localization; optional voice input/output; Mindspace and BodyMap after privacy/UX specification.
- Journal intelligence, opt-in weekly AI summaries, verified personalized exercise suggestions, respectful reminders.
- Native iOS/Android, Rails API service only if justified by architecture/business economics (not an immediate migration away from working Firebase/React).
- User interviews, funnels, retention, pricing tiers and unit economics of xAI, legal payment/payout feasibility before subscriptions, expert sessions, white-label or marketplace.
- No invented engagement claims, subscriptions, expert features or clinical outcomes in release materials.

## I. Definition of Done for V1
A completely new user can register, verify and return to a **persistent** account on another device; create diary entries, mood and goal, enter Sessions, deliberately share exactly one message with a real Grok 4.3 backend, see actual model response, explicitly save and reopen it, export/delete their information, and recover from poor connectivity. No fallback styles or blank/error pages, no cross-user leakage, bounded provider expenditure, supported rollback/monitoring; production release checks are documented and owner-approved.

## J. Working cadence and decisions
Work in small stacked Draft PRs; inspect exact branch SHA and CI after each code change. The assistant modifies code, tests and docs through GitHub; owner performs local terminal/browser/console operations only when necessary. Send 1–3 actions per screenshot, do not request credentials or UID in chat. Checkpoint each meaningful step in PR and master roadmap. Priority: **live registered user → live Grok reply → refine product**. No production mutations, full AI rollout or destructive data migrations until owner release approval.
