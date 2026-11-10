# Reflect 2.0 · AI-01A — Context, Memory & Orchestration Contract

**2026-11-10 · Architecture Draft · NO RUNTIME CHANGES.** Stacked after UX-01C Draft PR #40. This is a proposed extension of [REFLECT_2_INTELLIGENT_PRODUCT_BLUEPRINT_2026-11-10.md](./REFLECT_2_INTELLIGENT_PRODUCT_BLUEPRINT_2026-11-10.md), not a substitute for the existing privacy, release and business gates.

## 1. Problem and goal

The current protected AI pipeline is intentionally one-message-only. It can generate a real reply but does not retrieve the preceding conversation, validated prior insights, user-confirmed goals, body check-ins or journal history. As a result, even a technically correct answer may be unhelpfully generic, and a legacy session can appear to "forget" the conversation.

**Product promise:** after a deliberate user action, Reflect should deliver an answer grounded in available and *authorized* context; notice relevant history, ask a useful clarifying question when needed, propose a small number of traceable next steps and preserve meaningful continuity. Extra paid calls, uncontrolled broad scanning and unsupported psychological conclusions are not acceptable shortcuts.

The requirement "maximum AI access" means *maximum relevant access inside current user permissions*, not unrestricted transfer of an entire private archive to an external model.

## 2. Verified boundary / do not regress

As inspected in code on 2026-11-10:

- Frontend: `src/api/reflectAssistantService.js` permits `{ requestId, message, consent:{granted,version,scope:'one-message'} }`; it sends neither profile nor history.
- Server: `server/ai/policy.cjs` validates explicit one-message consent, owner Auth/App Check and strict field allowlist. `server/ai/hostedHandler.cjs` reserves quotas then invokes the provider. `server/ai/xaiContract.cjs` has a versioned short system prompt, `max_output_tokens=512` and `store:false`; this does **not** mean the provider stores no audit data.
- Firestore: owner-scoped `sessions`, `diaryNotes`, `moods`, `goals`, `profiles`. Old `chatHistory` arrays must remain readable/exportable.
- **Do not replace existing provider policy with a frontend-built "context" object or add silent Firestore reads to the current endpoint.** Auth is derived server-side, not from a client UID.
- UX-01C is pending QA after a test assertion correction. Do not deploy this design or claim its functionality is live.

## 3. Typed AI decisions, not unconditional generation

A deterministic, cheap **PreflightRouter** runs before any paid request:

1. Validate size, Unicode, idempotency key, user entitlement, rate and money budget. Deduplicate repeat actions.
2. Check empty requests, repeated machine spam, unsafe control instructions, attempts to inject developer/system prompts or access another person's archive. Treat retrieved content as **untrusted evidence**, never as executable instructions.
3. Classify request purpose: journal note / reflection / context question / goal proposal / check-in / task assistance / ordinary small talk / explicit unsafe request. Purpose affects which context to seek, not whether a person's viewpoint, identity or emotional state is "marginal".
4. Decide `local_answer`, `clarify_without_history`, `model_reply`, `refuse_unsafe_action` or `defer_provider_unavailable`. Local results must be clearly marked as local if shown as an AI-like response.
5. A genuine low-detail request may still merit one open clarification; do **not** block users describing distress because their words resemble spam. Safety routes should avoid diagnosis, invalid reassurance or pretending to be a clinician.
6. No invisible model-call retry after timeout/429/5xx; the original request may already be billed.

The router must not invent user data, approve goals, score mental health or save a personal reflection without the required review policy.

## 4. Context selection and privacy scopes

**Default:** exactly the current user-entered message, as today. New scopes require a *versioned, visible, explicit grant* before any relevant source text leaves the trusted server for xAI.

Suggested incrementally grantable scopes:

| Scope | What the server may retrieve | Proposed UX |
| --- | --- | --- |
| `current-message` | Only submitted text | Existing default |
| `this-session` | Selected turns of the current owner session, by stable IDs and recency | "Учесть эту беседу" |
| `selected-history` | Explicitly chosen older sessions/entries, with source IDs | Source chooser + preview |
| `approved-memory` | User-confirmed, reversible memory facts and summaries | Inspectable Memory ledger |
| `selected-goals` | Specific accepted goals, actions and deadlines | Context toggle for goal coaching |
| `selected-body-checkins` | Self-reported body check-ins (never an inferred diagnosis) | Separate sensitive-data disclosure |

- A grant is purpose-scoped, user-scoped, revocable and time-bounded as applicable. Store its version, permitted source IDs/types and expiry, but **never** treat model text as a grant.
- Server retrieves authorized records using authenticated UID, checked app ID and owner rules. The browser must not send raw arbitrary archive text pretending it is trusted context.
- Before each paid request, show selected sources (type/count/available labels), provider-disclosure summary and possible paid effect. The provider request includes only the selected excerpts actually needed.
- Revocation prevents subsequent use and queues must stop; export/delete must cover consent ledger, accepted memory, derived artifacts and pending tasks. Never promise erasure of data already retained by a third party outside our control.
- No user text, snippets, memories, prompts, private identifiers or session transcripts in telemetry, log aggregation, email subject lines, public analytics, GitHub or push notifications.

## 5. Retrieval and memory algorithm

Prefer a **deterministic source-based retriever before vector databases**:

1. Active session: latest explicitly stored turns, plus the current user text.
2. Relevant accepted memory items: topic intersection, user-pinned priority, recency and source-reference coverage.
3. Selected journal/goal entries only if allowed by the active grant; ignore already revoked/deleted/unsourced items.
4. Context window manager: cap bytes/tokens per category, use stable ordering, remove duplicates and stale overlaps, keep a strict reserve for system instructions and model output.
5. Provider prompt receives concise structured evidence envelopes with `sourceType, sourceId, authoredBy, originalTimestamp, excerpt`; user quotes are never reattributed to Reflect.
6. When evidence is thin, contradictory or unavailable, ask **one targeted clarifying question** and indicate uncertainty instead of hallucinating a life history.
7. After generation, validate referenced IDs against the selected source set; drop unsupported AI facts/links rather than persisting guesses.

Derived summaries can improve long histories, but are **hypotheses until reviewed**. Maintain a versioned ledger:

`memoryId, ownerId, kind, statement, sourceRefs[], provenance, confirmedByUser, reviewedAt, promptVersion, modelVersion, expiry/revokedAt`.

Search relevance and repetition are measurable by synthetic fixtures. Do not add permanent embeddings/Redis purely for novelty; assess cost, deletion guarantees and access control first.

## 6. One bounded request → structured value

Propose a **versioned** server-side response envelope (not implemented; verify provider structured-output compatibility before using it):

```json
{
  "schemaVersion": "reflect-reply-v2",
  "reply": "Short-to-substantive user-facing reflection",
  "titleCandidate": "Optional short meaningful title",
  "clarifyingQuestion": "Optional single focused question",
  "insightCandidates": [
    {"text": "Hypothesis, not diagnosis", "sourceTurnIds": ["turn-id"], "reviewState": "proposed"}
  ],
  "actionCandidates": [
    {"label": "One possible next step", "kind": "goal-suggestion", "reviewState": "proposed"}
  ],
  "evidenceRefs": ["approved-source-id"],
  "uncertainty": "Optional concise uncertainty"
}
```

- Strict schema: bounded lengths, bounded item counts, known action kinds and verified provenance. Invalid structured output yields a safe fallback or an explicit error, **not** a phantom saved event.
- A title and a useful answer should come from the **same authorized paid model call**, not an unannounced second call. A title remains editable; manual text wins over future proposals.
- Model may ask questions as a conversational participant. It cannot silently advance a goal, set a reminder, archive user-authored text, change an access setting, contact an expert or run external tools.
- Let user choose compact / standard / explore response modes, with bounded costs. "Longer" is not automatically "better"; ask questions only when they improve an uncertain decision.
- Distinguish user words, AI reflection, proposed insights and deterministic system metadata at both storage and UI layers.

## 7. Durable events, session returns and post-processing

Do not infer visits from rerenders. Introduce stable `sessionId` + explicit `visitId` and append-only sourced `turnId` before building A→B→Я journey.

- Resume increments `resumeCount` **once per deliberate new visit**, transactionally; reload does not count.
- A later diary reflection links back to its source session and visit. Persist a new continuation/delta only once using an idempotency key, without copying an entire ancestor card.
- An `EventPlanner` translates validated output into candidates (`ai.reflection`, `insight.proposed`, `goal.proposed`, `reminder.suggested`), each with dedupe key, evidence refs, author and `proposed/accepted/rejected`.
- Autonomous writes of AI-authored reflections, if introduced, require distinct opt-in retention policy and visibility. Never edit an original user note as if AI authored it.
- Background summarization or periodic reviews must be independently enabled, quota-limited and cancellable; do not introduce a hidden recursive API loop.

## 8. Scheduler, reminders and Redis

Priority order: in-app notifications, then separately opt-in email/web push. Reminders require an **accepted** task, an explicit date/time (or approved rule), timezone, frequency and quiet hours. They must be pauseable/cancellable.

- Durable job source of truth: Firestore job/outbox document with owner, `jobId, kind, sourceId, dueAt, status, attempt, dedupeKey, consentVersion`. Use a durable worker / queue with recovery and delivery dedupe.
- Don't include sensitive diary text in lockscreen notification previews or emails.
- Redis is *optional*: TTL cache of consent-safe derived views, ephemeral rate hints, worker coordination. Not a canonical diary store, visit ledger, approved memory store or money ledger. Evaluate running cost before adding Railway services.
- Track only de-identified operational metrics: per-mode requests, rejected preflight reasons, token estimates vs usage, spend, time to first reply, grounded citation coverage, opt-in rate and queue health.

## 9. Implementation sequence / QA gates

### Gate 0 — finish UX-01C
Local suite PASS on exact PR #40 SHA; typecheck/build PASS; owner-approved Firebase Hosting staging-only release; verify real saved session library desktop/mobile, opening old session and preserving drafts. Do not merge/deploy this design.

### AI-01A — pure server policy prototypes (**next after Gate 0**)
- New unit-testable modules: `ContextGrantPolicy`, `PromptPreflightRouter`, `ContextSelector`, `TokenBudgetPlanner`, `SourceReferenceValidator`.
- No provider SDK, no Firestore writes, no real personal text in fixtures.
- Tests for cross-account IDs, denied scopes, no-archive default, revocation, prompt injection in retrieved text, near-duplicate requests, ambiguous timeouts, and user distress.

### AI-01B — opt-in history retrieval
- Authenticated server Firestore read with allowlisted scopes and bounded source IDs.
- Compatibility layer for legacy `chatHistory` arrays; no forced migration.
- New explicit consent UI; server tests enforce forbidden cross-user reads and no context leakage. Old one-message endpoint remains unchanged until migration validated.

### AI-01C — one-call answer + title + proposed events
- Verify model API contract; versioned prompt/schema, bounded mode, model budget.
- Synthetic evaluation harness + idempotency/cost receipts; no surprise paid model calls.
- UI shows title/proposals, origin/source and user decisions. Original transcript remains immutable.

### SES-01, JOURNEY-01, NOTIFY-01
- Explicit visits, grounded journal deltas, visual path map with timestamps and genuine turning points.
- Only then consented background review/reminders. Build BodyMap/Mindspace on separate source-linked domain modules.

**Definition of Done:** Every retrieved excerpt was authorized and can be traced; one explicit send causes at most one paid generation; uncertainty triggers useful clarification; no unsupported memory persists; user can inspect/revoke; budgets are enforced server-side; no user data escapes in logs; old records work; protected staging QA green; production remains untouched until explicit review.
