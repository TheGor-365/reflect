# Reflect 2.0 — MASTER HANDOFF / ENGINEERING CONTINUATION
**As-of:** 2026-11-05, Armenia. **Repository:** https://github.com/TheGor-365/reflect. **Latest stacked Draft:** https://github.com/TheGor-365/reflect/pull/10. **Audience:** next autonomous engineering ChatGPT in CAREER. This is a NON-SENSITIVE public-repo handoff, not a copy of user data.

## 0. Mandatory handoff instruction — read and CONTINUE, never restart
You are taking over ongoing Reflect 2.0 modernization. The user explicitly authorizes autonomous, incremental development in GitHub DRAFT branches, accompanied by real regression tests and verifiable CI. Do not re-scope the product from scratch, replay completed audits, repeat cloning/backup/KYC/onboarding, change production, or request decisions that have already been made. Confirm current branch SHA and latest PR/CI before writing because this record is a dated snapshot. The developer can act in connected apps; the user's Linux desktop is NOT directly controlled by the GitHub connector.

### Immediate stop point (last direct user evidence)
The user already cloned `work/reflect-session-workspace-2026-11-05` into `~/reflect-chat-qa`; `asdf set nodejs 22.23.4` and `npm ci --no-audit --no-fund` completed (370 packages). Environment was exported for SYNTHETIC `demo-reflect-auth-qa`, and `npm run dev -- --strictPort` FAILED only with `Port 3100 is already in use`. In a different local terminal `~/reflect-ux-qa` displayed `VITE v7.3.7 ready` then Ctrl+C, but another Vite/Node process may still own 3100. **No proof that the new PR #10 UI was ever served to the user's browser.** An earlier screenshot of a pale-gray single-line form was from a stale/older Vite process, not evidence of a PR #10 regression.

FIRST NEXT ACTION (do not reclone or reinstall): ask the user to execute ```bash
ss -ltnp '( sport = :3100 )'
# if needed:
lsof -nP -iTCP:3100 -sTCP:LISTEN
```
Read actual PID/command and gently stop ONLY the stale local Vite process (prefer Ctrl+C in its own terminal, or SIGTERM of confirmed PID; NEVER killall node). Keep synthetic Firebase Auth emulator 9099, synthetic Firestore emulator 18081 and separate restored private emulator 18080 untouched. Then:
```bash
cd ~/reflect-chat-qa
git status --short --branch
git pull --ff-only
export VITE_FIREBASE_CONFIG='{"apiKey":"demo-only-key","authDomain":"demo-reflect-auth-qa.firebaseapp.com","projectId":"demo-reflect-auth-qa","appId":"1:12345:web:demo"}'
export VITE_APP_ID=reflect-8fdc8
export VITE_USE_FIREBASE_EMULATORS=true
npm run dev -- --strictPort
```
Open `http://127.0.0.1:3100` and hard-refresh. Check desktop and Chrome responsive 390px/320px, dark/light, multiline 5+ paragraphs, anchored composer, scroll, Save to Diary with SYNTHETIC text, data readback and reload. Send owner only 1–3 local steps and ask for screenshot; do not say PR #10 visually approved until observed.

## 1. Product charter and architectural ground truth
Reflect is a **personal journaling / reflection / goals / optional AI sessions product**, not a clinical mental-health diagnosis or licensed therapy. Upgrade an EXISTING app preserving history and legal user control, build modern desktop/mobile UX, prioritize private and reliable journaling over decorative effects or monetization. **Approved direction 2026-11-04/05: Midnight Aurora**: polished dark/light, professional typography, semantic multicolor icons, separate responsive desktop/mobile information architecture; Russian first, English later.

Production on Vercel: `https://reflect-three.vercel.app` (Vercel project `reflect`). Production Firebase Spark project: `reflect-8fdc8`. Main branch remains `b3a72c240bd193e89346a0a5655861cc726f4d61` when verified 2026-11-05. DO NOT merge or deploy until release gates and explicit owner go/no-go. This is an existing React 18/Firebase 10 app; Draft chain migrated CRA -> Vite 7.3.7, Node 22.x, TypeScript 5.9.3 incrementally (strict TS for .ts/.tsx; legacy JS allowed). Tailwind 3/PostCSS; Lucide icons; React Testing Library/Vitest and Playwright browser tests.

Firestore data model: `artifacts/reflect-8fdc8/users/{uid}/{collection}`, with `diaryNotes`, `goals`, `moods`, `profiles` and `sessions`. Some parent documents do not exist while subcollections exist; do NOT mistake this for missing data. Original Firebase Auth uses 11 anonymous identities (7 with Firestore data); account continuity is browser/origin-bound until secure account linking. Existing stored documents include timestamps and nested journal entries/reflections; migration without mapping/rollback can corrupt chronology.

Approved MVP: diary with safe writes + recoverable privacy-aware drafts, local-calendar chronology, full-text search/filters and accurate empty/error states; mood tracking from user reports and weekly descriptive review; goals with nested checklist, due dates, statuses/progress and confirmations; sessions with recoverable text, stored history and OPTIONAL secure AI; permanent account upgrade preserving UID and data; user export/delete; responsive accessible UX; staging isolation + reversible release.

2025 long-term ideas: roles, Mindspace, BodyMap, stress/energy metrics, expert/group sessions, exercises, voice, PWA/native, notifications, integrations, white-label and payments. **Do not misrepresent these as implemented or automatically include them in MVP.** Discover/validate separately; commercial payments need explicit product decision/legal/payment feasibility. Clinical scores/diagnoses must never be fabricated.

## 2. Recovery, backups and security guarantees already VERIFIED — do not redo
Stage 00: private readonly Firestore REST-typed JSONL + manifest and SHA-256, exported 26 docs in 7 UID data scopes; 11 Firebase anonymous Auth records, all 7 Firestore UID sets match Auth; no missing Auth identities for stored data. Encrypted GPG bundle checked by decrypt+tar and downloaded copy checksum MATCH. Private Drive location `My Drive/Reflect idea/REFLECT_PRIVATE_BACKUPS`, restricted owner-only; do not enumerate or move private original files unless restoration is specifically required, and do not expose raw UID/PII/journal/key in GitHub or chat.
Separate local restored Firestore emulator `demo-reflect-restore` on `127.0.0.1:18080` verified 26/26 typed fields; Firebase Auth/Firestore synthetic QA `demo-reflect-auth-qa` uses `127.0.0.1:9099` and `127.0.0.1:18081`. Do not cross these environments, and never route local tests to the production project. 12 synthetic rules tests PASS (4 owner permitted, 8 other/guest denied). Real production rules and backup validity are *not* by themselves a release approval.
Independent Draft PR #2 has backup tools and restore runbooks; PR #1 owns baseline/roadmap/audit docs. The encrypted backup's existence does NOT make anonymous accounts cross-device recoverable, nor does an emulator restore automatically restore Auth identities.

## 3. Verified implementation timeline — exact DRAFT PR chain
All PR #1–#10 are OPEN DRAFT, UNMERGED as of 2026-11-05. **PR #1 and #2 are independently based on main. PR #3 is based on main; PR #4→#10 are STACKED ON THEIR IMMEDIATE PREDECESSOR.** Do NOT merge child PR into main alone or unknowingly flatten cherry-picks without reconciling dependencies and checking security.

| PR | Branch | Implemented, tested or documented |
|---|---|---|
| [#1](https://github.com/TheGor-365/reflect/pull/1) | `work/reflect-2-baseline-2026-11-04` | approved baseline, audits, release checkpoints, recovery record; docs only |
| [#2](https://github.com/TheGor-365/reflect/pull/2) | `work/reflect-readonly-backup-2026-11-04` | backup scripts, private restore emulator, tests and rules; independent |
| [#3](https://github.com/TheGor-365/reflect/pull/3) | `work/reflect-auth-stability-2026-11-04` | P0 one Auth subscription/dedup anon login, preserve existing UID; distinguish missing profile vs permission/network errors, never fake empty onboarding |
| [#4](https://github.com/TheGor-365/reflect/pull/4) | `work/reflect-vite-foundation-2026-11-04` | CRA→Vite, locked npm ci, Node22, explicit VITE env fail-closed, synthetic Chromium QA, branch Vercel dist override; AI disabled until backend |
| [#5](https://github.com/TheGor-365/reflect/pull/5) | `work/reflect-typescript-foundation-2026-11-04` | strict incremental TS, pinned 5.9.3, typed date helper, CI check |
| [#6](https://github.com/TheGor-365/reflect/pull/6) | `work/reflect-dependency-security-2026-11-05` | runtime dependency remediation trial via pinned overrides; npm audit omit-dev reached zero; compatibility/reachability and dev-advisory followup remain |
| [#7](https://github.com/TheGor-365/reflect/pull/7) | `work/reflect-midnight-aurora-shell-2026-11-05` | Midnight Aurora dark/light design tokens; desktop sidebar, sticky header, mobile drawer+dock, focus/keyboard tests, theme persistence |
| [#8](https://github.com/TheGor-365/reflect/pull/8) | `work/reflect-session-composer-2026-11-05` | multiline 112–280px textarea, Ctrl/Cmd+Enter, error preserves text, no insecure AI |
| [#9](https://github.com/TheGor-365/reflect/pull/9) | `work/reflect-diary-save-safety-2026-11-05` | stable preallocated Firestore doc ID per save attempt for diary/mood, pending/saved/failed, duplicate pending lock, text preserved, non-sensitive default note titles |
| [#10](https://github.com/TheGor-365/reflect/pull/10) | `work/reflect-session-workspace-2026-11-05` | full-height chat, separate messages scroll, textarea anchored at bottom and grows 72–280px, cohesive bubbles, real-only context panel, new session empty state, safe explicit Save to Diary while AI disabled; no automatic AI goals or fake score fallback |

Latest verified PR #10 HEAD before this documentation refresh: `3dde18f27804ebf3b37f7354bc678c1bbb92764a` (docs-only commit based on previously passing `a9ce8719d865e8ccb7d1e239dcdf0ba6f28f8823`; functional implementation tests also passed on `abafe155b414afea55cd9f78c201130afd47d69f`). **Three CI workflows PASS on the exact 3dde HEAD:** strict TypeScript / 34 Vitest tests / Vite build https://github.com/TheGor-365/reflect/actions/runs/42072761024 ; locked Vite CI https://github.com/TheGor-365/reflect/actions/runs/42072761021 ; isolated Chromium Auth/Firestore E2E https://github.com/TheGor-365/reflect/actions/runs/42072761187 . The browser suite confirms 390px bottom textarea auto-grow/no overlap, synthetic Save to Diary readback, isolation between browser identities, UID persistence, responsive navigation and theme. It does NOT prove owner visual approval, physical-device keyboard/screenreader QA, safe production API, Auth linking or live release. An earlier CI failure on `f040a36` was a stale assertion copy, fixed before successful current runs; Gmail alerts for old SHAs are not authoritative. Check current HEAD and latest CI after any subsequent doc/code commits.

PR #9 save semantics: `setDoc` retries keep one preallocated document ID, preventing a *new document ID* on ambiguous retry, but not guaranteeing strict exactly-once write; retry may replace same document and advance server timestamp. Drafts are currently only in React memory before explicit save and can be lost by reload/crash. Do not claim encrypted autosave exists.

## 4. Sources of truth for the NEXT assistant (read in order)
1. This file `docs/handoffs/REFLECT_2_CONTINUATION_2026-11-05.md` on PR #10 head; verified by GitHub connector, not only summary.
2. `docs/roadmap/STAGE_02_PRODUCT_UX_MASTER.md` — approved 2026 MVP + Midnight Aurora + responsive acceptance matrix.
3. `docs/audits/STAGE_02B_UX_LOGIC_AUDIT_2026-11-05.md` — concrete diary timezone bugs, mood intensity, Goals.jsx mutation, UI styles.
4. `docs/roadmap/STAGE_02B2_DIARY_SAVE_SAFETY.md` — write-state, stable-ID caveats; `docs/roadmap/STAGE_02B3A_SESSION_WORKSPACE.md` — latest chat UI.
5. `docs/audits/SECURITY_REMEDIATION_TRIAL_2026-11-05.md` and `docs/audits/DEPENDENCY_SECURITY_2026-11-05.md` — patched transitive graph and remaining advisory/range risks.
6. `docs/roadmap/STAGE_01A_VITE_MIGRATION.md` and `docs/roadmap/STAGE_01B_TYPESCRIPT_FOUNDATION.md` — Vite/Node/TS constraints.
7. On independent PR #1 branch, `docs/audits/FIREBASE_VERCEL_VERIFICATION_2026-11-04.md`, especially latest tail, captures authenticated environment and prior CI evidence.
Read current source files before changing logic: `src/features/Diary/Diary.jsx`, `src/features/Goals/Goals.jsx`, `src/features/Sessions/{Sessions,SessionComposer,ChatMessage}.jsx`, `src/hooks/{useAuth,useFirestore,useEntrySave}`, `src/App.jsx`, `src/index.css`, `src/api/geminiService`, `src/firebase/config` and corresponding tests. Treat implementation as authoritative over an outdated roadmap paragraph.

## 5. Ordered delivery plan (complete by verifiable outcomes, not number of PRs)

### Stage 0: resolve local browser QA of PR #10 — immediate
0.1 Identify port `3100` owner; if stale Vite process, politely terminate ONLY its PID. Do not touch 9099,18081,18080. Confirm current checkout `~/reflect-chat-qa` tracks PR #10 and has demo VITE settings; do not re-clone.
0.2 Run, hard refresh, inspect desktop widths 1280/1440/1920 and mobile widths 320/360/390/430 in dark/light. Validate composer anchored at bottom; long text 5+ paragraphs grows then internally scrolls; message scroll, keyboard/dock, input focus and readable typography; no gray/white legacy strip; no horizontal body overflow.
0.3 Test synthetic explicit Save to Diary then open journal/read back; reload UID stays same. Document actual defects separately; fix regression in PR #10 if necessary, then typecheck+Vitest+build+demo browser E2E. Owner screenshot is visual acceptance gate. Stop only when confirmed.

### Stage 02B3B: diary chronology, search and information hierarchy — next code PR
B3B.1 Review existing read-only diary transform. Build pure typed event view-model from existing firestore records, e.g. `{eventKey,sourceKind,sourceId,displayAt,parentSessionId,payload,isPending}`. No schema migration. Do not mutate snapshots or mix private data between UID-scoped stores.
B3B.2 Fix UTC grouping: currently `toISOString().split('T')[0]` assigns local Armenian early-night entries to wrong calendar day. Use real user timezone/local calendar components; support DST or selected timezone gracefully. Sort descending event time with deterministic `eventKey` tiebreak. Missing `createdAt` must appear in explicit Pending/Undated group, not vanish.
B3B.3 Surface appended note entries/reflections under actual event date, not old parent date; session-associated goals must not be pulled backward into old session date. Preserve links to parent session but limit timeline content to concise summaries; protect long sensitive text with expand controls.
B3B.4 Filters All/Notes/Mood/Goals/Sessions, scoped client search of authorized loaded data (no external index), date ranges, empty/error states, optional progressive render/pagination. Respect search privacy; do not log query/content.
B3B.5 Redesign journal header as `Сегодня` with primary note textarea and separate mood chip. Semantic cards: note teal, goal amber/indigo, session violet, mood contextual but never rely on color alone. One emoji/icon per mood, explicit 1–5 intensity words not five identical faces.
B3B.6 Unit tests on synthetic Armenia day boundary, ties, missing timestamps, appended notes, linked goals, untrusted/partial records; browser E2E both users and mobile. No Firestore writes from event grouping. Acceptance: chronology accurately represents entry timestamps without duplicates or omissions and the journal remains legible at all widths.

### Stage 02C: goals and tasks business logic
C.1 Replace flat form with clear active/on hold/completed board/list, counts and x/y progress; optional purpose/due date instead of unjustified required date; date-only parse as LOCAL calendar not UTC; due/overdue warnings without fake severity.
C.2 Create/edit/delete nested subtasks, reorder if needed, purpose, deadline and explicit completed action. Replace shallow object mutations (`newSubItems[index].completed = …`) with immutable updates; stable goal IDs instead of grouping by `sessionTitle` text.
C.3 Firestore update with user feedback idle/pending/saved/error, retries protected against duplicate/lost updates; decide how to guard concurrent writes (transaction/precondition for logical conflicts). Error should never falsely mark task completed.
C.4 Link goals/reflections to sessions while preserving independent lifecycle; suggested AI exercises are **not** automatically accepted goals. Explicit user review/approval and idempotent creation when AI is eventually enabled. Unit and browser tests of nested edit/delete, concurrent update/reload, empty and mixed state.

### Stage 02D: mood insights, polished design system, accessibility and i18n
D.1 Compute descriptive trends only from user-reported moods, weekly aggregates with clear denominators/missing data; no AI score 50 or clinical diagnostics.
D.2 Build consistent reusable theme-aware Button/Input/TextArea/Card/Badge/IconSurface/SaveFeedback/EmptyState and migrate old legacy white/Tailwind panels in a sequence; keep Midnight Aurora restrained. Meaningful semantic icons and contrast, no rainbow for decoration.
D.3 Responsive targets 320/360/390/430/1280/1440/1920, keyboard-only, mobile virtual keyboard, focus and reduced-motion, WCAG 2.2 AA as **test target**, not claimed certified. RU first, EN after stable copy; check dark/light modals, overlays, voice. User views screenshots; test dark/light contrast and body overflow.
D.4 Week review charts, explicit export UI linked to privacy stage; no third-party tracking of journal content. Quality gate is consistent visual/functional usability, not screenshots alone.

### Stage 03: identity, privacy, durable drafts and user rights
3.1 Design safe anonymous-to-permanent Firebase Auth linking (e.g. verified email/provider, depending on actual provider support); preserve existing UID and owned data, do not silently create new account and orphan records. Duplicate email/conflict and lost anonymous credential need documented recovery with consent.
3.2 Strong Firestore Rules: per-UID ownership, shape/field constraints, size limits and operation authorization; synthetic adversarial rule tests for read/write, UID mismatch, malformed payload, unauthenticated and unlinked user. Distinguish production rules read vs local test.
3.3 User data export and delete procedures with collection enumeration, confirmation, idempotency, retention/rollback plan, privacy notice and audit trail that never logs actual entry bodies.
3.4 Plan safe recoverable drafts: privacy options (Firestore draft scoped to UID / encrypted local IndexedDB with key handling), explicit consent, expiry and offline UX. Do not unilaterally store personal text in unencrypted localStorage. Reload/crash recovery test with synthetic data.
3.5 Restore rehearsal from private encrypted backup only in owner-approved isolated environment, never overwrite current production. Anonymous Auth recovery limits must be stated. No user secrets/KYC imported to GitHub.

### Stage 04: secure AI sessions (NOT operational yet)
4.1 Move Gemini calls behind server endpoint or protected serverless function; verify Firebase ID token server-side, scope UID and Firestore session owner, keep API key only in secure backend environment and rotate previously client-exposed provider key.
4.2 Explicit opt-in/consent before personal journal content crosses AI provider; model contract, data minimization, retention policy, redacted logs and visible delete controls. Zero live secrets or user records in VITE_* browser config, GitHub, CI artifacts or support chat.
4.3 Quotas, per-user rate limit, budget cap, abuse protection, timeouts, retry behavior, durable ordered conversation with server-side idempotency to avoid duplicate user/assistant messages; show pending/failed with unsent text preserved.
4.4 AI recommendation/exercise schema validated; user must approve before converting to a goal. No fabricated wellness scores or diagnosis/therapist claims; clear AI limitations and crisis-support guardrails where appropriate.
4.5 Synthetic e2e/mocks first, then isolated staging, backend integration security checks; enable AI in controlled rollout only after owner approval and provider billing constraints validated. Voice remains optional enhancement.

### Stage 05: CI/CD, staging, deployment and safe release
5.1 Create a distinct genuine staging Firebase project and restrict Vercel Preview to its own env. **Existing legacy REACT_APP_FIREBASE_CONFIG, REACT_APP_APP_ID and REACT_APP_GEMINI_API_KEY were historically exposed to both Production and Preview**. Never exercise Preview writes until verified isolated; Vite new VITE_* variables intentionally fail closed.
5.2 Confirm exact Vercel project variables for production/preview at time of release, rectify secret exposure/rotate, set server secrets in backend only. Production Firebase Spark quotas and billing constraints checked.
5.3 Formalize checks: pinned Node22 and npm ci, `npm run typecheck`, `npm test`, `npm run build`, full and runtime npm audit with triage, rules tests, emulator Playwright, visual QA, staged Auth/Firestore schema and rollback drills.
5.4 Resolve security PR #6 override risks: Firebase 10.14.1's Firestore declared grpc range `~1.9.0` vs overridden `@grpc/grpc-js@1.14.5`; npm runtime audit 0 on tested graph does not prove compatibility. Full npm audit previously had 9 development findings (8 high,1 moderate); re-run current and patch compatibly; do not use `npm audit fix --force`.
5.5 Integrate stacked PR #3→#10 *in dependency order*, evaluate how independent docs/backups PR #1–#2 should merge; preserve commit history/review. Rebase/merge with small conflict resolution. Never push to production/main or change live Auth/Firestore on this handoff's blanket authorization alone: request explicit production go/no-go once staging, backups, smoke and rollback are demonstrated.
5.6 Release in reversible stages; instrument sanitized error monitoring, test live user sign-in without disconnecting original anonymous account, existing notes/moods/goals/sessions, create/update/reload and export. Monitor; rollback if data-safety signals fail.

### Stage 06: future discovery / revenue and expansion
Only after usable, reliable baseline: validate Mindspace, BodyMap, session expert workflows, assisted coaching, PWA/mobile/native, scheduled reminders, integrations, social/community or expert roles. Scope by user value, safety and actual operating costs. Paid subscriptions, white-label and payment providers are a separate validated market/legal/payments workstream, not default work or implicit authorization.

## 6. Autonomous tool/plugin operating model
- **GitHub connected plugin:** always fetch live PRs, head/base/diffs, source and tests before edits. Write only a new focused branch or current Draft branch as appropriate; make commits and CI verifiable, update PR description/checkpoint. Do not spend cycles telling user to manually copy code which the plugin can commit.
- **Google Drive/Docs connected plugin:** inspect existing `Reflect idea` documentation for approved requirements and keep only NON-SENSITIVE master checkpoint in a suitably private document. Do not move/read private encrypted backups or share externally unless directly necessary and authorized. Verify created/edited file link and permissions.
- **Gmail connected plugin:** use only for relevant Reflect GitHub Actions, Vercel, Firebase Auth/security/deployment notices when diagnosing an issue. Check exact time/SHA, do not conflate delayed CI fail mail with current green workflow. No unsolicited outgoing emails or account edits.
- **Vercel connected plugin:** deployment metadata/log inspection in read-only mode while isolated Preview and production gates fail; do not use Preview for real write QA or change project-wide prod env casually.
- **Firebase emulators / browser QA:** connected agent may review CI evidence, but running a local user-owned server requires user terminal/screenshots (or an explicitly enabled local computer environment). Never invent seeing local screen or kill process without actual access.
- **Other design/engineering plugins:** choose useful ones (Product Design, GitHub, Google Docs, Vercel, source tests) based on actual task; they do not supersede source/code verification. Plugins do not grant blanket rights to expose private entries, bypass auth, change billing or publish production.
- **Working cadence:** execute 1 scoped stage, perform tests, push Draft, inspect CI, document defects/risks and give user 1–3 direct actions. User prefers concise Russian operations over abstract advice. Autonomously resolve clear code bugs; no unnecessary broad questionnaire.
- **Evidence:** statements are labeled completed / validated test / owner QA pending / release blocked. Every significant stage checkpoint records PR URL, branch+HEAD, CI URL and pass counts, data-safety note, unresolved blockers, next 1–3 actions. GitHub and Drive don't automatically sync other chats; update artifacts explicitly.

## 7. Hard security/release invariants
- Never sign out, delete anonymous Auth identity, clear production browser storage, reset `reflect-8fdc8`, or write synthetic data to it. No mass UID renames or Firestore collection migrations without signed-off backup/rollback.
- Do not leak personal journal contents, private Firestore/Auth backups, backup passphrase, Gemini API key, credentials, IDs, or tokens in GitHub, screenshots, logs, Gmail, Google Drive shared folder or external AI. Do not require user to paste secrets.
- Old client-side Gemini key was exposed as REACT_APP_GEMINI_API_KEY. Rotation and backend-only secret are release blockers, not solved by disabling frontend call alone.
- No Vercel Preview writes while its production Firebase config isolation is unverified; a READY build is NOT proof of safe runtime.
- Do not claim completion of autosave, account recovery, all accessibility requirements, secure AI, data deletion or live deployment without direct acceptance evidence.
- User permits automatic Draft development and linked-app reads/writes relevant to this plan; DO NOT interpret as permission for destructive production migration/merge/deploy, billing purchases or sharing/deleting user content. Obtain targeted approval at the release gate.

## 8. Required NEXT-CYCLE response/checkpoint template
**Проверено:** facts supported by HEAD/CI/screenshots. **Сделано:** named branch, changed files, commit SHA, Draft PR. **Тесты:** typecheck / unit count / build / emulator browser / audit with exact status. **Не подтверждено:** owner visual, live environment, exports, recovery, etc. **Блокеры:** one concrete dependency. **Далее:** 1–3 user steps or your next fully autonomous code batch. Keep master up to date in `docs/handoffs/REFLECT_2_CONTINUATION_2026-11-05.md` and update linked Drive copy if one exists; do not assume another conversation inherited it.

**Stop condition for full project:** only declare Reflect 2.0 ready when functional MVP acceptance, secure anonymous account upgrade, tested backup/restore/export/delete, isolated staging+safe AI backend (if advertised as functional), full CI and owner desktop/mobile visual acceptance, reversible release and live smoke are all evidenced. If a feature is intentionally deferred, label it explicitly and never market it as implemented.


## 9. Continuation checkpoint — Stage 02B3B, 2026-11-05

**New stacked Draft PR:** https://github.com/TheGor-365/reflect/pull/11
Branch `work/reflect-diary-timeline-2026-11-05`, based directly on PR #10 branch `work/reflect-session-workspace-2026-11-05` (base at `7006fe5021d1e71aa2ed4b6aa4e96cbb00246943`). PRs #1–#10 remain open Draft, unmerged; `main` still `b3a72c240bd193e89346a0a5655861cc726f4d61`. Do NOT merge PR #11 separately from its dependency chain.

**Implemented only on Draft:**
- Pure `src/features/Diary/diaryTimeline.ts` event projection preserving existing documents, linking later appended note entries and goal reflections to their own dates, with per-local-day grouping, stable tie-breaks and explicit undated group.
- In-memory search, type and date filters over existing current-UID Firestore snapshots. No external search provider, content logging, schema migration, backup manipulation or new Firestore write operations.
- Midnight Aurora journal filters; one mood icon with explicit intensity; session details collapsed by default; older save status/draft caveat kept.
- 11 synthetic pure timeline tests + 2 component integration tests = 13 new tests over the prior 34.

**Test evidence:** on functional HEAD `b247eb1762da9cede4e9f90d16cce6e296861858`, 47 Vitest tests across 10 files PASS, strict TypeScript PASS, Vite build PASS, locked Vite foundation PASS and isolated Chromium Auth/Firestore E2E PASS. Links: https://github.com/TheGor-365/reflect/actions/runs/42104694532 , https://github.com/TheGor-365/reflect/actions/runs/42104694519 , https://github.com/TheGor-365/reflect/actions/runs/42104694501 .
An E2E assertion was then narrowed to the persisted timeline card (rather than sometimes matching an in-flight textarea) on `9cb2e128373251ae4701672933d82d476eb90dfc`; **CI for this later commit must be checked separately**. Historical failed runs on earlier PR #11 SHAs are superseded only when current commit CI passes.

**Owner QA still pending:** local user process holding port 3100, 1440/390/320 dark/light screenshots, real keyboard/scroll. No claim that PR #10 UX or PR #11 diary visual design was approved. Do not kill a general Node process or touch Firebase emulators 9099/18081 and separate restored 18080.

**Release blockers unchanged:** account linking/recovery, protected sensitive drafts, export/delete, Firestore Rules and backup operations, isolated Vercel Preview/staging, server-side optional AI, secret rotation and reversible production release. No writes to production Firebase, no merge/main/Vercel release performed this continuation.

**Next 1–3 actions:** (1) confirm exact latest PR #11 CI status; (2) owner inspect local `ss -ltnp '( sport = :3100 )'` and send result before targeted process stop; (3) visually inspect PR #10 and #11 in local synthetic emulators at 390px and desktop, report actual screenshot before approving design.

## 10. Continuation checkpoint — Account Access / Profile UX (2026-11-06)

**New stacked Draft PR #12:** https://github.com/TheGor-365/reflect/pull/12
Branch `work/reflect-account-access-2026-11-06` based on PR #11 (`work/reflect-diary-timeline-2026-11-05`). All preceding PRs stay Draft; main/production untouched.

**Direct owner QA evidence 2026-11-06:** In Linux Mint, two separate emulators successfully started: isolated private restore Firestore 18080 (read-only environment), synthetic Authentication 9099 + Firestore 18081. Vite was serving 127.0.0.1:3100, but the local checkout was PR #10 (`7006fe5`) because `git fetch origin <branch>` downloaded `FETCH_HEAD` without creating a local tracking ref. The extra untracked `.tool-versions` belongs to the local workstation; do not delete or hard-reset it. User saw the white legacy onboarding modal, NOT the new PR #12 UI.

**Root cause:** The original product had browser-bound anonymous Auth and a separate profile form, not real registration/login. Firebase's browser Auth persistence remembers an anonymous UID within the same origin, but an Emulator restart without export/import resets its server-side users and documents. This is not production account recovery.

**Implemented in Draft PR #12:**
- Email/password account creation links to the current anonymous Firebase Auth user using `linkWithCredential`; guards exact UID and confirmed email so no new identity silently replaces existing Firestore ownership.
- Explicit sign-in to an existing email account is only allowed from a guest identity with zero loaded profile, sessions, goals, moods and diary notes. A guest with data must first link email; no automatic merge or orphaned anonymous data.
- Registered users have explicit sign-out; guest sign-out is blocked. New-account onboarding offers registration, login, or continue as guest. Sidebar includes an account entry.
- Midnight Aurora responsive dark/light panels for Account Access and Profile; name required, age/gender optional. Password is never written to browser storage, Firestore, logs or shared Docs.
- SDK-mocked regressions (account linking, duplicate email, wrong UID, partial link, protected switching, login/logout, modal behavior), and isolated Chromium E2E using *synthetic* identities and notes.
- User has not yet viewed or approved the new modal; real Firebase email verification, password reset, recovery, app-specific account deletion and rules hardening remain separate release gates.

**Integration evidence to date:** A strict isolated Chromium run at `77c7c455456ee1fe8540984c30789617a8d14ea6` verified guest save → email linked with same UID → first browser reload → second browser email sign-in restoring the same diary → distinct Beta UID isolation. Three CI workflows SUCCESS on that exact SHA. Subsequent cleanup added fail-closed linked-provider checks and stricter third-party request detection. Exact latest SHA and all current CI must be checked after this doc update. No claim of production-ready authentication.
A blocked external `https://www.google.com` image attempt occurred intermittently in CI, initiated by the app frame after Firebase auth linking. All external requests were blocked, and none transmitted journal content. The browser test is classifying the request safely without logging paths, query values or tokens; do not whitelist it blindly or claim network isolation acceptance if an unknown app-origin request is attempted.

**Next owner operations:**
1. Stop only the local Vite tab on 3100, leave Firebase emulators untouched. Explicitly fetch the remote tracking ref (ordinary one-branch `git fetch` previously left only `FETCH_HEAD`):
   `git fetch origin '+refs/heads/work/reflect-account-access-2026-11-06:refs/remotes/origin/work/reflect-account-access-2026-11-06'`
   then `git switch -c work/reflect-account-access-2026-11-06 --track origin/work/reflect-account-access-2026-11-06` from `~/reflect-chat-qa`; never delete `.tool-versions`.
2. Run Vite only with the dedicated demo `VITE_FIREBASE_CONFIG`, `VITE_APP_ID=reflect-8fdc8`, `VITE_USE_FIREBASE_EMULATORS=true`. Inspect both Midnight Aurora modals desktop/mobile and make a *synthetic* email QA account (no credentials shared in chat/GitHub).
3. Once PR #12 exact-head CI and owner QA pass: resume Stage 02C Goals (immutable nested steps, status, date handling, write feedback); do not deploy production. Create a separate staging Firebase project and email verification/recovery before any release.

**Hard limits:** No production Firebase Auth, real user data, provider settings, Vercel, main, billing or private encrypted backup modifications. Current QA emulator state is ephemeral unless explicitly exported and restored to a private local directory.

## 11. Continuation checkpoint — Stage 02C goals and onboarding fix (2026-11-06)

**Owner-reported bug, verified against screenshots:** after successfully registering with synthetic local Firebase Auth, the first-time Welcome AccountAccess remained as a linked-account card with neither close control nor an obvious continuation. The owner should NOT sign out just to escape this screen. The original registration flow omitted `onClose` on first-time onboarding and hid the close button when `welcome === true`. This was not a Firebase persistence failure.

**Fixed on stacked PR #12:** https://github.com/TheGor-365/reflect/pull/12, HEAD `91adb4aafc7712442fab0e3b177ac2c51da08d5c`.
- On successful same-UID `linkWithCredential`, App advances to the profile form immediately without awaiting another auth-state event.
- Linked account welcome has visible **Продолжить к профилю** and **Закрыть** controls.
- Added component/App regression tests and isolated Chromium E2E for first-time email registration → profile → saved profile → journal. All three workflows SUCCESS on `91adb4a`.
- Owner has NOT yet visually accepted this updated flow locally. The screenshot of linked account without close control predates this fix.

**Next stacked Draft PR #13:** https://github.com/TheGor-365/reflect/pull/13
Branch `work/reflect-goals-workspace-2026-11-06`, base PR #12 branch `work/reflect-account-access-2026-11-06`. **Functional QA HEAD before docs:** `36e75d1e1ddf40cc66766acdc8525b9894db480e`.
- Status board (in work / paused / completed) and real x/y subtask progress. No inferred mental-health metrics.
- New goal requires title only; description, deadline, checklist are optional. New deadline is stored as explicit date-only `dueDay` and legacy-compatible local-noon Firestore Timestamp. Existing legacy `dueDate`, `date`, `completed` and `sessionTitle` records render unchanged; sessionId stays linked. No bulk Firestore migration.
- Create, edit, delete goals and nested subtask add/edit/toggle/delete. Explicit delete confirmation; all changes limited to current UID. New goals use stable document IDs to avoid duplicates after ambiguous writes; subtask writes and field edits are transactional, immutable and check for stale concurrent edits. No optimistic false save success. UI shows pending/saved/error and retains failed form contents.
- Reflections in diary no longer silently mark goals complete; completion requires explicit user action.
- Responsive Midnight Aurora goal cards and typed synthetic tests.
- On functional HEAD `36e75d1`: **97/97 Vitest tests** across 16 files, strict TypeScript, Vite build, locked Vite CI and demo-only Chromium Auth/Firestore QA all PASS.
  - TypeScript / 97 tests / build: https://github.com/TheGor-365/reflect/actions/runs/42124654757
  - Locked Vite foundation: https://github.com/TheGor-365/reflect/actions/runs/42124654882
  - Demo-only Chromium: https://github.com/TheGor-365/reflect/actions/runs/42124654850
- Chromium verified login/linking, first-time onboarding, deadline-free goal creation, subtask completion, paused status and reload persistence, Beta's inability to see Alpha's goal, 390px mobile navigation and session composer. **No real production Firestore records were modified.**
- A third-party `www.google.com` image request intermittently occurs during synthetic Auth. QA aborts all such requests and flags a privacy/release warning; source/provenance remains unresolved. No whitelist or release waiver.
- Goal release QA still pending: owner screenshots at desktop 1440 / mobile 390 / 320 in both themes; manual edit/delete, concurrency UX and screen-reader focus. Date crossing time zones, recovery, verification/password reset, privacy export/delete and isolated staging not complete.
- Goal subtask reorder is optional and not implemented; no claim of Stage 02C fully signed off.

**Recommended next owner actions (without repeating setup):**
1. Leave local Firebase Emulator restore 18080 and QA 9099/18081 running. Stop only Vite on 3100 (`Ctrl+C` in its own terminal tab), NOT unrelated Node processes.
2. In existing `~/reflect-chat-qa` (local untracked `.tool-versions` must be preserved), explicitly fetch `+refs/heads/work/reflect-goals-workspace-2026-11-06:refs/remotes/origin/work/reflect-goals-workspace-2026-11-06`, then create a local tracking branch from that ref and verify exact HEAD. Never use plain `git fetch origin <branch>` then assume `origin/<branch>` exists: that failed before.
3. Restart Vite only with local `demo-reflect-auth-qa` `VITE_FIREBASE_CONFIG`, `VITE_APP_ID=reflect-8fdc8` and `VITE_USE_FIREBASE_EMULATORS=true`. Check linked-account modal can continue to profile, open Goals board, create a synthetic goal and save a subtask. Send desktop/mobile screenshots. No production or live-user acceptance implied.

**Release invariants:** all PRs remain Draft, main stays `b3a72c240bd193e89346a0a5655861cc726f4d61`, Vercel/Firebase production unchanged. PR #13 depends on #12→#11→#10…; never merge out of order. Email verification, account recovery, Firestore Rules hardening, export/delete, staging and third-party request privacy remain release blockers.

## 12. Continuation checkpoint — account recovery and session behavior (2026-11-06)

**Owner visual QA:** local `127.0.0.1:3100` renders Midnight Aurora and a connected email account ("Аккаунт и вход — Email подключён"). This is already a registered Auth user, so a fresh registration form is not shown during a signed-in session. The same screenshot shows a disabled send arrow and "ИИ-диалог временно недоступен", with "В дневник" as the deliberate local save-to-Firestore action, not an AI reply. `src/api/geminiService.js` explicitly sets `AI_SESSION_ENABLED=false`, returns an unavailable error and must not expose third-party AI credentials in client JS.

**New stacked Draft PR #14:** https://github.com/TheGor-365/reflect/pull/14
Branch `work/reflect-auth-recovery-2026-11-06`, base PR #13 `work/reflect-goals-workspace-2026-11-06`. No PR merge or deployment. Functional HEAD (before this documentation commit): `08371b680ea726faffb362b2e87ff3e80e8a6943`.

**Implemented:**
- Password reset using Firebase Auth SDK `sendPasswordResetEmail` from guest-login "Забыли пароль?" or linked account "Восстановить пароль", with generic success message, never disclosing whether the email is registered.
- Linked account "Отправить подтверждение email" and "Проверить подтверждение" using `sendEmailVerification` and `reload`; same-UID post-condition; visible verified/unverified status; no forced sign-out.
- Local-only testable boundaries for `confirmPasswordReset` and `applyActionCode`, without recording sensitive OOB codes or passwords in app storage/logs.
- Midnight Aurora layout reused, responsive. No Firestore migration, unverified email is NOT yet a reason to lose access to prior records.
- The dedicated Firebase Emulator does not deliver real email; verification and recovery links appear in Auth Emulator output/localhost OOB endpoint. A synthetic `example.test` email is NOT a recoverable production mailbox.

**CI evidence on functional HEAD `08371b6`:** 107/107 Vitest tests across 16 suites, strict TypeScript, Vite build, locked Vite foundation and isolated Chromium Auth/Firestore E2E all SUCCESS:
- https://github.com/TheGor-365/reflect/actions/runs/42128225588
- https://github.com/TheGor-365/reflect/actions/runs/42128225747
- https://github.com/TheGor-365/reflect/actions/runs/42128225700

Browser QA proved local synthetic password recovery -> new password -> re-login to exact same UID and original diary, plus email verification state without UID switch; also preceding onboarding, goals, isolation and mobile QA. The CI classifies or bypasses sending verification email if the synthetic account is already verified, so it does not prove real-world email delivery. All external requests were blocked. A sporadic blocked `www.google.com` image request persists during Auth; origin audit remains a mandatory privacy/release gate.

**Not implemented / not verified:** production email provider configuration and email templates, authenticated staging mail delivery and authorized domains, account recovery after losing both password and email, second-factor auth/recovery, durable private encrypted backup for user records, official data export/delete workflows, server-side AI sessions with explicit consent/quotas/log redaction. The local emulator remains ephemeral unless the owner explicitly exports data to a secure, private directory and imports on restart. No true long-term production account restoration can be claimed.

**Next owner 1–3 actions:**
1. Keep Auth/Firestore emulator tabs 9099/18081 and restore-only 18080 running, stop only local Vite (3100), preserve `~/reflect-chat-qa` and untracked `.tool-versions`.
2. Use explicit remote tracking ref fetch for `work/reflect-auth-recovery-2026-11-06`, switch existing checkout to it without recloning, verify exact commit, restart Vite with `demo-reflect-auth-qa` environment variables.
3. On local UI open "Аккаунт и вход" to inspect verification/recovery in demo mode. Do NOT log out of an emulator account with irreplaceable test records, do NOT share a real password or OOB link, and do NOT interpret `example.test` as deliverable mail. Send only screenshot of account UI and the result.

**Release invariants:** PR #14 depends on #13→#12→#11 and previous Draft PRs. No `main`, production Firebase, Vercel deployment, secrets, payment resources or private backups touched. Production release requires separate staging and privacy/security acceptance.
