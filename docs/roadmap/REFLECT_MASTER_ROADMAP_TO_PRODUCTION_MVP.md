# REFLECT 2.0 — LIVE MASTER PROMPT / ROADMAP TO PRODUCTION MVP
Revision: 2026-11-21 PG-04A demo dual-fence candidate patch ready author 20/20, user QA pending; real staging consent fix not started.
IMPORTANT: THIS IS A PLAN + HISTORICAL STATUS, NOT PROOF THAT THE CURRENT LOCAL CODE IS IN GITHUB.
Companion: docs/roadmap/REFLECT_STATUS_LATEST.md on this documentation branch. Check the latest GitHub tracker issue and comments for newer checkpoints.

## 0. START PROMPT FOR EVERY NEW CHAT (MANDATORY)
Ты — продолжающий технический руководитель Reflect 2.0 (React/Vite, Firebase Auth/Firestore, Node.js/Railway/xAI). Разработка продолжается с существующего кода; НЕ начинай заново. Твоя задача — довести source-backed долговременную память, прогресс и граф смысловых связей до коммерческого production MVP, не нарушая приватность и платежную идемпотентность. Действия: 1–3 конкретных шага за итерацию, затем лог/скриншот результата, checkpoint.

ПЕРЕД любой работой обязательно:
1. Открой GitHub TheGor-365/reflect, найди самый свежий issue «REFLECT 2.0 / R10→MVP live tracker», прочитай body, последние комментарии и точные ссылки на SHA/branch. Открой данный MASTER и REFLECT_STATUS_LATEST.md; сравни дату, версию и существующие GitHub PR/ветки.
2. Верифицируй фактические файлы и свежие terminal logs пользователя в соответствующем LOCAL worktree, даже если remote GitHub/docs утверждает, что этап DONE. GitHub содержит только опубликованные commits; незакоммиченные overlay и домашний emulator не синхронизируются. Не подменяй локальный код GitHub-кодом.
3. Составь diff: какие подпункты уже реально пройдены, какие не опубликованы, где план устарел. Отмечай старые пункты SUPERSEDED, не повторяй патчи и не переписывай готовый функционал. Если код не доступен, попроси безопасный адресный вывод, не придумывай implementation.
4. Прежде чем писать/применять код, сформулируй: текущий этап/подэтап, точные файлы, ограничения, проверки и критерий PASS. Unit/Emulator/Browser/Staging/Production — отдельные уровни.
5. После каждого подэтапа обнови GitHub tracker issue/checkpoint и, когда уместно, STATUS/MASTER; укажи LOCAL_ONLY либо настоящий remote CODE SHA. Если GitHub-действие не состоялось, не утверждай обратного.

**CURRENT STOP 2026-11-21:** R10.3-C2C1 49/49 Node + Emulator PASS. R10.3-C2C2-A 30/30 Node + synthetic Emulator PASS. R10.3-C2C2-B1 patch locally applied and SHA-256 checked; 45/45 Node PASS, 0 failures, syntax/diff checks PASS. B1 real synthetic Emulator smoke PASSED in user terminal on 2026-11-21 (owner-scoped orphan receipt, consent tombstone, bounded post-cleanup). Next C2C2-B2 inventory of all *current local* private writers and hashed billing indexes; then Privacy Gate. No real user deletion, paid xAI calls, staging release or source push based on this documentation.

Local frontend: ~/reflect-r9-2-workflow, branch feat/reflect-r9-2-workflow-2026-11-18, dirty, base 6f20f8b31f91729b569f1c4d8a0465e865385811.
Local backend: ~/reflect-r10-railway-review, detached HEAD 1c4c121e0e449f1a9360e4fb4588dcf58352e699, dirty. Node 22.23.4.
Demo Firebase: project demo-reflect-auth-qa, Auth 127.0.0.1:9099, Firestore 127.0.0.1:18081, owner namespace artifacts/reflect-8fdc8/users/{uid}. Staging reflect-ai-staging is DIFFERENT.
Absolute prohibitions without explicit scope-specific authorization: git reset --hard, git clean, blanket restore/add -A, overwrite valuable dirty paths, real delete, secrets/env modification, production writes, paid Grok, provider enablement, deploy, merge; source commits/push only after inspected user approval. GitHub docs/issue publication does not authorize source deployment.

## 1. PRODUCT CONSTITUTION
- Reflect core: continuous reflection, evidence-linked sessions, hypotheses+owner reviews, recommendations+decisions, goals/steps, actual outcomes, diary, multi-session topics, Mindspace/Knowledge Graph.
- User statement != AI hypothesis; corrections and rejections dominate earlier model speculation. Do not silently resurrect refuted hypotheses. Never fabricate diagnosed states or numeric growth.
- One composer; reuse Sessions/SessionComposer, no new parallel chat input. Attach replyToTurnId/clarificationId where needed.
- Event ledger/sources authoritative when independently provenance-verified; memoryProjections are deterministic caches, not truth or authorization.
- Every long-term-memory use requires explicit appropriate consent verified server-side at each provider egress. Existing session-turns grant TTL 15 minutes is not broad permission for diary/goals/all topics.
- Privacy defaults fail closed for different UID, stale revision/consent, legacy fences, source gap and malformed state.
- Memory-only erasure != account-wide deletion != backups/PITR/provider copies. Do not claim fullDeletionCertified or providerUseAllowed on bounded audits.
- Data minimization; append-only evidence; no raw private content in logs or GitHub issues, no unbounded transcripts; idempotency and monetary cost control.

## 2. SOURCE OF TRUTH / STATUS CONTRACT
Priority is CONTEXTUAL:
A. LOCAL state = user's latest local terminal logs + inspected exact files in that same worktree.
B. REMOTE code state = GitHub branch/commit/PR SHA, not local logs or docs.
C. STAGING/PROD state = actual release SHA + runtime QA, not GitHub commit or patch.
D. This master/old checkpoints are evidence-labeled planning aids. A newer proven result supersedes older TODOs.
Record per subphase: exact ID, target & file paths, latest baseline SHA, code publication SHA if any, environment and command, dated result, known limitations, next task. Use statuses NOT_STARTED / DRAFT / PATCH_PREPARED / LOCAL_APPLIED / UNIT_PASS / EMULATOR_PASS / BROWSER_PASS / REMOTE_COMMITTED / STAGING_ACCEPTED / PROD_ACCEPTED / BLOCKED / SUPERSEDED. They are distinct axes, not a universal DONE.
After stage acceptance, update GitHub tracker with new evidence. If current tracker lacks that result, reconcile from fresh logs; do not revert because older remote document lacks it. This requires explicit updates at each phase; not automatic synchronization.

## 3. INFRASTRUCTURE AND BASELINES
GitHub repo TheGor-365/reflect, default main based on historical 2025 code at latest inspected commit b3a72c240bd193e89346a0a5655861cc726f4d61 (2026-11-21 check). This documentation branch is isolated from main and active Railway release; do not mistake docs commits for code deployments.
Frontend baseline R9.2 historical: 802/802 Vitest, 13/13 qa-state, typecheck + build PASS before latest R10 patches. NOT a new post-R10 full regression.
Backend pinned old code: server/ai/aiTurnRecovery.cjs records _reflectAiPrivate/reflect-8fdc8/attemptOwners/{uid}/sessions/{sessionId}/turns/{sourceTurnId}. server/ai/hostedBudget.cjs records hashed requestLedger and ownerDays; request ledger immutable and no TTL. server/privacy/contextConsent.cjs has 15-minute session-turns grant, contextGrants/{uid}/grants/{grantId}, contextConsentQuotas/{uid}. Dirty server/railway/index.cjs and server/memory/* may differ; audit CURRENT local sources before implementation.
Private emulator QA snapshots are external to erasure engine; no automatic backup wipe. No second emulator on occupied localhost ports.

## 4. DETAILED STAGES AND SUB-STAGES TO PRODUCTION MVP
Each label describing a PASS is LIMITED TO LOCAL QA unless a release SHA is separately cited.

### R9.1 — old deployed baseline, not current R10
R9.1.1 Historical hosted staging foundation — historical deploy; fresh runtime SHA/status pending.
R9.1.2 Release/rollback discovery and current staging health — PENDING.

### R9.2 — WORKFLOW foundation and release
R9.2.1 Sessions, reviews, recommendation decisions, goal/archive, drafts and recovery — EXISTING LOCAL; don't duplicate.
R9.2.2 Historical 802/802 + 13/13 + TS/build PASS — HISTORICAL, predates R10.
R9.2.3 New combined regression, 320/390/400 responsive, keyboard/focus, consent UI, browser acceptance — PENDING.
R9.2.4 Remote code review, build provenance and guarded staging release — PENDING.

### R10.0 — Evidence schema
R10.0.1 Existing source/evidence contracts, owner IDs, version/sourceRef and verification types — LOCAL TESTED.
R10.0.2 Preserve domain-only boundaries, no automatic provider access — ONGOING invariant.

### R10.1 — Owner-scoped immutable Event Ledger
R10.1.1 Atomic append/source versions, owner boundary, idempotency — 47/47 address PASS.
R10.1.2 Emulator Rules / cross-owner isolation — 10/10 PASS.
R10.1.3 Old overwritten reviews cannot magically be reconstructed — known LEGACY limitation.
R10.1.4 Verify goal/diary/user turn completeness in later trust gate — OPEN.

### R10.2 — Topic model, checkpoints and rebuild
R10.2-A Projection deterministic incremental — 37/37 PASS, CACHE ONLY.
R10.2-B Firestore checkpoint — 49/49 and 12/12 Rules smoke PASS.
R10.2-C Read-only lineage audit/rebuild — 52/52 PASS, NOT autonomous server repair.
R10.2-D Topic ID across sessions, merge/split/undo, source revisions, replay and divergent history — must inspect existing code and close actual gaps before R12.

### R10.3 — Inventory/attestation/export/erasure/residual trust
R10.3-A source inventory messages/goals/diary — 35/35 address PASS.
R10.3-B source resolver owner-scoped — 53/53 address PASS; no independent server source attestation yet.
R10.3-C0 server trust API contract — 17/17 PASS.
R10.3-C1A adapter — 37/37 Node PASS frontend worktree.
R10.3-C1B Railway pinned backend review overlay — 31/31 Node PASS, default OFF, not deployed.
R10.3-C2A seven-collection export v2 — 45/45 PASS; NOT entire account, memory v2 auto restore blocked.
R10.3-C2B demo memory erasure — 59/59 PASS; not account deletion.
R10.3-C2B2 paired private+public erasure fences, client Rules and server consent guards — 69/69 + Rules smoke PASS; Admin SDK can bypass client rules.
R10.3-C2B3-A actual synthetic Firebase Emulator erasure lifecycle — PASS.
R10.3-C2B3-B same-transaction source-only save with memorySuppressed: true — 46/46 frontend, 43/43 server, 26/26 real lifecycle PASS. Missing memory events remain gaps.
R10.3-C2C1 bounded owner residual scan — 49/49 + real Emulator PASS; not full deletion proof.
R10.3-C2C2-A.1 nested/orphan descendants scanner — 30/30 Node PASS.
R10.3-C2C2-A.2 synthetic emulator orphan/retained quota detection + bounded clean post-test — PASS.
R10.3-C2C2-A.3 scoped coverage manifest and output redaction — LOCAL; excludes backups/provider.
R10.3-C2C2-B1.1 read-only attemptOwners receipts/grants descendants and bound checking — LOCAL APPLIED, 45/45 Node PASS, SHA256 patch 3fc2977aefc16c0832c35d602efab0ab7d6386bf5227f6ac10be452a6ad260e8.
R10.3-C2C2-B1.2 legacy fence classification, retention unknowns, no auto repair — LOCAL DOC+TESTS PASS, legal policy not approved.
R10.3-C2C2-B1.3 real synthetic local Emulator smoke — **PASS** (user terminal 2026-11-21; orphan receipt and consent tombstone detected, post-cleanup scoped audit; hashed ledgers/backups excluded).
R10.3-C2C2-B2.1 exhaustive CURRENT server-private writers + paths + owner constraints inventory: aiTurnRecovery, hostedBudget, contextConsent, contextPreviewQuota, appCheckReplayGuard, local server/memory, dirty railway index and any new writers — **IN PROGRESS: pinned-source matrix draft committed to docs/roadmap/REFLECT_R10_3_C2C2_B2_1_WRITER_INVENTORY.md**; current dirty local writer inspection pending. B2.1 NOT ACCEPTED.
R10.3-C2C2-B2.2 owner-addressable index/reconciliation for hashed requestLedger/ownerDays; preserve billing idempotency and quota semantics; agree design and retention first — **DESIGN_DRAFT**; see `docs/roadmap/REFLECT_R10_3_C2C2_B2_2_OWNER_LEDGER_INDEX_DESIGN.md`. Historical entries remain unindexed-unknown. **B2.2-A additive DEMO prototype PATCH_PREPARED, new-file-only; assistant in-memory tests 19/19 PASS, clean git apply PASS; USER apply/QA/Emulator PENDING.** Patch SHA256 `83e5241c5138fd6888fb5fa4c59087badbfa535c7581440cd6d597a4a886e570`, downloadable in current ChatGPT turn, NOT in GitHub remote code. B2.2-B existing hostedBudget integration NOT STARTED and retention approval required.
R10.3-C2C2-B2.3 retained tombstones, immutable receipt ledger, backups/PITR/Railway logs/xAI provider retention mapping and policy — OPEN; never invent TTL.
R10.3-C2C2-B2.4 negative + race + foreign UID + missing parent + new synthetic Emulator tests — NOT STARTED.
R10.3-C2C2-C consolidated scoped coverage/manifest closure — proposed child gate, not a historical implementation; NOT STARTED.

R10.3-C2C2-B2.2-A (2026-11-21): **LOCAL UNIT_PASS 19/19 + REAL DEMO EMULATOR_PASS** for synthetic owner ledger and cleanup. Not a production hostedBudget index.
R10.3-C2C2-B2.2-B0 (2026-11-21): **PATCH_PREPARED** read-only synthetic receipt/billing/index reconciliation. Author isolated **16/16 B0** and **35/35 A+B0** unit PASS; clean patch apply and syntax PASS. User Linux apply/real demo Emulator **PENDING**. Patch SHA256 `71538330b88c56ac14b9a22be4b7b5434139a8e2cc938dff76244f911fc38365`, in current ChatGPT turn only. No real billing writer integration, provider call or deployment.
R10.3-C2C2-B2.2-B1 real `hostedBudget.cjs` integration: **NOT_STARTED**, review retention, source and billing idempotency first.
R10.3-C2C2-B2.1 exhaustive writer census: still PARTIAL; B2.3 retention UNAPPROVED; PG-04 staging erasure-fence gap persists.

### PG — PRIVACY GATE (MUST PASS BEFORE R10.4 MEMORY PROVIDER EGRESS)
PG-01 verify ALL client/Admin writer paths and authorization.
PG-02 independent server evidence provenance: UID, source revisions, immutable ledger head, sourceRef, corrections, suppressed gaps.
PG-03 owner-scoped export + memory-only erasure + account-deletion limits, nested descendants and retention exceptions; no whole account claim from 7 collections.
PG-04 explicit cross-session grants, preview, scopes, revocation, exact request-time server checks. **Confirmed 2026-11-21 B2.1 code gap:** pinned unmodified staging `server/privacy/contextConsent.cjs` has no `memoryErasureFences/{uid}` check inside grant `execute()` transaction or grant `check()`; demo consent guard is separate and not staging. Fix with atomic fail-closed fence reads and Emulator negative/race tests before memory provider egress. Existing session-turns TTL 15 min isn't enough.
PG-05 legacy private-only/public-only/mismatch/pending fence repair and deterministic consent-approved reconciliation of memorySuppressed with provenance (not model hallucination).
PG-06 Auth/AppCheck, Replay, Rules/Admin, owner-switch, race, limit, read errors, no private payload leakage.
PG-07 verified policy: legal owner/retention periods, Firestore backups/PITR, xAI data handling, QA snapshots and logs, cost.
PG-08 signed-off separate safe server gate; providerUseAllowed FALSE until granted/tested. PRIVACY GATE OPEN.

### R10.4 — LONG-TERM CONTEXT ORCHESTRATOR (only after PG)
R10.4.1 One composer request verified Auth/AppCheck/owner and proper per-request grants.
R10.4.2 Server query scoped trusted evidence/event heads, current revisions and valid projections, fence and suppressed-gap check.
R10.4.3 Topic candidate selection with confirmed Mindspace links ahead of weak keyword matches.
R10.4.4 Ranking: owner corrections/rejections, accepted decisions, observed outcomes higher than model hypotheses; uncertainty explicit.
R10.4.5 Strict bytes/tokens, citations/source references, PII minimization and exact provider preview.
R10.4.6 Incremental long-history retrieval, no giant transcript re-reads; reproducible context digest/version.
R10.4.7 Trusted request receipt/idempotency/cost check; unknown billed result requires read-only status before retry.
R10.4.8 Synthetic cross-session test: disconfirmed hypothesis in session A, return in B, corrected estimate C, AI answer D never repeats rejected claim as fact.
R10.4.9 Integrate in existing SessionComposer, not parallel editor.
R10.4.10 Paid provider live smoke only after explicit per-test scope/limit and owner approval. R10.4 NOT STARTED.

### R10.5 — AI ORCHESTRATION / CONTRACTS
R10.5.1 Separate trusted system policy, user-authenticated sources, untrusted historical text, model hypotheses and new user message.
R10.5.2 Strict versioned JSON response envelope and cited evidence; prompt-injection and provider parser safety.
R10.5.3 replyToTurnId/clarificationId through one composer; no lost draft, duplicate reply or turn.
R10.5.4 Explore→clarify→hypothesis review→decision→action→observed outcome→followup; user agency and minimal useful question.
R10.5.5 Versioned prompt/context builder/response schema in privacy-minimal receipts, controlled synthetic A/B regression.
R10.5.6 No diagnosis, unfounded certainty, hidden paid calls or schema fallback exposure. Audit existing interaction modes first.

### R10.6 — PAYMENTS/QUOTAS/RECEIPTS/OBSERVABILITY
R10.6.1 Inspect legacy immutable hashed requestLedger, hashed ownerDays and status receipts; protect idempotency before changes.
R10.6.2 Durable request IDs, billedUnknown/outcome_unknown handling, no blind retry, status/recovery first.
R10.6.3 Per-owner/project daily/monthly token and USD budgets; measured billed usage vs estimates.
R10.6.4 Auth/AppCheck/CORS/replay/rate/timeout egress limits.
R10.6.5 Metadata-only monitoring/alerts and retention, no sensitive texts.
R10.6.6 Verified failure modes: provider timeout, transaction crash, duplicate request, quota overflow, retry cost. Legacy partial code exists, not accepted end-to-end.

### R10.7 — QA AND RELEASE-GATE
R10.7.1 Source review/reconcile dirty frontend+backend on reviewed source branches; commits/PR/CI only with explicit authorized scope.
R10.7.2 Full unit, TypeScript, build, Rules, Admin Emulator, source provenance and migration regression.
R10.7.3 Synthetic multi-week dialogues: hypotheses corrected, similar-but-distinct topics, accepted/declined recommendations, negative outcomes.
R10.7.4 Ground truth rubric 0 FAIL /1 PARTIAL /2 PASS /NT for recall, corrections, unsupported claims, source precision, cost, latency.
R10.7.5 Desktop/mobile 320/390/400 browser acceptance, offline/recovery/error/consent UX.
R10.7.6 Staging exact frontend/backend SHAs, config, observed runtime, release gates and tested rollback; no production shortcut.
R10.7.7 Feature flags and signed off scoped rollout. NOT ACCEPTED.

### R11 — EXPLAINABLE SEMANTIC PROGRESS
R11.1 Audit existing SessionWorkProgress, SessionReadinessPanel, Goals feedback.
R11.2 Multi-factor clarity, known facts/unknowns, hypothesis verification, decisions, acted steps, observed results and changes across returns.
R11.3 Versioned source-backed explanation; don't equate activity to success or invent precise psychological percentages.
R11.4 Deterministic replay/review, duplicate events, negative outcome, archive/deleted source and concurrency tests.
R11.5 Owner review and corrections, product acceptance against real usefulness. NOT ACCEPTED.

### R12 — KNOWLEDGE GRAPH / MINDSPACE
R12.1 Audit existing JourneyMap/SessionTable/mindspaceOperations, don't rewrite.
R12.2 Provenance graph: user turn → AI answer → hypothesis → review → recommendation → decision → goal → step → observed result.
R12.3 Stable topic identities across sessions, suggested vs owner-confirmed edges, merge/split/revoke/undo.
R12.4 Exact source navigation and uncertainty; never merge merely by shared words.
R12.5 Scalable multi-zone Mindspace, filters/mobile, owner isolation and archive tests. NOT ACCEPTED.

### R13 — PRODUCT UX (ON HOLD until agreed)
R13.1 Audit current Diary timeline, Dashboard, SessionComposer and recovery components.
R13.2 Single composer, safe context consent/preview, links to evidence without intrusive parallel forms.
R13.3 Diary search/filter/history, visible goal/result and return experience.
R13.4 Responsive 320/390/400, accessibility, keyboard, focus, reduced motion, no R9.2 regression.
R13.5 Onboarding/empty/loading/offline/recovery states, browser QA. OWNER HAS PAUSED UX REDESIGN.

### R14 — RELIABILITY, SECURITY, DATA AND COST
R14.1 E2E Firebase Auth→Firestore→Railway→controlled fake provider/xAI only when authorized→Firestore.
R14.2 Threat model: owner switching, Rules/Admin SDK, AppCheck, CORS, replay, prompt injection, secrets, races.
R14.3 Durable writes, session/grant recovery and billing receipts without duplicated charge.
R14.4 Owner export, memory erasure vs account deletion, backups, PITR, external provider retention and supported exceptions.
R14.5 Measured bundle (~935–940 KB historical minified JS), route splitting, load/read/token budgets, long histories.
R14.6 Privacy-safe telemetry, incidents, rollback, release hashes, monitoring and cost limits.
R14.7 Independent security/privacy/perf/cost acceptance sign-offs. NOT ACCEPTED.

### MVP — COMMERCIAL PRODUCTION RELEASE
MVP.1 Freeze minimum value proposition: continuous evidence-backed returns/corrections, actionable outcomes, goals/diary/graph only as needed.
MVP.2 Informed closed beta with voluntary real users after privacy/test gating; no sensitive production data in dev logs.
MVP.3 KPI: qualified weekly/30-day meaningful returns, correction compliance, followthrough, evidenced progress, cost per helpful session, conversion/churn (not vanity chat counts).
MVP.4 Legal/privacy policy and TOS, AI scope/non-diagnosis, ownership and data removal, support/incident process, jurisdiction/vendor checks.
MVP.5 Verify lawful payment provider, merchant eligibility, actual settlement route, taxes/fees, refunds/cancellation/subscriptions; no assumption from card availability.
MVP.6 Sustainable pricing, usage caps, abuse limits, margins, billing and hosted cost metrics.
MVP.7 Release candidate: reproducible CI and versioned SHAs, secure secrets, staging E2E, rollback drill, backup/restore, production readiness review.
MVP.8 Controlled production deploy, smoke and operational acceptance, monitoring, real paid journey test, support + KPI follow-up. NO PRODUCTION MVP ACCEPTANCE YET.

## 5. CURRENT KNOWN FILES AND PROTECTED WORK
Frontend local Memory: topicEvidenceContract.js; memoryLedgerOperations.js; topicMemoryProjection.js; topicMemoryCheckpoint.js; topicMemoryAudit.r102c.js; topicMemoryAuditService.r102c.js; topicSourceInventory.r103a.js; topicSourceResolver.r103b.js; topicSourceResolverService.r103b.js. Existing source transactions in hypothesisReviews.js, recommendationDecisions.js, sessionReturn.js; source export in src/security/ownerDataExport.js and recovery; existing goals, diary, Mindspace, SessionComposer/ContextConsentPanel/ContextPreviewPanel. Read first, don't duplicate.
Backend local: dirty server/railway/index.cjs, untracked server/memory, server/privacy/memoryErasure.r103c2b.cjs, demoMemoryConsentAdmission.r103c2b2.cjs, memoryResidualAudit.r103c2c.cjs, memoryResidualCoverage.r103c2c2.cjs, memoryPrivateRetention.r103c2c2b.cjs, corresponding tests/smokes and docs/privacy manifests; server/node_modules untracked DO NOT COMMIT.
Previous R10.3-C2C2-A patch and test fix applied locally; B1 additive patch applied locally verified SHA. No claim these modules are in remote source commits.
Existing contextConsent.cjs server grant 15min only; live staging route may not have new fence guard. Do not mistake mock data for production authorization.

## 6. NEXT IMMEDIATE STEP (READ ONLY: B2.1 LOCAL PRIVATE WRITER CLASSIFICATION)
B1 synthetic Emulator QA already PASS. Do not re-run to satisfy outdated instructions.
Read docs/roadmap/REFLECT_R10_3_C2C2_B2_1_WRITER_INVENTORY.md on the docs branch; it is a pinned-source draft, NOT an audit of the dirty Linux worktree.
On local ~/reflect-r10-railway-review use read-only terminal commands to inspect relevant transaction writes and local source paths in server/memory, server/privacy/memoryErasure.r103c2b.cjs, server/privacy/demoMemoryConsentAdmission.r103c2b2.cjs, server/railway/index.cjs. No env files or secrets.
Classify current local writer/reader, UID-scoped/hashed/global, retention/TTL vs physical purge, security and billing idempotency requirements, missing owner-index, and erasure exclusions. B2.2 DESIGN draft is now available; review its invariants and negative-test plan, then create a DEMO-ONLY proof without modifying the existing billing writer. Update issue #136 and status after verified evidence. No owner-index production integration before review.
## 7. RETENTION/BACKUP/COMPLETENESS BLOCKERS
7-collection owner export v2 is not whole account; no automatic v2 Memory restore. Firestore doc deletion doesn't cascade subcollections. B1 scans known owner private paths but has bounded/unpaginated SDK enumeration (DEMO only); need paginated consistent approach for production.
Legacy fences (private-only, public-only, mismatch, paired pending) have no automatic repair; memorySuppressed user operations create provenance gaps. Admin SDK bypasses Rules. Hashed requestLedger and ownerDays are not owner-queryable by prefix, and retention TTL for immutable requestLedger is NOT established.
QA emulator snapshots, backup/PITR, Railway logs, xAI/provider copies, downloads and browser caches are separate retention domains. Need explicit retention authority/verification/exception; never claim physical global erasure, consent or complete receipt inventory from bounded test.

## 8. CHECKPOINT FORMAT AND MAINTENANCE RULE
For every numbered subphase: 
- ID + phase title; target / changed files / exact baseline/worktree; changed paths and actual remote code SHA or LOCAL_ONLY;
- unit/Emulator/browser/staging tests run (commands + counts/PASS or FAIL, date);
- threat/privacy/cost boundaries, exceptions and unverified claims;
- next one to three exact user actions and expected evidence;
- update live GitHub issue and STATUS after acceptance. Mark old plan items SUPERSEDED when current code proves already done. Do not publish secrets or raw private user data.
Historical archive REFLECT_2_MASTER_HANDOFF_R10_3C2C1_TO_NEXT_CHAT_2026-11-21(1).md is superseded for current starting phase (it instructed C2C2-A). The even older Nov20 master marks R10.3-A pending and is superseded. Retain history, never retroactively rewrite it.

R10.3-C2C2-B2.2-B0 — NEW LOCAL EVIDENCE (2026-11-21): user B0 patch installed; synthetic demo Emulator PASS including cleanup. First combined unit command omitted demo env, so `35 total / 20 PASS / 15 FAIL`, all 15 B0 `demo-reconciliation-environment-denied` in constructor. Assistant isolated env-correct B0 unit 16/16 PASS. User rerun with proper inline `GCLOUD_PROJECT` + `FIRESTORE_EMULATOR_HOST` still PENDING; do not call B0 full unit PASS yet. B2.2-B1 has design-only preflight in B2.2 owner-index design document; `hostedBudget.cjs` remains unchanged, no provider or deployment.

R10.3-C2C2-B2.2-B0: **LOCAL UNIT+EMULATOR ACCEPTED** (user 35/35 A+B0 PASS, B0 smoke PASS; earlier 15 missing-env errors superseded).
R10.3-C2C2-B2.2-B1a: **TEST_PATCH_PREPARED** (offline test-only, no real writer change), 17 author isolated unit PASS, fresh git apply/syntax PASS, user apply/unit PENDING. Patch SHA256 `f14a4931545a0a194ed7fc1e0e5e39a1a8966819b30699cd5bccce3381ad61ad`, ChatGPT download in original conversation not Github source. Adds `server/ai/hostedBudget.r103c2c2b1a.test.cjs` and one privacy doc. Direct user project test required before acceptance.
R10.3-C2C2-B2.2-B1b real billing writer integration: **NOT_STARTED**; default-OFF design and retention/privacy gates before modifying `hostedBudget.cjs`; no real provider or deployment.



## R10.3-C2C2-B2.2-B1a / B1b0 checkpoint (2026-11-21)
- B1a: **USER LOCAL_UNIT_PASS 17/17**, syntax and `git diff --check` clean, original `hostedBudget.cjs` unchanged, no Emulator needed.
- B1b0: **FIXTURE-ONLY TRANSACTION EXTENSION PATCH_PREPARED**; 3 additive new files, assistant isolated **15/15 PASS** and clean git apply/syntax, user apply/QA PENDING. Patch `REFLECT_R10_3C2C2_B2_2_B1B0_TX_INDEX_EXTENSION_2026-11-21.patch` SHA256 `ccbe32542950cc9d1872e1c49257489d29a730f4cfba4e542f4f5ffc7ca8d555`. No real `hostedBudget` modification, no real provider, no deploy.
- B1b1 production/staging writer integration = NOT_STARTED; B2.1 private writer census PARTIAL; B2.3 retention UNAPPROVED; PG-04 staging erasure fence BLOCKED. The owner-link prototype is NOT permission for provider history usage or deletion certification.


## Latest B2.2-B1b0/B1b1 checkpoint — 2026-11-21
- B1b0 fixture-side owner-index TX extension: **USER LOCAL UNIT 15/15 PASS**, syntax/diff PASS; no Emulator and no production writer integration.
- B1b1: **TEST-ONLY PATCH_PREPARED**, `REFLECT_R10_3C2C2_B2_2_B1B1_COMPATIBILITY_TESTS_2026-11-21.patch`, SHA256 `e3cc56981f0f0ae0aaca89aa49751e53622fb774732938e5590f0ded957b1169`; two additive files only. Author scratch mirrors 19/19 new and 51/51 combined PASS, clean apply and syntax, user exact-local test PENDING. No change to actual `hostedBudget.cjs` or paid/production services.
- Next after user B1b1 local 19 PASS: review explicit source-integrated default-OFF transaction extension and failing/rollback Emulators **without enabling** stage/prod. Full B2.1 writer audit, B2.3 ledger retention, PG-04 consent fence are blocking gates.


## R10.3-C2C2-B2.2-B1b1 ACCEPTED / B1b2 review (2026-11-21)
- **B1b1** user local new TEST-ONLY compatibility suite **19/19 PASS**, syntax/diff clean, no real hostedBudget modification; user-provided terminal at detached `1c4c121e`.
- **B1b2** [source-integration review DRAFT](REFLECT_R10_3_C2C2_B2_2_B1B2_HOSTED_BUDGET_INTEGRATION_REVIEW.md) committed docs-only (revision `64bb94ef47571667089a2f6c46078ccddcef7abe`). Proposed OFF-by-default trusted adapter calls prepare on SAME Firestore tx before all writes, then stage 1/2 owner link creates with original 3 legacy writes. Existing `hostedHandler` 2-arg createBudget call requires explicit source-wiring review; do not use fixture-only B1b0 module in live staging.
- **B1b3 real source patch NOT_STARTED**, no rollout or provider. Mixed-version unindexed gap, retention B2.3, PG-04 missing contextConsent erasure fence, B2.1 writer census still block ON.



## B2.2-B1b2 → B1b3 checkpoint (2026-11-21)
- Real user `git diff` for billing writer and handler EMPTY; scoped status shows only B1b0/B1b1 untracked synthetic files.
- B1b3 **SHADOW_PATCH_PREPARED** with 3 new non-imported files; author isolated **22/22 B1b3 + 73/73 aggregate** mock Node PASS, fresh git apply/syntax PASS. Patch `REFLECT_R10_3C2C2_B2_2_B1B3_SHADOW_SOURCE_PREVIEW_2026-11-21.patch` SHA256 `06dad36e5b10e68deafddb0cb511481b6689aad171e7177c43f23d46eab61475`, in this ChatGPT conversation only, not GitHub main/staging source. **User apply/QA PENDING**.
- B1b3 is a **non-imported standalone shadow** of hostedBudget with default-OFF index API and independent in-memory contract tests, not an applied modification of the existing writer; new source integration separately gated by B2.1 complete census, B2.3 retention decision, PG-04 fence fix, stage emulator race verification and rollout approval. No payments or provider calls.



## PG-04 / B2.3 source-grounded blockers — 2026-11-21
- **B1b3 user local shadow source pass:** 22/22 PASS, syntax + diff checks clean. Real `hostedBudget.cjs` unchanged, no staging or real billing integration.
- **PG-04 CODE GAP CONFIRMED**, fix not started: pinned `contextConsent.cjs` grant transaction / check / list ignore both owner erasure fences. [New PG-04 contract and negative/race cases](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/privacy/REFLECT_PG04_CONTEXT_CONSENT_ERASURE_FENCE_GAP_2026-11-21.md). Source/local fence shapes must be verified before any code patch.
- **B2.3 inventory/decision register DRAFT, NOT APPROVED:** [billing retention matrix](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/privacy/REFLECT_R10_3_C2C2_B2_3_BILLING_RETENTION_DECISION_REGISTER_2026-11-21.md). No fabricated TTL, ledger purge or complete deletion claim. Source owner-index remains default-OFF and not wired; PG-04 and retention/rollout B2.1 full census block ON.



## 2026-11-21 — PG-04A DEMO dual-fence candidate PATCH_PREPARED
- Grounded by user local fence source: private `memoryErasureFences/{uid}` and public `memoryControl/erasure`, `state:"erasure-fenced"`; original `contextConsent.cjs` diff empty and still lacks erasure-fence gate in grant/check/list.
- PG-04A **3-file DEMO-ONLY ADDITIVE PATCH_PREPARED**, SHA256 `5d406acb32e90f2378596e194388ee2280e3a5c93f5d1ead28c1f9b99ccb2d65`, author Node 22.16.0 **20/20 unit PASS**, clean git apply/syntax; user local apply/test **PENDING**. Adds synthetic `demoConsentFencePg04a.cjs`, 20 tests, privacy documentation. No deployed source changes or real provider/Firestore Emulator confirmation. Mock serial transaction is NOT a real Firestore race proof.
- Next on user Linux: SHA-check/add new files, `node --test server/privacy/demoConsentFencePg04a.test.cjs` expected 20 PASS, syntax and diff check. After user confirmation, pursue *actual staging writer* source-level transactional fence patch and real Emulator conflicts, strict host/provider boundary. Retention B2.3 remains unapproved, index ON blocked.

