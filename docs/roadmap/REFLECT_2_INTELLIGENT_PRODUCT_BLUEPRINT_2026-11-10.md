# Reflect 2.0 — интеллектуальный дневник, путь сеансов, Mindspace и BodyMap
**Product & Engineering Blueprint | 2026-11-10 | Draft design / NO code rollout**

**Status:** proposed implementation roadmap. NOT deployed, NOT a change in Firebase production, Rules, schema or xAI billing. Read along with docs/roadmap/REFLECT_2_PRODUCTION_MASTER_PLAN_2026-11-09.md and the 2026-11-10 xAI staging checkpoint. This blueprint extends the existing roadmap; it does not overwrite completed work or nullify its security gates.

## 0. Provenance, verified status and baseline

1. Owner-provided staging screenshots on 2026-11-10: first real Grok response displayed; owner explicitly saved a session; its record appears in Sessions history, journal feed and Session Schema. They also visually confirm unreadable text in journal/session schema and missing advanced product workflows. **An independent full reload + re-login and xAI Usage receipt were not demonstrated in these screenshots.**
2. Current source inspected from stacked Draft PR #37 (TheGor-365/reflect; branch work/reflect-stage05a-product-readiness-2026-11-09; inspected head 77c131e): React 18, Vite, Tailwind/legacy utility styles, TypeScript incrementally, Firebase Auth/Firestore; protected Railway Node server AI adapter; Grok 4.3. This is NOT a Vue + Rails app.
3. Google Drive / Reflect idea: historical master handoff (2026-11-05 archive), master continuation (2026-11-07), and 2025 visionary concept «Главный Профиль». The last describes journals, recurring themes, reflective exercises, history of growth and possible subscriptions/experts as ideas, not working product functionality. Do NOT explore or publish REFLECT_PRIVATE_BACKUPS.
4. Current Diary.jsx uses read-only buildDiaryTimeline/groupDiaryTimeline projections and already supports note/mood/goal/session filtering, scoped search and mood view. But diaryGroups rendering hides the group titles even though data has day labels.
5. DiaryNarrativeCard.jsx uses legacy text-stone-800, bg-blue-50, bg-stone-50 etc for session detail and goal/mood. They clash with dark Midnight Aurora tokens; note cards already use themed styles. SessionSchema.jsx/SessionTable.jsx are still white/stone table components.
6. Sessions.jsx currently passes only the typed message to getAnalysisFromAI and saves chatHistory as an array in an owner-scoped Firestore session. It can open a stored session and append messages, but has no visit/resume semantics, persistent AI title or structured insight extraction. The server enforces one-message consent and cost/security gates; never silently enlarge third-party context.
7. Current valid Firebase data paths are artifacts/{appId}/users/{uid}/{sessions|diaryNotes|goals|moods|profiles}. Preserve old records/IDs, note edit histories, session messages, ownership and export. Do not “migrate” merely to match this plan.

## 1. Product north star and non-negotiable principles

**Promise:** “I write one meaningful thing; Reflect helps me understand it, connects it to my life history when allowed, preserves the distinction between my words and the AI’s interpretation, and makes follow-through easy.”

**Primary loop:** record → Reflect answer → optionally extract structured candidates → journal timeline / goal / BodyMap / Mindspace → later deliberate follow-up → observable change and source-linked review.

- The journal remains a standard editable personal journal. No AI prerequisite.
- Never represent inferred moods, diagnoses, resolutions, self-improvement percentages or fabricated quotes as user-authored facts.
- Each event has an explicit provenance: user, assistant, deterministic app/system, external expert (future). Proposed AI interpretations are visibly hypothetical and may be corrected, hidden or rejected.
- The user controls scope and retention: default provider disclosure covers only the current submitted message. Reading older session turns, other journal items or body sensations for an AI request is a **separate opt-in scope**, not implicit access.
- Short user input need not create a flood of cards: aggregate derived observations; persist only appropriate, distinct items with origin links.
- Model response is not a clinical diagnosis, psychotherapy or a medical conclusion. Bodily discomfort is self-report; symptom advice should not mask urgent care.
- Theme remains Midnight Aurora. Accessibility, reduced-motion, low cognitive load and data preservation outrank novelty.
- Release in small stacked Draft PRs, fixture/emulator QA, exact CI checks, owner staging screenshots; no automatic production deploy.

## 2. Information architecture (incremental, not a rewrite)

Main nav now: Diary, Sessions, Goals, Session Schema. Retain these and extend:
- **Diary / Timeline** = unified chronological source-linked experiences, with separate icons: authored thought, mood check-in, AI reflection, goal/action, session/continuation, body check-in.
- **Sessions** = conversation workspace with history drawer, titles, saved vs draft, return count, per-visit results.
- **Goals / Actions** = user-confirmed goals, steps, recurring tasks, gentle follow-up.
- **Journey Map** (evolves current Session Schema) = visual A→B journey across visits, turning points, dates, length, decisions, open questions, links to actual source data.
- **Explore** (new, progressive) = Mindspace, BodyMap, metrics; initially under one modular section.
- **Growth Dashboard** (later) = source-linked overview of observations, patterns, accepted insights and progress; never synthetic “soul score”.
- **Account/Privacy** = consent scopes, export/delete, notification controls, language preferences.

On small screens, keep existing mobile nav strategy and use page-level segmented views, not another permanent second navbar.

## 3. UX-01 — immediate visual debt / no schema change (P0)

### 3.1 Chat layout
- On desktop the available conversation width should be genuinely used. User message sits against the right side of the conversational lane; assistant sits against the left; avoid centrally stacked bubbles. Use explicit flex alignment plus a responsive bounded max bubble width, not asymmetric hard margins.
- Large assistant answers may occupy more width than short user questions. Keep a comfortable reading measure, 15–17px text with natural line height and paragraph breaks; no forced gigantic line lengths.
- Long content scrolls within chat without covering the composer; preserve draft, keyboard focus, speech controls and mobile 320–430px behavior.
- One semantic heading for the session is shown above the transcript. Initially derive a safe deterministic title from the first user prompt; optionally replace via an approved, privacy-scoped AI title after generation. Never falsely imply an AI title exists if it has not been generated.

### 3.2 Journal card hierarchy and iconography
- Restore dark/light contrast: replace legacy bg-blue-50/bg-stone-50/text-stone-* in session, goal, mood and nested details with component-scoped --reflect-* tokens. Do not globally override all Tailwind classes.
- For an AI-derived journal event: first show title + **Reflect’s own thought** in readable prose, not a collapsed answer; below show a small “Вопрос пользователя” reveal control, with source link and muted timestamp in footer.
- A plain authored diary note remains the actual user text, with edit/version/append controls preserved. AI never silently rewrites it.
- Source icons, with accessible labels and non-color-only differentiation: PenLine (user thought), Sparkles/Brain (assistant interpretation), Smile/HeartPulse (explicit mood), Target (goal), MessageSquare (session), RotateCcw (return), Activity (body check-in).
- Footer on all cards: one subtle regular-weight date/time, separated spatially from the content. Controls are accessible icon buttons with tooltips/labels and adequate hit areas.
- Group events by the already-computed local date; draw a slim vertical connector rail at the LEFT with day/month labels and event markers. Include year at month/year boundaries. Do not repeat full dates as bold titles inside every card. Preserve undated/pending events and Armenian local-day correctness.
- In a resumed session, diary shows one rooted session record and **new continuation summaries only**, not repeated transcript copies. Each continuation links to its ancestor and current visit; toggled “Show changes since last entry”.

### 3.3 Motion foundation
- Create one shared design-token layer for durations/easings (suggested fast ~120–160ms, standard ~200–240ms, panel ~260–320ms, subject to visual QA).
- Shared AnimatedDisclosure/AnimatedPanel patterns for filters, mood overview, details, history drawer, menu and future pages. Animate opacity/transform/height only where appropriate; prefer CSS grid track/transition or measured height. Do not animate display:none, all CSS properties or entire application trees.
- Always honor prefers-reduced-motion and keyboard navigation; keep focus visible/managed; do not create invisible focusable children while collapsed. Avoid animated scrolling for users requesting reduced motion.
- Acceptance: no sudden panel flashes, no scroll-jumps, no overlay clipping, no focus loss; existing textarea/save semantics unchanged.

### 3.4 Journey Map UI replacement
- Do not repaint the old table. Replace it with a session overview and accessible chronological graph.
- Overview: meaningful title, first/last visit dates, count of visits and explicit returns, elapsed span, message count, accepted actions, current state, concluding thought if present.
- Visual A→B flow: starting question → assistant reflection → user clarification → significant insights/decisions → actionable step → return visit → current open question. Every node links to the real turn/goal/journal event. Empty milestones are omitted, not fabricated.
- Primary view: grouped vertical journey track on mobile and desktop; optional expandable horizontal graph later. Provide text/list accessibility fallback. Hover is never the only access path.
- Defensive time parsing: Firestore timestamps, missing times, mixed legacy shapes, deterministic ordering and tie breakers. No unchecked timestamp.toMillis().
- Large histories: grouped session list, search and filters by date/tag/status, lazy-loaded nodes, explicit “no summary yet” when needed.

## 4. SES-01 — persisted session identity and returns (P1)

Separate:
1. **Session**: stable thread ID, owner UID, current title, status, createdAt, updatedAt, lastActiveAt, lastSummaryId.
2. **Visit**: one meaningful episode of reopening/continuing this session; visitId, explicit startedAt, closedAt, reason (“created” / “resumed”), sequence number and checkpoint.
3. **Turn**: ordered user/assistant message, messageId, requestId for paid call, authoredAt, status, provider model provenance, visitId.
4. **Summary/Insight**: derived, versioned artifact with sourceTurnIds, generatedAt, review state and privacy scope.
5. **Journal projection**: one event per accepted original/continuation insight, keyed to sessionId+visitId+summary revision.

Rules:
- First visit has visitIndex=1 and resumeCount=0. **Resume** via explicit user action creates a new visit and increments resumeCount exactly once. Refresh, tab switch, incidental re-render or repeated network delivery do not increment it. A configurable inactivity boundary can refine the rule later, but do not infer phantom visits from timestamp gaps.
- Existing saved session can be continued without creating a duplicate root. Every successful explicit Save persists only newly added turns and an updated session checkpoint, not old transcript copies.
- Journal “Save/Update reflection” on visit 2/3+ writes an idempotent **continuation delta** referencing ancestor, with a link to the full journey. The old entry is not duplicated.
- User chooses whether to add a new reflection to the diary. A separate opt-in intelligence setting may permit automatic assistant-authored reflections, but never automatic edits to the user's words.
- Current chatHistory array remains readable and exportable; add a read-model adapter. After verified compatibility, introduce per-visit/turn subcollections for growth and Firestore document size limits. Migration: shadow-read, backfill with dry-run and checksums, cutover, rollback; never destroy original arrays silently.
- Stable sort keys and idempotency IDs guard retries and two-device conflicts; Firestore transaction or revision check protects resumeCount and checkpoint changes.
- UI: History icon in the Sessions bar opens a searchable responsive drawer with auto titles, dates, returns, most recent summary and Continue. Preserve existing sidebar links for compatibility.

**Acceptance:** one original + two later continuations = one root session, three visits, resumeCount=2; no duplicate user turns, no duplicate diary cards, exact links; survives full reload/second device, and old sessions still render.

## 5. AI-01 — richer replies and bounded intelligence (P1/P2)

### 5.1 Output contract and response style
- Introduce answer modes: “Кратко”, “Разобрать”, “Наметить действие” and an explicit tone preference. Use Russian first. Reflections may include: direct observation, alternative interpretation, one clarifying question, optional small next step. Do not force the same template on every message.
- Increase output budget only through measured token/cost policy and owner-governed product settings; current 512-token cap yields short replies. Keep existing paid limits and one-shot idempotency; not every user input merits a long text.
- AI “thought for journal” is a distinct generated artifact from the raw model reply and from original user words, with author=assistant, prompt/model versions and source reference. Never quote the user inaccurately.

### 5.2 One request → useful event candidates
On a consented prompt, use one bounded server pipeline:
1. Auth + App Check + entitlement + spend reservation + scoped consent (existing gates).
2. Prompt router: topic/mode/safety/risk and explicit context scope; preserve only the current message by default.
3. Grok generation: user-facing reflection, optionally a validated bounded structured payload (title, topics, optional candidate insight, optional candidate action, confidence/uncertainty, source turn IDs). Exact provider structured-output compatibility requires verification against the live API before implementation.
4. Validator: JSON/schema/size/wording checks; no executing model-generated instructions or tools; no inferred medical claims, sensitive person attributes, invented user admissions or fake scores.
5. Deterministic event planner: produce at most a few relevant candidates with explicit type, provenance, dedupe key and review state.
6. Persist AI-authored observations ONLY under user-approved retention/automation scope. Suggested goals, memories, scheduled reminders and personal mood records require user review/confirmation. Separate ephemeral suggestions from accepted records.
7. Render actions in UI: “Сохранить мысль Reflect”, “Добавить цель”, “Отметить состояние”, “Связать с темой”, “Оставить вопрос на потом”. Everything links back to the source.
8. Idempotent event/outbox processing, status failed/pending/confirmed; no automatic repeated paid call after ambiguous timeout.

Illustrative event types:
- user.note (authored)
- user.mood_checkin (authored rating)
- ai.reflection (identified as AI-authored)
- ai.insight_candidate (unverified hypothesis)
- goal.suggestion / goal.accepted / goal.completed
- body.sensation_checkin (only explicit user-reported zone)
- session.started / session.resumed / session.checkpoint
- reminder.suggested / reminder.scheduled / reminder.delivered

### 5.3 Contextual continuity
- Current one-message-only server contract remains the default.
- Explicitly approved scopes can add: turns of **this session only**, optionally selected journal items, optionally extracted summaries across past sessions. Historical context never means unrestricted scanning; show what will be shared before provider call.
- Prefer validated minimal structured summaries and source IDs; include original excerpts only when separately consented and within budget.
- Build a user-accessible “AI memory” ledger: what Reflect derived, original source, last update, user edit/hide/delete. Never treat model inference as permanent fact without confirmation.
- Privacy revoke, export and delete need to purge derived context and queued jobs, not only UI badges.

### 5.4 Algorithms, not magic dashboards
- Deterministic date bucketing with user-selected time zone; dedupe events by source key, session visit and result version.
- Goal progress = accepted completed steps / eligible total steps; mood chart = only manually entered scores; no score for missing days.
- Topic recurrence = explicitly tagged or source-backed topic count over a documented window. Show denominator, gaps and uncertainty. Similarity may suggest a link, never silently assert a diagnosis or pattern.
- Milestones = user-confirmed decision or bounded sourced statement, not arbitrary AI-generated “breakthrough”.
- AI evaluations on synthetic fixtures: groundedness, non-diagnosis, refusal on dangerous requests, style, over-inference, prompt injection, false event generation, token/cost efficiency. Human QA before prompts go live.

## 6. DATA-01 — durable event model and source links

Keep present Firestore owner-scoped collections as canonical until proven safe to extend. Proposed **new** optional structures:
- sessions/{sessionId}/visits/{visitId}
- sessions/{sessionId}/turns/{turnId} (future after legacy compatibility)
- journalDerived/{eventId}: sourceKind, sourceId, sessionId, visitId, sourceTurnIds, authorType, eventType, title, body, createdAt, generatedAt, reviewState, model/promptVersion, evidenceRef, dedupeKey
- insights/{insightId}: hypothesis + confidence label, source references, userDecision
- bodyCheckins/{id}: bodyZoneId, sensationKind, intensity, time, optional note, authoredByUser=true
- mindNodes/{id}, mindEdges/{id}: typed nodes/relations with provenance
- tasks/{id}, reminders/{id}, notificationPreferences/private scheduling jobs

**Important:** journalDerived is an explicitly identified AI/event record, not another authoritative copy of a session or original note. The existing diaryTimeline remains a read-only projection, extended to mixed existing/new types with stable event keys.

Design storage fields and Firestore Rules first. All new collections require owner-scope rule tests, export/delete coverage, pagination/index review and backup/restore plan BEFORE live writes. Never put raw personal journal text in public logs, GitHub, analytics, notification payloads or third-party indexes.

## 7. JOURNEY-01 — A→B→Я visual model

Two layers:
- **Evidence layer:** exact chronological turns, visits, self-reported mood/body sensations, created/completed goals, manually saved reflections.
- **Interpretation layer:** AI-generated milestones, themes, possible contradictions, proposed next steps, summaries, with model version and user acceptance state.

Session card shows:
- “С чего началось” (first prompt / explicit initial state)
- “Поворотные точки” (source-linked turning points)
- “Что изменилось” (confirmed statements/actions; if unknown say unknown)
- “К чему пришли” (latest supported summary, not invented)
- “Следующее действие или открытый вопрос”
- Duration as actual observed visit spans; no fake elapsed time for unrecorded gaps.

Cross-session graph (later) connects accepted themes without merging separate people/stories. Optimize for hundreds/thousands of sessions via filters and grouped summaries before drawing arbitrary network hairballs.

## 8. BODY-01 — BodyMap (P2, not yet implemented)

- React SVG human figure front/back, localized tappable zones: head, neck, shoulders, chest, abdomen, back, arms, hips, legs. Explicit selection and accessible list fallback; screen-reader names and keyboard controls.
- Input model: user-reported sensation (tightness, warmth, pain, heaviness, calm, etc.), intensity (optional 0–10), laterality, time, duration, associated mood/tag optional, authored note. Never map an AI guess to “pain” as a confirmed entry.
- Markers and temporal heatmap from actual check-ins; “last reported”, counts over time and data gaps, not health risk scores.
- AI can ask “Хотите отметить это ощущение на карте?” only when a user actually describes a bodily experience. Proposed link remains unconfirmed until tapped.
- Distinguish metaphorical emotion from physical symptoms. No causal health claims; for severe/new symptoms give appropriate seek-care information. Data is sensitive; privacy setting and delete/export apply.

## 9. MIND-01 — Mindspace and Growth Dashboard (P2/P3)

### Mindspace
- Node types: topic, emotion (self-reported or AI-hypothesized), role, relationship/area of life, accepted insight, goal/action and BodyMap report.
- Typed, dated, inspectable edges: “relates to”, “trigger noted by user”, “followed by”, “supports goal”, “contradicts previous interpretation”. No ungrounded psych labels.
- Start with a clear filtered constellation plus list; only later optional physics/zoom/drag. Separate stable semantic data from graph layout coordinates; don't store random positions as meaning.
- Every node opens underlying entries, dates and evidence; user can rename, merge, hide or reject derived nodes.

### Growth Dashboard / “Карта развития”
- A low-noise overview: self-entered moods (coverage stated), goals with true step completion, sessions/return journeys, reviewed insights, themes observed over time, next accepted actions.
- Visual “growth points”: user-confirmed change/achievement with source; “what still feels unresolved” is explicitly open, not failure.
- Percentages only when a real numerator/denominator exists, e.g. 3/5 goal steps, 2/7 mood-check-in days. NEVER “soul health 73%”, synthetic happiness index or faux clinical benchmarks.
- 7/30/90-day views, privacy-safe export, source-linked detail drilldown. Insight cards can invite a new session with scoped context choice.

## 10. GOAL-01 — Tasks / routines / processes

- Preserve existing Goals board and nested step semantics. AI-created goal is a **proposal**, not an accepted commitment.
- Accepted goal has owner, reason, steps, optional deadline, status, source session/insight, actual checked completion and revision history. Add action list, routine/check-in and defer/resume logic only after core save behavior passes QA.
- Model lightweight process templates: “clarify problem” → “choose step” → “perform” → “reflect” → “review after one week”; templates adapt, not clinical prescriptions.
- Reflect can **recommend** check-ins and schedule reminders only after explicit opt-in. Background actions operate on accepted tasks and schedules; never autonomously message a specialist or make purchases.
- Return visit to a session can review prior steps and ask if something changed, but by default the new provider prompt includes only the new text unless user separately authorizes context.

## 11. NOTIFY-01 — automation, notifications, job orchestration (P2/P3)

- Channel progression: in-app notifications → optional email → optional web push/PWA → native push after native client. No SMS/WhatsApp by default.
- Notification preferences: fully opt-in, per-kind frequency, user time zone, quiet hours, pause, delete and unsubscribe. Never reveal personal mood/body text on a phone lockscreen or email subject.
- Candidate triggers: user-chosen check-in time, accepted goal due date, scheduled return-to-topic, weekly review. No guilt-inducing streak mechanics.
- A durable scheduled job has jobId, owner, kind, dueAt, sourceId, state, lease/attempts and idempotency key. “At least once delivery with dedupe” rather than claiming exactly once external push.
- Cancel pending jobs on user opt-out, target deletion or account deletion. Audit only opaque IDs and delivery state.

## 12. Backend topology — evolutionary, not rewrite-first

**Now:** React/Vite front-end → Firebase Auth/App Check → Railway protected Node AI gateway → xAI; Firestore as record store.

**Next logical modules** (can remain one Node service with separate files initially):
1. AuthAndConsentGate: current secure gate, new scope-aware grants.
2. SessionService: visits, turn IDs, safe state transitions, idempotency, legacy adapter.
3. ReflectionOrchestrator: prompt router, single bounded AI request, validators, source-aware structured candidates.
4. JournalProjectionService: read model and derived-event dedupe.
5. GoalTaskService, BodyCheckinService, MindGraphService: owner-scoped domain operations.
6. Scheduler/OutboxWorker: queued consented post-processing and reminders.
7. PrivacyService: export/delete/retention/revoke with coverage across derived stores and jobs.
8. Evaluation/Observability: model/cost/latency/failure aggregates and safety fixtures, no text logging.

**Redis position:** do NOT deploy merely because old concept names it. Firestore must remain source of truth for owner records, money ledgers, unique visits and accepted actions. When justified by observed queues/latency, Redis can hold short-TTL cache, ephemeral rate-limiting hints, worker leases or queue metadata. For durable workflows use Firestore outbox/Cloud Tasks or a dependable queue with persistence and recovery; Redis alone must not be the only record of an accepted reminder, payment or personal insight. Do not duplicate a Firestore spending ledger in Redis as a second authority. Evaluate hosting/operational cost before adding a new Railway service.

**Rails position:** keep Ruby/Rails optional for a future isolated analytics/admin API if measured needs warrant it. Migrating from a working React/Firebase stack to Rails + Vue/Turbo/Stimulus now adds incompatible persistence, auth, client/runtime costs and unacceptable release risk.

## 13. Delivery stages, dependencies and acceptance

| Stage | Priority | Frontend | Backend / AI / data | Hard acceptance |
|---|---|---|---|---|
| QA-00 current result | P0 | Verify saved sessions on reload and contrast | Correlate one real Grok request with provider Usage without re-sending | Real reply + persistence + billing evidence documented |
| UX-01 | P0 | Contrast, bubble alignment, day rail, category icons, footer dates, accessible motion | No schema changes | Dark/light 320/390/1440px; no lost notes, old session rendering |
| JOURNEY-01a | P0/P1 | Session Map replaces legacy table; filter/summary/readability | Safe sourced event projection and missing-time guard | Path A→B readable; legacy events sort safely |
| SES-01 | P1 | History drawer, auto title, Resume, visit indicator, diary delta links | Visit/turn IDs, resume counter, idempotent continuation, owner rules | 1 session / 3 visits / 2 returns, no duplicates after reload |
| AI-01a | P1 | Deep reply modes, AI-authored journal card, optional proposal controls | Bounded answer + validated enrichment from same consented text | Human-readable answer, correct authorship, no surprise writes |
| AI-01b | P1/P2 | Scope UI, source and memory ledger | Opt-in session history/retrieval, model versions, evaluation harness | No past text leaves device/server without new permission |
| GOAL-01 | P2 | Linked goals, tasks, check-ins | Transactional accepted actions, links, state | Suggested ≠ accepted; progress source-backed |
| BODY-01 | P2 | SVG front/back + accessible selection | Body check-in collection, rules, summaries | Self-reported zones persist correctly; no diagnoses |
| MIND-01 | P2 | Node/edge map, filters and drilldown | Typed graph provenance and user edits | Every derived node has inspectable evidence |
| DASH-01 | P2 | Growth dashboard and 7/30/90 reviews | Deterministic aggregates with coverage | No fabricated scores, sources open in one tap |
| NOTIFY-01 | P3 | Notification center, consent/quiet-hours controls | Durable jobs, idempotency, worker monitoring | Opt-out cancels delivery, no sensitive push text |
| RELEASE-01 | P0 for public | Full responsive, a11y, i18n, errors, export/delete | Account rules/security, backup/restore, budgets, monitoring | Owner-approved protected production rollout only |
| BUSINESS-01 | Later | PWA/native, optional experts, plan UX | Legal, operational unit economics, entitlements | Only after product and privacy are reliable |

Stages have **no unsupported calendar estimates**. Work in small PRs with tests and owner visual validation. A stage is done by its acceptance result, not by number of components written.

## 14. Test matrix and regressions that must never reappear

- Sources: old Firestore notes, sessions, moods, goals; no data migration in UX-01.
- Dark/light: AI question detail, answer, goal reflection, mood, modal, scheme; enforce readable foreground/background contrast and focus indicator.
- Desktop/mobile: chat edges and 5-paragraph answer; 320/360/390/430/1280/1440/1920; composer not covered by mobile keyboard.
- Accessibility: reduced motion, Escape/focus on drawers, keyboard-only graph list, screen reader day labels, icon aria-labels.
- Dates: Armenia UTC offset boundary, DST zone variant, multiple same-time events, absent timestamp, revisions vs creation time.
- Session lineage: open/resume/reopen without new visit, explicit resume once, multiple explicit returns, concurrent devices, failed save, ambiguous response, paid request ID dedupe, no repeated transcript or journal entry.
- AI: current-message default only; explicit consent for older context; one xAI call per explicit message; token budgets; rejected candidate does not become user-authored fact; no raw PII log.
- BodyMap and Mindspace: explicit user input, no inferred medical event; profile switching, export/delete, consent revoke.
- Provider costs: avoid recursive AI “analyze everything” jobs; model/prompt version, actual provider receipt when available, server-only budget ledger and kill switch.
- Security: Auth/App Check, owner rules on all new collections, no public disclosure, no private backup or UID in CI fixtures.
- Staging public release: no changes to production/main/Vercel/production Firebase until a separate reviewed release gate.

## 15. Immediate executable backlog: first three small Draft changes

**Draft UX-01A — Contrast + Session Schema baseline**
- Replace legacy light/white utilities in DiaryNarrativeCard session detail and SessionSchema/SessionTable with Midnight Aurora semantic classes, improve timestamps, defensive sorting.
- Add targeted React/Vitest + browser dark/light fixtures. Confirm no white-on-white, black-on-black, no user content mutation.
- Owner checks screenshot of diary expanded session and scheme.

**Draft UX-01B — Timeline rail + layout + motion primitives**
- Show local day/month on left slim rail using existing diaryGroups; add source type icons, footer dates and meaningful AI/user hierarchy. Align chat bubbles to lane edges and use responsive width; introduce reusable motion tokens/AnimatedDisclosure with reduced-motion.
- Regression tests: filter state, scroll, keyboard, mobile, date boundary, note versions.
- Owner checks screenshot of journal and 2-turn chat desktop/mobile.

**Draft SES-01A — Session history drawer + lineage model (safe initial cut)**
- Read-only screen first with titles, session selection and path overview; then persistence of explicit visit IDs and resumeCount in a separate reviewed commit; no automatic retroactive guessing.
- Write/restore three-visit synthetic fixture; journal root/continuation linking without duplicate events, explicit Save.
- No migrations or provider prompt/history changes until test matrix is green.

## 16. Open design decisions (record, do not silently assume)
- Which of three UI languages besides Russian? Prior 2026-11-09 roadmap explicitly leaves two unspecified.
- Is automated persistence of **AI-authored** reflections on by explicit per-user opt-in, or per-session permission? Either way: no automatic rewrite of user-authored content.
- Session title: deterministic default plus optional AI rename; exact trigger for separate AI cost needs approval.
- ResumeCount: proposed explicit Resume mechanism; inactivity threshold, if needed, requires product test.
- Model context sharing: exact optional scopes and retention window, subject to privacy review.
- Which notification channels and cadence deliver demonstrable value without intrusiveness?
- Medical/therapeutic features and expert handoff need independent professional, privacy and legal review. Historical Freudian/Jungian/Adlerian framing may inspire reflective prompts but is NOT a scientifically validated automatic diagnostic algorithm.
- Monetization, subscriptions, expert booking and white-label are future independent commercial decisions, not prerequisites to a working intelligent journal.

## 17. Sources
- Owner’s 2026-11-10 Screenshots + detailed ideation in CAREER conversation.
- Google Drive Reflect idea folder: https://drive.google.com/drive/folders/1wp7qZq5w9uSb8DBQhiWfinOBVKeXOmlr
- Historical “Главный Профиль”: https://docs.google.com/document/d/1koKh233W-RKnn7tpDRDFSAiO5MzlvzP1I2z7QT55dX0/edit
- Historical master (archive): https://docs.google.com/document/d/1lHQQTQGIYANNYjJpWe1AhTsO0qlhPeOcg9f_LLuf2hM/edit
- 2026-11-07 master continuation: https://drive.google.com/file/d/1J8vgBayCb9NpJlNJyPvWlptN4GMmY5XU/view
- Active Draft PR #37: https://github.com/TheGor-365/reflect/pull/37
- Current operational roadmap: docs/roadmap/REFLECT_2_PRODUCTION_MASTER_PLAN_2026-11-09.md
- Current xAI fix checkpoint: docs/handoffs/REFLECT_2_XAI_400_422_STAGING_FIX_2026-11-10.md

**Last action in this blueprint:** docs-only commit. No AI invocation, schema migration, production deployment, staging redeploy, Firebase data mutation or Redis service creation. 
