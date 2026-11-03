# Reflect 2.0 — approved minimum engineering roadmap

Status: **APPROVED MINIMUM SCOPE** by product owner, 2026-11-04. All additions must preserve the gates below. This is a plan, not a claim that features already exist.

## Product positioning
Personal AI-assisted reflection, journal, mood tracking, goals and progress. The application is not a therapist, diagnostic service, or crisis intervention service. AI suggestions are optional; no invented psychiatric scoring or unvalidated diagnostics.

## Design decision
Concept: **Midnight Aurora**. Dedicated desktop layout and mobile-first navigation; dark/light theme, consistent design tokens, accessible typography, accessible controls, meaningful loading/error/empty states, reduced motion. Visual testing for 320/360/390/430px and desktop 1280/1440/1920px. Design mockups are proposals, not product screenshots.

## Platform decision
Maintain React + Firebase Auth / Firestore; maintain deployed Vercel frontend as known from GitHub/Vercel until deployment ownership has been fully checked. A separate Firebase Hosting deployment may exist, but is not independently verified. Modernize CRA to Vite, JS to strict TypeScript, then update React, Firebase SDK and Tailwind in small independently tested PRs. Do not simultaneously replace data model and UI framework. Keep AI API credentials server-side. Server endpoints may start on Vercel Functions; choose Railway only if workers/traffic require it. Docker is optional for reproducible development, not a requirement for hosting static frontend.

## Non-negotiable P0
1. Verify active deployment(s), current default branch, auth provider/project and Firestore rules; locate and safely export existing live data **before migration**.
2. Treat client REACT_APP_GEMINI_API_KEY as potentially exposed: do not print it, re-use it for a new production API, or commit secrets. Plan rotation through trusted provider dashboards.
3. Preserve anonymous-account data and provide explicit account upgrade/link migration paths. No silent deletion of Firestore documents, auth users or browser data.
4. Introduce server-side verified auth, per-user isolation, rate limiting, request budgeting and safe logs.
5. Save user messages/drafts before AI, use idempotency keys for AI-derived goals, and make every write retry-safe.

## Engineering phases (release gates)
- **00 Baseline & data preservation**: main SHA/deployment inventory, data inventory, Firestore Security Rules review, safe backup and **tested restore** in an isolated non-production environment, rollback map. Acceptance: no production mutations, evidence log and confirmed recoverability. Never falsely mark backup verified on presence of README alone.
- **01 Foundations**: CRA -> Vite, JS -> TypeScript strict incrementally; React/Firebase/Tailwind upgrades as discrete changes, URL routing, CI and test harness. Acceptance: build, smoke, tests, known screens stable.
- **02 UX/UI**: Midnight Aurora design system, responsive desktop/mobile navigation, premium icon system, colors and contrast, accessibility, empty/loading/errors, light/dark. Acceptance: real screenshots and keyboard/mobile QA.
- **03 Auth/data/security**: durable user identity, upgrade from anonymous, normalized Firestore collections, safe offline drafts, privacy/export/deletion. Acceptance: emulator rules tests, two-account isolation, save/retry without duplication.
- **04 AI/automation**: server-only provider, versioned prompts and typed responses, evaluations and safety layer, controlled exercises/goals, user-approved scheduled summaries. Acceptance: injection/edge-case tests, quotas, no unsupported health claims.
- **05 Release**: preview and production gates, deployment smoke, error monitoring with sensitive data redacted, rollback, backend API final key setup at end. Acceptance: production flow genuinely tested, no secret leakage.
- **06 Documentation/portfolio**: RU/EN README, architecture, ADR, QA, security/privacy, truthful screenshots and release evidence, Drive presentation kit and SHA-based manifests. Acceptance: reproducible demo and source-linked claims.

## Expected feature scope
Core: journal, goal/checklist, reflection sessions, mood check-in, session history; add save status, search/filter, accessible mobile navigation, export/delete, robust auth, AI response streaming when feasible. Secondary: optional weekly reviews, charts based on **user-reported** data, opt-in reminders, PWA/offline drafts, voice accessibility and localization. Payments/freemium are discovery only until real user feedback, unit economics, provider availability and lawful payout are confirmed.

## Definition of done per PR
Source diff and SHA, no secrets/PII; CI green; smoke test or honest limitation; privacy/security review; staging screenshot when UI changes; approval before merge; production smoke and rollback evidence before marketing.

## Scope guard
Protect existing GitHub repos, other CAREER apps, Firebase Auth, Firestore data, Vercel production, Railway volumes and any Drive assets. Never automatically deploy or merge a proposed change. Do not represent educational work as a paid client project.
