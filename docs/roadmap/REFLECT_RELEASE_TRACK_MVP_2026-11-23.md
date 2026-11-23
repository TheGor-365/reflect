# Reflect 2.0 — ускоренный Release Track MVP, 23 ноября 2026

**Decision:** owner wants a usable production MVP now: meaningful AI replies, explicit session continuity, source-grounded goal/recommendation proposals, observable outcomes and Mindspace. Stop treating every long-horizon R10–R14 audit/UX enhancement as a prerequisite for a *limited* first release. Keep non-negotiable privacy, authorization, budget/idempotency, source provenance and rollback gates. **This document is a delivery plan, not authorization to deploy an unsafe build or a record of completed production deployment.**

## Source and current facts (verified 2026-11-23)

- [Full numbered roadmap](./REFLECT_MASTER_ROADMAP_TO_PRODUCTION_MVP.md), [latest status](./REFLECT_STATUS_LATEST.md), [tracker #136](https://github.com/TheGor-365/reflect/issues/136).
- Backend owner-local worktree `~/reflect-r10-railway-review` is **dirty detached** at `1c4c121e0e449f1a9360e4fb4588dcf58352e699`. Frontend owner-local `~/reflect-r9-2-workflow` is **dirty**, later R9.2/R10 implementation not necessarily in remote GitHub code. No `reset --hard`, `clean`, destructive copy or indiscriminate `git add -A`.
- B2.1 just accepted **9/9** exact-head + two SHA-256 gated tests: actual adapters with fake in-memory `db.doc`, exact owner-scoped path, absent owner metadata, foreign metadata deny, consent revoked during read, and third memory authorize check. Unit FAKE only, no Firestore/provider; no security-release signoff. Earlier B2.1 source proof checks valid.
- Railway connected workspace: **only** `reflect-ai-railway-staging` project discovered for Reflect; existing `reflect-ai-api` at staging (service `c7f089c0-af42-45d3-875d-5e5ccba68dc9`) **ONLINE**, last SUCCESS 2026-11-17 at exact backend SHA `1c4c121e...`, domain `reflect-ai-api-staging.up.railway.app`, no staged patch or recent health issue. Current runtime feature-flag *values* (including `REFLECT_AI_SESSION_MEMORY_REPLY_ENABLED`, outbound) not read; names alone are not effective values. This is **not** a verified production backend.
- There are many stacked **OPEN DRAFT** frontend PRs. Examples: [#125 progress](https://github.com/TheGor-365/reflect/pull/125) (source-based per-session 100-point heuristic, NOT objective outcome); [#126 goal draft](https://github.com/TheGor-365/reflect/pull/126) (only suggestion after eligible saved work, NOT automatic activation); [#129 Mindspace hover/dashboard](https://github.com/TheGor-365/reflect/pull/129); [#135 UX/Journey](https://github.com/TheGor-365/reflect/pull/135). Their isolated CI evidence is not current integrated runtime acceptance. [#134](https://github.com/TheGor-365/reflect/pull/134) documents R2 backward-compatible recovery backend staging.
- Historical owner screenshots verified single-turn Grok response and saved session (2026-11-10), and a previous Firebase Hosting R6 staging release was reported in [#130](https://github.com/TheGor-365/reflect/pull/130). **Current frontend live Hosting target/version, real end-to-end AI result, user-local PR content and actual combined build are not freshly verified.**
- Known blockers: C3C1 original-client Rules red; synthetic candidate 80/80 green **not deploy approved**; clean-evaluation unverified; PG-04 erasure/provider race late fake send and budget closeout mismatch from user actual C3C1 diagnostics; B2.3 retention unapproved; eight privacy gates unsigned; live one-use owner approval and real memoryReply provider path not integrated; staging-only Firebase project guards and deployed history flag unknown. Do not represent SHA-guarded tests as production.

## Product truth: what is meant by usable memory and automatic goals

| Feature | Minimum MVP user outcome | Data/consent boundary | Release state |
| --- | --- | --- | --- |
| AI replies | User writes in single composer, receives **real** model reply, can inspect source/question and save session | Exactly known single-turn provider payload; visible consent/provider disclosure, quota and no silent retry | Historical staged capability; fresh browser/usage smoke required |
| Sessions & return | Saved transcript reopens, title/chosen prompt/chronology and draft survive reload/login | Owner-scoped authenticated Firestore docs; no implicit provider memory use | Existing code candidates; integrated QA required |
| Corrected hypotheses/recommendations | Owner can accept/reject/correct and link a recommendation to actual session turn | AI output is suggestion, owner correction wins; never fabricate certainty | R9.2 UI/source candidates; acceptance required |
| Goals & results | Owner confirms suggestion, saves linked goal/steps, marks real actions and outcomes, sees auditable completion | No silent commitment, deadline or clinical score; exact source IDs | #126 proposed draft + existing Goals; integrated QA required |
| Source-grounded semantic map | Mindspace/Journey shows **real existing** nodes/edges, corrections and source link clicks; no invented relationships | Versioned deterministic links, suggested vs confirmed, owner isolation | Existing draft components; smoke + data provenance |
| Local memory from persisted records | App reopens saved topics/sessions and uses deterministic local projection/readback to show continuity **to the user** | No provider egress from other sessions; not marketed as cross-session AI recall | Source candidates, requires exact integration QA |
| AI recalling other sessions autonomously | Model receives bounded approved historical excerpts and correctly prioritizes owner corrections/outcomes | **Requires PG-01..08/erasure generation, owner approval, fenced atomic attempt/budget/lease, exact source revision, retention decision** | **BLOCKED; do not turn history flag on today by bypassing controls** |

**Honest product wording:** A limited production beta can ship with *persisted user-visible memory and real single-turn AI*, but must **not** claim autonomous source-verified cross-session AI memory or automatic acceptance of goals until code, consent and quality are genuinely verified. If owner insists these are launch-critical, production GO depends on closing the exact integration gates first; no guaranteed same-day full-memory release.

## New priorities and release lanes

### P0 — SAME-DAY bounded release candidate (scope first, not blanket deploy)

1. **P0-A source freeze / compatibility map (READ-ONLY first).** Identify current frontend/backend worktree HEAD, dirty/unknown file counts, safely distinguish staged/draft source from actual Firebase Hosting release. Inventory exact implementations for single composer, auth, one-turn reply, saved session, owner corrections, goals/steps, progress, Mindspace, persistent topics and privacy UI. Select ONE immutable frontend candidate and ONE approved backend SHA; don't merge unrelated draft PRs indiscriminately or overwrite dirty work.
2. **P0-B product slice integration.** Bring existing proven R9.2 UI and narrow selected R6–R9 components into an isolated release branch: real one-turn AI, save/reopen, edit correction, goal proposal/explicit confirm, step/outcome persistence, source-backed Journey/Mindspace display. Prefer original components and data schema, no full rewrite or fake progress. Make forbidden history egress default OFF. Gate any migrations separately.
3. **P0-C minimal high-value tests.** Run exact-source targeted build/typecheck + production-origin Auth/AppCheck + rules for the *actual UI collections*, owner A/B deny, permitted CRUD, one genuine approved bounded provider call, persistence/re-login and idempotent recovery/unknown billing, 390px browser and source click. Negative `principal` injection already source-mitigated; do not rerun dozens of unrelated synthetic tests. Every test has exact source SHA/target, expected evidence and go/no-go result.
4. **P0-D staged release and rollback drill.** Check active Firebase Hosting target/version and backup/restore data posture; preserve current R6 rollback. Deploy reviewed frontend **to staging only** first, matched against live staging backend project/Auth/AppCheck; capture owner end-to-end screenshots. A different production Firebase project requires independently configured and tested backend, OAuth/AppCheck, budget, privacy and origin; pointing prod UI at staging project is NOT acceptable. Production after acceptance only.
5. **P0-E controlled launch.** If all P0 gates pass, release to a limited, informed beta cohort with feature flags and monitoring; production smoke on real URL + release SHA + existing content readback + single bounded AI request + billing receipt. Freeze versions and document rollback. If not, ship only verified safe slice / staging demo, not a false production certificate.

**Hard GO/NO-GO for limited public beta:** trusted owner/Auth/AppCheck; source-scoped Rules and server Admin checks; save/reload/corrections/goals/graph without loss or cross-UID exposure; no unapproved provider history; replay/idempotency+cost cap; reviewable legal/privacy/data erasure scope; reproducible code/CI/build and rollback. Failed hard gate ⇒ do not expand audience or call production ready.

### P0.5 — Full AI-memory activation (parallel critical-path engineering)

Replace the broad exploratory audit loop with a *fixed acceptance list* for the exact provider-history boundary:
- Owner confirmation bound to selected session/source revision and digest, granted scope and expiry; no reuse across users/requests, not mere previewHash.
- Same Firestore transaction or rigorously fenced crash-recovery protocol for source head, grant, both erasure fences, owner generation, request attempt, budget ledger and dispatch lease. Source `contextConsent` and `hostedBudget` must preserve existing invariants, no accidental stage-to-synthetic bypass.
- Provider dispatch after begin, with cancellation and conservative `outcome_unknown` on crash; reply persistence + attempt/budget/lease closeout consistent; never blind retry a potentially charged request.
- Negative tests: revoke before read, during read, after last check, before send, during outstanding send; erasure pending blocks dispatch, old replica behavior, missing owner, stale digest, foreign source, modified hypothesis and session switch; production-safe retention and consent copy.
- Real isolated Admin Emulator + client Rules + signed browser Auth/AppCheck + one explicit cost-limited paid staging smoke before feature flag. PG-07 retention/legal/provider approval is a real prerequisite, not a decorative backlog item.

**Until accepted:** keep live history-provider flag OFF (verify actual runtime first; source default OFF is insufficient); single-turn AI is separate, if verified safe.

### P1 — immediately after safe limited launch (functional improvement)

- **R10.4:** bounded cross-session retrieval ranking by verified event/source/corrections; avoid giant text dumps and legacy misattribution.
- **R10.5:** versioned structured answer with facts, unknowns, hypothesis, proposed action, evidence links, replyToTurnId; failed parsing cannot silently corrupt saved meaning.
- **R11:** real progress: accepted step completion, owner reported outcomes, confirmed/denied hypotheses and evidence changes; no invented universal psychology index; revise #125 metric labeling.
- **R12:** topic identity across sessions, graph evidence edges and owner-confirmed connections, merge/split/undo with sources; rendering uses established Journey/Mindspace.
- **R9.2/R13:** UX refinements when blocking a path (mobile, keyboard, accessibility, error recovery). No unlimited redesign before first usable launch.

### P2 — commercial hardening, distinct from limited beta

- **R10.6:** budget transparency, unknown-billed recovery, reconciliation, actual costs, rate limits and operational alarms.
- **R10.7/R14:** fuller regression, backups/PITR restore, migrations, retention/erasure/export, incident response, disaster recovery, performance and logging (metadata only).
- **MVP.1–8 commercialization:** honest public feature listing, terms/privacy/AI limitations, identity and consumer-rights work, payment provider merchant eligibility and actual lawful settlement, refund policy, tier/cap economics, support and incident channel, invite beta to paid pilots only after a genuine end-to-end money flow.
- **R13/R12 extensions:** onboarding, accessible deep graph zoom, BodyMap and PWA/notifications only after proven core; never block first valuable workflow solely for polish.

## Functional acceptance script for owner (single realistic account + separate synthetic opponent)

1. Sign in as owner A; create session with a meaningful question. Obtain an actual AI response (verify model usage/receipt without exposing messages in logs), save; reload and verify transcript without re-sending.
2. Add a correction to AI hypothesis; decline one suggestion, accept another. A linked goal draft is **only a draft** until owner confirms; save two steps and complete one, record an observed outcome.
3. Open Journey/Mindspace; click a node and navigate to the exact source turn/goal. Verify graph does not imply rejected hypothesis is confirmed. Reopen after reload.
4. Sign in as account B on a separate clean browser; owner A's sessions/goals/graph must be invisible and forbidden direct reads/writes rejected by Rules/Admin. No cross-owner memory in model requests.
5. If P0.5 enabled separately: explicit consent→preview of exact historical excerpts→owner approve→read supported former session→provider answer respecting correction; revoke and verify new sends denied; source+budget closeout evidence.

**Classification:** each acceptance records `not executed / source checked / offline mock / client Rules Emulator / Admin Emulator / browser staging / production`, exact SHA, timestamp, masked artifacts and outcome. A green test on fake data cannot be reported as paid AI or production memory.

## Today's first operational checkpoint (1–3 steps only)

1. Owner runs **READ-ONLY** local release inventory on `~/reflect-r9-2-workflow` and `~/reflect-r10-railway-review`: local SHA, branch/detached, tracked/untracked counts, matching application file names; no full diffs, no env/keys/private data.
2. Assistant maps inventory to PR candidates #125/#126/#129/#135 and existing Railway R2, creates exact non-destructive release/rollback matrix; marks usable safe functions versus untrusted/incomplete. If filesystem shows missing modules or massive unrelated changes, **STOP** and isolate clean release worktrees, never publish dirty source blindly.
3. Owner verifies current Firebase Hosting release ID/target **in console** (no secrets), and on staging user A runs a real one-turn AI+save+goal+map smoke with screenshots. No production deploy until source/target and gates match.

**KPIs for first pilot:** 1) real successful AI request saved once and reloadable; 2) correction honored in source-backed view; 3) goal proposed but saved only on acceptance; 4) factual goal step/outcome reflected without synthetic scores; 5) source graph navigable; 6) owner B no access; 7) explicit model spend receipt/limit; 8) rollback version retained. For long-term AI-memory pilot add demonstrable corrected cross-session recall under valid consent and verified provider payload.

**Current decision:** `RELEASE_TRACK=P0_SOURCE_INVENTORY_PENDING`; `LIMITED_BETA_PRODUCTION=NOT_ACCEPTED`; `FULL_MEMORY_PROVIDER=BLOCKED`; `RAILWAY_STAGING=ONLINE_AT_1c4c121e`; `B2_1_TARGETED_MOCK=PASS_9_9`; `B2_3_RETENTION=UNAPPROVED`; `PG01_08=OPEN`. No active frontend/backend source commit, Railway change, Firebase Hosting/Rules deploy, xAI paid call or database mutation occurred in creation of this plan.

## 2026-11-23 — P0 local release baseline inventory received (owner terminal)

**Owner command:** read-only metadata inventory for both worktrees, completed `RELEASE_BASELINE_READY` / `NO_FILES_CHANGED`, Node.js `v22.23.4`. No tests, deploy or sync performed.

| Worktree | Exact HEAD | Git branch | Tracked modified | Untracked (not ignored) |
| --- | --- | --- | ---: | ---: |
| `~/reflect-r9-2-workflow` (product frontend) | `6f20f8b31f91729b569f1c4d8a0465e865385811` | `feat/reflect-r9-2-workflow-2026-11-18` | 52 | 62 |
| `~/reflect-r10-railway-review` (backend review) | `1c4c121e0e449f1a9360e4fb4588dcf58352e699` | DETACHED | 3 | 5060 |

- GitHub [Draft PR #135](https://github.com/TheGor-365/reflect/pull/135) currently has source HEAD `6f20f8b31f91729b569f1c4d8a0465e865385811`, matching the frontend's **committed** local HEAD. **The 52 changed and 62 untracked files are NOT included in that PR commit.** Worktree branch label is not the same as PR head name; the hash is the useful identity.
- Frontend inventory includes untracked candidate modules for topic Memory projection/audit, `automaticGoalDrafts.js`, `GoalSuggestions.jsx`, `src/api/sessionMemoryReplyService.js`, Goals, Journey/Mindspace, recommendations, and historical AI/model endpoints. Backend review inventory likewise shows product modules but an unusually large set of untracked paths; cannot infer that 5060 are useful R10 deliverables or safe to deploy. `git status --porcelain --untracked-files=all` counts include unignored files; **no destructive cleanup, bulk add, copy or automated merge**.
- **Immediate decision:** use frontend tree as potential P0 application assembly source; treat backend review tree as read-only reference, not a deploy source. Current railway backend staging still pinned to original `1c4c121e`; no production release evidence.
- **Next single step:** classify path-group counts and print a bounded, allowlisted inventory of **non-test runtime source changes** in frontend; classify 5060 backend untracked files by safe directory group without listing secrets, untracked contents or running modules. Then prepare a **separate clean candidate branch/worktree** from exact selected SHA while explicitly and selectively bringing only verified runtime modules from the dirty frontend. Runtime module wiring/build comes next, not another round of wide synthetic adapter tests.
- **Gate status:** `P0_BASELINE_INVENTORY=OWNER_CONFIRMED`; `FRONTEND_RUNTIME_DIFF=NOT_REVIEWED`; `R10_UNTRACKED_CLASSIFICATION=OPEN`; `RELEASE_CANDIDATE=NOT_BUILT`; `PROD=NOT_DEPLOYED`; `FULL_AI_HISTORY_EGRESS=BLOCKED`. No Firebase/Firestore/Rules, Railway, credentials or paid AI affected.

## 2026-11-23 — P0 runtime classification (owner terminal)

The owner ran the bounded classification command `REFLECT_P0_RUNTIME_SOURCE_CLASSIFICATION` against both HEAD-pinned local worktrees and returned `P0_CLASSIFICATION_READY`, `FILES_CHANGED=0`, `NETWORK_CALLS=0`. Actual local files were not read or executed by this metadata run.

**Frontend `~/reflect-r9-2-workflow`**, HEAD `6f20f8b31f91729b569f1c4d8a0465e865385811` unchanged: 52 tracked modified and 62 untracked. Untracked path groups: `src/features/Memory=19`, `server/memory=11`, `src/features/Archive=7`, `Goals=4`, `src/components=4`, `Recommendations=4`, `Diary=3`, `Sessions=3`, `tests=3`, `Mindspace=2`, `SessionSchema=1`, OTHER=1. Runtime candidate groups from both tracked/untracked: Sessions=10, Memory=9, components=5, server/memory=5, SessionSchema=4, Diary=4, Goals=3, src/security=3, Mindspace=3, Archive=3, Dashboard=2, Recommendations=2, App.jsx=1, index.css=1. Actual runtime file list includes modified `src/App.jsx`, `src/features/Sessions/SessionComposer.jsx`, `Sessions.jsx`, `Goals.jsx`, `GoalSuggestions.jsx`, `Mindspace.jsx`, `JourneyMap.jsx`, `Recommendations.jsx` plus new local Memory/Archive/QuickSwitcher modules. **These are candidates, not a verified working integrated release.**

**Backend `~/reflect-r10-railway-review`**, HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699` unchanged: 3 tracked modified, 5060 untracked. **4948 are `server/node_modules`**, i.e. local dependencies rather than product source. Remaining 112 untracked in `server/privacy=41`, `docs=34`, `server/ai=20`, `server/memory=7`, OTHER=4, `src/features/Memory=3`, `server/hosted=2`, `server/railway=1`. Approx. 4948/5060 (97.8%) are node_modules files. **No blanket deletion or Git add**; known backend R10 dirty overlay still not staging/production source.

**Next P0 action superseding the previously proposed extra broad classification:** Run **one guarded local frontend TypeScript + Vite production-build smoke** in `~/reflect-r9-2-workflow`, against actual current dirty runtime sources. The pinned GitHub `package.json` blob SHA `4983ad8621f5a0589842e7a5b6f09b44af8ed0db` has scripts `typecheck: tsc --noEmit --project tsconfig.json`, `build: vite build`, and Node `22.x` compatible with owner v22.23.4. Guard HEAD and package blob hash, ensure `node_modules/.bin/tsc` and `node_modules/.bin/vite` locally installed before running. Do **not** run dev server, firebase, source push or xAI; build writes only local generated artifacts (usually `dist`) and must not be described as deployed or integrated backend acceptance.

If build passes, next inspect the built front-end integration gaps / startup smoke on local loopback and preserve a source-only candidate in a separate worktree with **explicit file selection**; if build fails, fix only reported cause, preserving unknown untracked modules. Until browser/Auth/Rules/recovery acceptance, `P0_RELEASE_CANDIDATE=NOT_CERTIFIED`, `CROSS_SESSION_AI_HISTORY=BLOCKED`, `PROD=NOT_DEPLOYED`.
