# Reflect 2.0 — full execution roadmap from PG-04D2 to commercial Production MVP
Updated 2026-11-22 • **ACTIONABLE PLAN**, not evidence that R10 source has been committed or deployed.

**Source hierarchy:** user-confirmed Linux terminal > byte-exact uploaded local erasure files and current local source diff > pinned GitHub backend commit `1c4c121e0e449f1a9360e4fb4588dcf58352e699` > docs-only status/older checkpoints. Companion detailed master `docs/roadmap/REFLECT_MASTER_ROADMAP_TO_PRODUCTION_MVP.md`, latest status and issue #136. This document supersedes the master plan's stale "next step B2.1" line *only for execution order*, not its entire milestones.

## 0. Where we really are (as of user PG04D2 terminal)
- Frontend existing dirty `~/reflect-r9-2-workflow` (R9.2 feature branch), last historical 802/802 Vitest, 13/13 qa-state, typecheck/build. **Not current integrated R10 browser/staging acceptance**.
- Backend dirty detached `~/reflect-r10-railway-review` at `1c4c121e`, Node 22.23.4; `server/privacy/contextConsent.cjs` and `server/railway/index.cjs` modified; demo erasure modules untracked. No destructive checkout/reset/clean. Docs-only GitHub branch is not a code release.
- R10.0 evidence schema locally tested; R10.1 owner-scoped event ledger 47/47 Node + 10/10 Rules; R10.2 projection/checkpoint/rebuild 37/37, 49/49+12/12 Rules, 52/52 local; R10.3 export v2 and demo memory-only erasure/fence/residual audits have local tests and synthetic Emulator evidence. These are **component proofs**, not whole-account deletion, full provenance, or release.
- R10.3-C2C2-B1 owner orphan receipts/consent tombstones 45/45 local Node and synthetic Emulator smoke PASS. B2.2-A owner ledger index demo 19/19 + Emulator PASS; B0 reconciliation 35/35 PASS; B1a 17/17; B1b0 15/15; B1b1 19/19; B1b3 source shadow preview 22/22 (all LOCAL demonstration/test-only). Real `hostedBudget.cjs` owner-ledger ON/source integration **NOT APPROVED**; hashed ledger/backups retention unresolved.
- PG04A synthetic consent dual-fence 20/20 local; PG04B actual local `contextConsent.cjs` old+new 37/37; PG04C local real Firestore Emulator 6/6 and exact cleanup; PG04D0 OFF-history provider regression 8/8; PG04D1 synthetic dispatch-lease model 29/29. **None grants production historical-context egress**.
- **NEW user PG04D2**: hash-gated diagnostic patch LOCAL_APPLIED; eight guard/source SHA tests **8/8 PASS**, JS syntax+`git diff --check` clean. The guarded real Firestore run was NOT STARTED because `127.0.0.1:18081` was occupied and printed `STOP: порт 18081 занят`. **Emulator diagnostic 0/6 executed**, not 6 FAIL. The test is expected to report `GATE_BLOCKED` even if all six diagnostics pass because actual erasure/lease modules conflict. Never kill/attach to an unknown port owner.
- Byte-exact user source verified: current demo erasure `prepare()` writes private/public fences without D1 owner lease coordinator; `cancelPending()` deletes them without invalidating leases; D1 toy `requestErasure()` creates an incompatible private fence schema. Source-level redesign necessary; no live exploit claimed because provider history remains OFF.
- Auth/consent preview/current hostedHandler source still sends `null` context to adapter; no live history egress evidenced. Staging/production runtime release SHA and full QA **NOT CONFIRMED**.

## 1. Immediate critical path — Privacy/erasure PG04 (P0, blocking any history provider)
| ID | Concrete work / artifact | Current status | Acceptance gate |
| --- | --- | --- | --- |
| PG04D2-1 | Identify port 18081 owner with read-only `ss -H -ltnp '( sport = :18081 )'` and, if a PID is shown, process metadata. No forced kill or fallback to 19085 | BLOCKED: occupied | Owner identified and an explicitly safe isolated run window confirmed |
| PG04D2-2 | Run already-installed actual demo erasure writer + D1 lease **six diagnostics** on isolated Firestore Emulator `demo-reflect-auth-qa`, exact 18081 and fake in-process transport, hash-pinned user source, exact fixture cleanup | User 8/8 guard PASS; real diagnostic 0/6 | 6 diagnostic cases and cleanup confirmed; expected `GATE_BLOCKED`, never provider authorization |
| PG04D3-1 | Design one owned erasure intent/fence schema, monotonic generation, owner coordinator, real lease lifecycle and cancellation semantics (not two writers racing to create fences) | DESIGN DRAFT CREATED | Source-mapped reviewed state machine + explicit effective vs requested erasure contract |
| PG04D3-2 | Review-only source candidate against actual dirty `memoryErasure.r103c2b.cjs`, local provider/preview/Railway callsites; preserve existing nonceHash/challenge, Auth/AppCheck, grants, quota and billing idempotency | NOT_STARTED | Unambiguous diff, no stale/foreign lease resurrection; no unsafe erasure-cancel |
| PG04D3-3 | New unit and real Emulator forced race: admit/prepare, begin/prepare, cancel/stale generation, settle unknown, crash before/after fake network send, idempotency, owner isolation, exact fixture cleanup | NOT_STARTED | Local unit + actual Emulator PASS, no hidden false safety claim; full race ordering reported |
| PG04D4 | Server EGRESS enforcement: request-bound consent/source revisions/preview digest, provider dispatch lease, fail-closed erasure fence; fake transport and budget receipts, no real Grok during QA | NOT_STARTED | No unauthorized context; no new admission after erasure intent; unresolved in-flight blocks effective erasure. Do NOT claim outbound HTTP atomicity with Firestore |
| PG04D5 | Deployment safety: all old Railway workers/history paths fenced OFF, only one audited egress flow, feature flag default OFF, tested rollback/version compatibility | NOT_STARTED | Signed release design and smoke on specific SHA, explicit owner consent and approval; still subject to PG01–08 |
**Not negotiable:** Firestore transaction cannot make an external HTTP POST atomic. `dispatch-started` can commit before erasure request while its network send occurs afterward. Erasure REQUEST must not be reported as effective/completed until in-flight accounting and bounded actual deletion finish; provider copies and backups remain separate.

## 2. Parallel privacy/data trust track — R10.3-C2C2-B2/C and PG01–08 (P0)
- **B2.1 complete current-local private writer census**: actual `server/ai/aiTurnRecovery.cjs`, `hostedBudget.cjs`, `server/privacy/contextConsent.cjs`, `contextPreviewQuota.cjs`, `server/memory/*`, `server/railway/index.cjs`, `appCheckReplayGuard.cjs`, attestation, owner records. Tag reader/writer, path grain, owner-scoped/hashed/global, data class, quota, TTL vs physical purge, legacy unknowns, query/backups; distinguish direct Firestore and indirect helper writes. **Current: PARTIAL**. Deliverable: complete versioned inventory with concrete source lines and negative tests.
- **B2.2 hashed billing indexes**: synthetic A/B0/B1 tests already pass; review actual `hostedBudget.cjs` source and approved retention, then only explicit scoped branch design for owner-addressable sidecar index, with same-TX atomic identity/owner quota, historical unindexed truth `UNKNOWN` and shadow OFF parity. Never destroy hashed requestLedger or relax duplicate charge prevention. **Current: demo proof only; real writer ON blocked**.
- **B2.3 retention/erasure exceptions**: approve lawful purpose and retention for grant tombstones, requestLedger/ownerDays/globalDays, attempts, owner index, backups/PITR/snapshots, Railway logs, provider history and exports. Clarify exact data processor/provider contract and privacy disclosures; no invented TTL or global erase guarantee. **Current: UNAPPROVED**. Deliverable signed decision register + observable enforcement/exception tests.
- **B2.4/C final bounded owner coverage and lineage**: negative tests malformed legacy fences, missing parents/subcollection orphans, concurrent deleted source, foreign UID, quotas, retained receipt, explicit unsupported domains; owner residual manifest with partial-vs-complete labels. **Current: NOT ACCEPTED**.
- **PG01–PG08 complete privacy gate**: PG01 all client/Admin writer access; PG02 source authenticity/versioned immutable ledger+corrections; PG03 export and memory-only erasure limitations; PG04 request-time grant+egress lifecycle; PG05 legacy/partial fences and suppression gaps; PG06 Auth/AppCheck/Rules/replay/races; PG07 legal retention/backups/provider copies; PG08 independent reviewed safe server gate. **Gate remains OPEN until all mandatory areas accepted; no provider history ON**.

## 3. R9.2/R10.0–R10.3 integration closure (P1 after/parallel to privacy)
- **R9.2**: do not rebuild existing Sessions/SessionComposer/reviews/goals/diary/draft recovery. Run updated combined R9.2+R10 regression, browser 320/390/400px/desktop, keyboard/focus, offline/draft recovery and owner consent controls. Old 802/802 Vitest is baseline only. Remote source review and release provenance required; not released from current dirty local worktrees.
- **R10.0–R10.1**: verify source/evidence data contracts survive migrations and imported legacy data, owner switching, event-source rejections, correction/revision semantics. Immutable append never becomes assumed provider permission.
- **R10.2**: topic projection as cache not authority; cross-session topic identity, merge/split/undo, deterministic rebuild, legacy overwritten reviews and suppressed gaps; versioned checkpoint and consistency integration.
- **R10.3**: integrate trusted source inventory/resolver/export/attestation/erasure with independently proven authorizer and current backend after PG, verify known 3-memory-collection erasure vs retained originals and nested descendants, don't overstate 7-collection export. Full staging release remains gated.

## 4. R10.4 — consented long-term context orchestrator (P1, HARD DEPENDENCY: PG accepted)
1. Preserve ONE `SessionComposer`; Auth+consumed AppCheck, owner entitlement and request identity on server. Server chooses sources, never browser paths/provider.
2. Read source-ledger/version-head, owner approved grant, both erasure fences, trusted sourceRef and revision/correction checks; memorySuppressed gaps and revoked legacy deny.
3. Select relevant multi-session topic evidence with confirmed links and owner corrections > stale model hypotheses, confirmed decisions/outcomes > keyword similarity; show uncertainty.
4. Bounded token/byte counts and PII minimization; exact server preview+owner-acknowledged digest, durable one-request authority and guarded admission/lease. No giant transcript.
5. Deterministic context digest and receipt binding; stale source/consent/preview, deleted source, duplicate or timeout rejects or returns read-only status, no hidden new paid retry.
6. Plug safe context into server provider egress only after PG and safe lease lifecycle; initially **FAKE transport**, then a separately approved capped paid smoke. Specific synthetic cross-session regression: corrected/disconfirmed hypothesis must never reappear as fact.
7. Single-composer UI for source disclosure, revoke, edit, owner switching, errors, consent expiry, mobile. Acceptance: independent secure source + provider-fake E2E + browser staging, then approval for paid smoke.
**Current: NOT STARTED as real provider-history integration** (several source and preview components exist independently).

## 5. R10.5 — AI orchestration, versions and response contracts (P1)
- Partition trusted system policy, owner-verified source, untrusted historical text, AI hypothesis and new message; implement prompt injection tests and non-diagnosis safety.
- Versioned JSON reply and source citations; recover from malformed model output without inventing state or duplicating a turn.
- Preserve `replyToTurnId`/`clarificationId`, exactly-one composer and rescue drafts. Supported review→decision→action→observed result→followup, priority of correction/rejection; no silent default old-history prompts.
- Test history longer than current context window, conflicting evidence, source revocations, migrations, no paid transport before authorization.
- **Current: some interaction/receipt modules exist; integrated acceptance NOT DONE**.

## 6. R10.6 — billing, quotas and operational controls (P0 independent product gate)
- Review all hashed immutable requestLedger identities, ownerDays, globalDays, attempt receipts; a sidecar index cannot become deletion authority or double-charge route.
- Per-UID/global/day/month allowed request and USD/token budgets, server kill-switch, idempotent retries and `outcome_unknown` semantics, no blind replay after external provider timeout; measured billed usage + immutable receipt.
- Auth/AppCheck/replay/rate/CORS/body size, secret rotation, provider failure classification, metadata-only logging/alerts and observability with approved retention.
- Test provider timeout after send, crash after ledger reserve, crash after provider before response, two workers competing, quotas and duplicates; **fake transport** first, narrowly authorized paid smoke only later.
- Link B2.1/B2.2/B2.3 decisions to this acceptance. **Current: component proofs, not production end-to-end billing acceptance**.

## 7. R10.7 — full QA/release gates (P0 before prod)
- Reconcile dirty frontend/backend files with exact per-file review; create reviewed source branches/PR/CI only after user authorization; never blanket `git add -A`, `git clean`, `reset --hard` or commit node_modules.
- Run complete unit+typecheck+build+Rules+Admin Emulator+Firefox/Chromium/mobile browser + AI red-team + consent/erasure races + quota tests; track source-level coverage/known exceptions.
- Acceptance matrix 0 FAIL/1 PARTIAL/2 PASS/NT for source citations, correction compliance, owner privacy, behavioral utility, token cost, latency and reliability; synthetic multi-week/multi-session narratives.
- Staging **exact frontend SHA/backend SHA/config/secret provenance**, rollback drill, isolated release flags, smoke with fake transport, then explicitly scoped opt-in paid end-to-end.
- No promotion from green mock tests alone; production depends on signed security/privacy/legal/billing release decision.

## 8. R11 — explainable semantic progress (P2 / product value)
- Audit existing SessionWorkProgress, SessionReadinessPanel and goals; build evidence-supported progress based on reviewed hypotheses, real decisions, completed steps, outcomes and corrections, never vanity activity counts or unsupported psychological %.
- Deterministic negative/undo/replay/backfilled data tests; owner must see what caused progress movement and be able to correct it.
- KPI: user-understood, evidence-linked progress over repeated visits, not raw AI message count. Existing components **not** fully accepted.

## 9. R12 — knowledge graph / Mindspace (P2)
- Audit JourneyMap/SessionTable/mindspaceOperations before rework. Build source-backed graph of sessions → evidence → hypotheses → owner review → recommendations → decisions → goals/actions → outcomes.
- Stable topic IDs across returns; tentative vs owner-confirmed links; merge/split/revoke/undo, exact source drill-down and mobile performance. Never merge solely on a shared keyword.
- Owner/privacy isolation and archive/deletion impact verified; no direct provider-read from projections.
- **Current: partial assets exist; integrated R12 acceptance NOT DONE**.

## 10. R13 — product UX, deliberately ON HOLD (P2, needs owner scope)
- Reuse Diary timeline/Dashboard/SessionComposer, improve return flows and consent/disclosure, safe draft recovery and context changes only after agreeing visual scope; no unsolicited redesign.
- 320/390/400 mobile responsive, accessibility, focus/keyboard/reduced motion, empty/offline/loading/error states. Browser screenshot QA required. **Hold** pending user's design authorization.

## 11. R14 — reliability, security, data and cost (P0 release cross-cutting)
- E2E Auth→Firestore→Railway→fake/provider (only authorized)→receipt + source commit; owner-switch, Firestore Rules vs Admin, AppCheck/replay, migrations, CORS, injection, orphaned private data.
- Backup/restore/PITR and legal erasure residual scope with external provider/log exceptions; incident playbooks, logging without private content, worker restart, mixed-version deploy and rollback.
- Frontend bundle historical ~935–940KB minified JS: measure before optimization; route split/cache/reads and token budget, latency and spend per helpful session.
- Dependency audit of previously reported **8 moderate npm vulnerabilities** from server install: inspect actual `npm audit` details, classify reachable exposure, perform narrowly reviewed pin/update/test, **not** `npm audit fix --force`.
- Exit: independent security/privacy/performance/cost sign-offs, monitored staging operations, versioned rollback.

## 12. Commercial MVP — smallest paid, lawful, operated product
1. **Scope freeze:** user returns across sessions and receives evidence-linked corrected guidance; goal/decision follow-through and diary; Mindspace as useful support, not mandatory full R12 perfection before first MVP.
2. **Closed beta** only after privacy/legal authorization and staging gate; consented users, safe support process, explicit no medical/psychological diagnosis claims.
3. **Commercial/legal**: privacy notice and consent, terms, data retention/export/erasure and processor/vendor disclosures, jurisdiction and tax review.
4. **Payment route**: verify merchant eligibility, payment provider onboarding/KYC, settlement method and actual accessible funds, tax/invoicing/refund/cancellation; **do not equate signing up for a payment provider with payouts**. Pricing and token/margin cap, subscription entitlement and abuse handling.
5. **Reliability + metrics**: monitoring and alerting, receipts, budget guard, backups/restores/rollback, customer support; key KPIs meaningful 7/30d returns, correction compliance, action follow-through, useful sessions, conversion/churn, cost per helpful conversation and paid contribution margin.
6. **Production release**: reproducible SHAs, approvals, migration safety, shadow/off rollout, staged real paid request only by authorization, rollback tested, then controlled deploy and real transaction proof.
**Current production MVP: NOT ACCEPTED.**

## 13. Relative sequencing and owner decision gates
**P0 lane A (critical)**: PG04D2 diagnostic on free 18081 → PG04D3 coordinated protocol → PG04D4 controlled fake egress → PG01–08 + B2.1/B2.3 → source/Rules/Emulator/security approval. **No historical context ON before closure.**

**P0 lane B (parallel)**: B2.1 writer inventory + B2.3 retention/legal decisions → review B2.2 index and R10.6 billing receipts/unknown charges. Privacy and billing block monetization and erasure guarantees.

**P1 lane C (after privacy)**: R9.2 combined regression, R10.2 identity cleanup, R10.4 context orchestrator, R10.5 response/citation contracts.

**P1/P2 lane D (product differentiation)**: R11 explainable progress; R12 Mindspace; R13 UX only after design scope agreed. Build proof-driven MVP subset, avoid delaying user value for every R12/R13 optional enhancement.

**P0 lane E (release)**: R14 security/reliability + R10.7 CI/browsers/staging/rollback + legal/payment/pilot → production MVP. Never infer completed source staging from docs commits.

## 14. Next EXACT actions — at most three
1. **Read-only port diagnosis** on user's Linux:
```bash
cd ~/reflect-r10-railway-review
ss -H -ltnp '( sport = :18081 )'
```
Identify owner; don't kill process or attach diagnostic to it. If the port is busy, defer real PG04D2, continue independent PG04D3 design and B2.1/B2.3 review.
2. Once a *known safe free port 18081* and isolated process are confirmed, rerun already-installed `firebase emulators:exec` command from `docs/privacy/REFLECT_PG04D2_ACTUAL_WRITER_EMULATOR_DIAGNOSTIC_2026-11-22.md`; expected six **diagnostic** PASS, explicit **GATE_BLOCKED** (known incompatible erasure/lease integration), exact synthetic cleanup. No source re-patch or altered constructor guards.
3. Review new PG04D3 protocol draft `docs/privacy/REFLECT_PG04D3_COORDINATED_ERASURE_DISPATCH_STATE_MACHINE_DRAFT_2026-11-22.md` and provide exact local Railway/index context/authorizer callsite excerpts only when beginning source-specific implementation. No real provider or paid calls.

## 15. Completion checkpoint contract
For EVERY accepted milestone: `phase | precise local git worktree/HEAD & dirty paths | patch SHA256 | user command/log + unit count | Emulator project/localhost/port + cleanup | actual remote CODE commit SHA or LOCAL_ONLY | staging release SHA or NOT_DEPLOYED | privacy/provider/payment impact | blockers | next 1–3 actions`. Never merge `UNIT_PASS` with `EMULATOR_PASS`, `REMOTE_COMMITTED`, `STAGING_ACCEPTED` or `PROD_ACCEPTED`. GitHub docs branch is a tracking aid, not a source deployment.

## LIVE checkpoint 2026-11-22 — D3F real Firestore diagnostic accepted; D4 original writer source integration next
- **PG04D3F USER ACCEPTED DIAGNOSTIC**: added new-only patch on dirty local `1c4c121e`, 12/12 Node offline PASS, real separate localhost **19086** `reflect-pg04d3f-synthetic` Firestore Admin Emulator 6/6 PASS (concurrent admit/prepare, stale lease cancel, unknown quarantine, partial fence, late fake-only send), exact synthetic cleanup and child exit 0. **`GATE_BLOCKED` remains**: no original erasure writer import, no actual provider, external HTTP cannot join Firestore TX. Firestore Rules absent so no client Rules test.
- **PG04D2 original writer** 0/6 real diagnostic (port 18081 remains frontend R9.2 test service; do not kill/reuse). These are distinct gates.
- **NEW PG04D4 method-by-method real writer integration contract**: [review-only source change matrix](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/privacy/REFLECT_PG04D4_ACTUAL_ERASURE_WRITER_INTEGRATION_CHANGE_CONTRACT_2026-11-22.md) docs commit `0b192256904db438657573321e103d4cf9c77677`. Preserve original nonceHash/challenge, private+public fences, default-OFF DEMO guard; same TX with owner generation/lease admission and erasure intent; cancelPending invalidates old lease; unknown inFlight blocks confirm/step effective deletion; per-request source/grant preview and hostedBudget idempotency must be verified separately. No PG04D4 executable patch, real writer Emulator PASS, remote source push, staging deploy or provider-history enablement.
- Current critical next: inspect exact **current local** provider egress/hosted budget/consent integration callsites (read-only, redact secrets); then prepare PG04D4 review-only diff against a **copy** of uploaded writer and explicit test matrix. B2.1 writer census PARTIAL; B2.3 retention UNAPPROVED; PG01–08 privacy gate OPEN. Green D3F unit/Emulator results are NOT a commercial/release certificate.


## 2026-11-22 LIVE next phase: PG04D4A original writer REVIEW COPY candidate
- User source check: hostedHandler/Budget/XAI adapter unchanged at pinned backend HEAD; contextConsent and Railway index dirty. Handler reserves budget then invokes adapter with context NULL, then finishes; separate budget/lease transaction and error-recovery integration remains OPEN.
- Previous PG04D3F user 12/12 offline + 6/6 true isolated Firestore Admin Emulator diagnostics accepted with deliberate late FAKE-send gap and GATE_BLOCKED. PG04D2 original writer still 0/6 due frontend R9.2 port 18081 occupied.
- **PG04D4A** test-only **6-new-file** reviewed original-writer COPY patch `REFLECT_PG04D4A_ORIGINAL_WRITER_REVIEW_COPY_2026-11-22.patch` SHA256 `86166a6cb421a7f4fd8c98c019594abdcf62dce9a5fa436d39ab7b542bd5c80b`; original user erasure writer byte SHA `485757d8bd718bc31a1052e500994aa9314de46531fdb707000a1505ee088f81` untouched. Separate project `reflect-pg04d4a-synthetic`, localhost port 19087, combined copy+new owner-coordinator Firestore TX (prepare/fence/lease generations, cancel no resurrect, confirm/step unknown and inFlight denial), fake transport spy, random synthetic exact cleanup. Full unified diff original→copy shipped in delivery ZIP, not a patch against actual local source. **AUTHOR 12/12 offline mock PASS, clean fresh Git apply/syntax/diff/JSON/ZIP PASS; USER QA and six real Firestore Emulator scenarios NOT RUN.** Details [PG04D4A checkpoint](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/privacy/REFLECT_PG04D4A_REVIEW_COPY_INTEGRATION_CHECKPOINT_2026-11-22.md).
- Continue with user apply+12 unit, then safe free localhost 19087 real Emulator six diagnostics and explicit **GATE_BLOCKED**. This is not production Auth/AppCheck/Rules, shared consent/hostedBudget, HTTP egress, external provider copies, storage-retention approval or R10.4 enablement. B2.1/B2.3 and PG01–08 still OPEN, Railway/prod untouched.
