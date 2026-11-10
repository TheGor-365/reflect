# Reflect 2.0 — AI-01B / RECO-00: Recommendations & Assistant Settings

**2026-11-10 · Design + pure implementation gate, not live functionality.**

Extends [AI01A_CONTEXT_MEMORY_ORCHESTRATOR_CONTRACT_2026-11-10.md](./AI01A_CONTEXT_MEMORY_ORCHESTRATOR_CONTRACT_2026-11-10.md). The new `server/ai/recommendationReadiness.cjs` is standalone and NOT imported by the deployed Railway/Grok handler. UI PR #43 currently provides six diary lenses; its recommendation lens intentionally displays a truthful empty state.

## Product behavior

The user's question is not a trigger for generic advice. A user can write freely and receive a grounded reflection, a useful clarifying question, or a source-backed recommendation **only when warranted**.

Proposed conversational flow:

1. Explicitly enabled recommendation mode + appropriate source consent + existing budget/permission gate.
2. The backend selects only the owner-authorized, topic-relevant excerpts (session, approved memory, goals, journal, opt-in body check-ins).
3. The AI and deterministic validators establish four separate evidence dimensions:
   - **Topic** — what the conversation is about;
   - **Desired outcome** — what the user is trying to achieve or understand;
   - **Relevant context** — concrete background or a specific situation;
   - **Constraints** — limitations, resources or an explicit statement that no relevant limitation is known.
4. Progress UI counts **verified coverage**: 0/25/50/75/100%. It never claims clinical certainty, effectiveness, medical evidence or that the person is fully understood. The indicator can show a missing dimension with one clear clarification instead of repeating vague advice.
5. At 100% the backend **may request or accept** a bounded grounded proposal in the **same authorized paid model turn**. Readiness is not a promise to generate: safety, cooldown, dedupe, user preferences, facts and source-reference validation still govern whether the recommendation appears.
6. Accepted automatic candidate becomes a separate AI-authored `recommendation` event *only if user enabled auto-save*. It never becomes an original user journal note, a completed goal or an automatic external action.
7. The card shows headline, concise advice, *why this is relevant*, linked evidence/previous reflection and actions `Обсудить`, `Скрыть`, `Превратить в цель`. No notification, reminder or goal mutation without separately accepted action.

**Recommendation != ordinary Reflect answer != approved memory != user note.** Do not infer categories from text alone.

## True data/consent contract (future, not implemented)

```json
{
  "sourceKind": "recommendation",
  "author": "reflect-ai",
  "status": "proposed",
  "topicKey": "approved-topic",
  "contextCoverage": 100,
  "evidenceRefs": ["sessionTurn:turn123"],
  "recommendationText": "Proposed next step",
  "reasoningSummary": "Why it may fit this context",
  "aiModelVersion": "provider-pinned",
  "promptVersion": "reflect-reply-v2",
  "dedupeKey": "server-generated-idempotency-key",
  "consentVersion": "versioned-grant",
  "createdAt": "trusted-server-time",
  "expiresAt": "optional-server-time"
}
```

Owner ID, timestamps, content provenance, sourceRefs and consent must come from trusted server state. Reject cross-user references and revoked/deleted evidence. Use Firestore transactional idempotent storage once Rules and emulator tests pass. Never log excerpts in telemetry. The shown schema is a **proposal**, not permission to write new collections.

## Assistant Settings — one advanced, understandable screen

Group in explicit sections (no inert toggles displayed as if active):

| Section | Proposed controls | Server effect |
| --- | --- | --- |
| Conversation | Short / balanced / deeper response; ask a question when uncertain; response tone | Versioned request plan and bounded output |
| Recommendations | On/off **default off until informed consent**; automatic save on/off; frequency limit, pause by topic; show context indicator | Enforced policy before suggestions and writes |
| Context & Memory | This session, selected other sessions, reviewed memory, selected goals, selected body check-ins | Exact owner-grant source IDs, provider disclosure, revocation |
| Quality & Privacy | Review AI-derived facts, correct/reject memory; source history; delete/export | Versioned audit/retention ledger |
| Costs | Daily/weekly request budget; disable background processing; display estimate | Reserved server-side budget and hard cap |
| Reminders | On/off, time zone, quiet hours, accepted tasks, channels | Durable outbox only after opt-in |

**Accessibility:** every control has explanation, current persistence status and a truthful disabled/unavailable state before backend wiring. No concealed provider transfer or silent subscription changes. New settings must not override current `one-message` privacy contract without user action.

## Backend completion milestones

- **AI-01B.1 (current pure prototype):** Evidence coverage policy `recommendationReadiness.cjs`, scoped synthetic tests. No xAI/Firestore interactions.
- **AI-01B.2:** Owner-authenticated scope grants, persisted settings and access/revocation model with Firestore emulator QA. Safe defaults.
- **AI-01B.3:** Context selection from actual user-approved history and source references; metadata schema and request budgets.
- **AI-01B.4:** One-call structured reply containing optional title, one clarification, insight and recommendation candidates; strictly validate source IDs/safety. No hidden second xAI call.
- **RECO-01:** User-visible context indicator and recommendations in conversation; automatic deduped event creation only when enabled. Timeline source filter reads the approved recommendations collection without public leakage or migration of legacy notes.
- **NOTIFY-01:** Separately opted-in reminders, expiry and quiet hours, managed via durable queue. Redis optional, not system of record.
- **JOURNEY-01:** Evidence-backed session returns and path map; genuine milestones rather than inferred percentages.

## Quality gates

Test with fully synthetic situations: insufficient context, ambiguous question, sensitive/distress input, contradictory evidence, archived/deleted sources, repeated session visits, repeated client sends, disabled recommendations, changed setting mid-request, quota exhaustion, unseen phone settings and revoked grants.

**Definition of done for live recommendations:** real user can switch off before or after a conversation; no recommendation is generated without an approved existing AI request; sources can be inspected; at 100% all coverage dimensions cite permitted evidence; suggestions can be hidden without repeating; reminders are never scheduled by model alone; backend logs contain no personal text; unit/emulator/security CI + staging accessibility passes.

> This is a product and backend engineering contract. As of 2026-11-10, there is no deployed automatic recommendation generator, no persisted AI settings and no session context progress UI.
