# Reflect AI-01A · Pure Context & Preflight Core

**2026-11-10 · Draft PR / NOT RUNTIME-WIRED / NOT DEPLOYED.**

This batch implements the first executable, dependency-free policy foundation for [AI01A_CONTEXT_MEMORY_ORCHESTRATOR_CONTRACT_2026-11-10.md](./AI01A_CONTEXT_MEMORY_ORCHESTRATOR_CONTRACT_2026-11-10.md).

## Created (pure CommonJS, independent of Firebase and xAI)

| Module | What it really does |
|---|---|
| `server/ai/contextGrantPolicy.cjs` | Exact owner UID, source type/ID, active user opt-in version and expiry/revocation gates; rejects "all archive" wildcard |
| `server/ai/contextSelector.cjs` | Deterministically limits evidence to allowed owner-specific excerpts; dedupes and caps byte size |
| `server/ai/preflightRouter.cjs` | Proposes paid / free-clarification / reject / unavailable paths; detects exact request-ID replays and obvious machine spam without censoring emotional expression |
| `server/ai/tokenBudgetPlanner.cjs` | Conservative preflight estimates; caps selected evidence against the existing max input budget. **Not exact provider token counting** |
| `server/ai/sourceReferenceValidator.cjs` | Allows at most three review-only model proposal candidates with validated references to the selected excerpts; does not persist them |

Tests (synthetic, no personal content):
- `server/ai/contextPolicy.test.cjs`
- `server/ai/preflightRouter.test.cjs`
- `server/ai/contextBudgetAndEvidence.test.cjs`

## QA commands

```bash
node --test server/ai/contextPolicy.test.cjs server/ai/preflightRouter.test.cjs server/ai/contextBudgetAndEvidence.test.cjs
npm test
npm run typecheck
npm run build -- --mode staging
```

The full local suite and targeted Node tests **have not been executed by the assistant**. A Vercel Preview build, if green, is not a substitute. Do not publish until verified against the exact commit.

## Security boundary

Nothing imports these modules from `server/ai/hostedHandler.cjs`, `server/railway/index.cjs`, or browser `src/`. This batch:
- performs **zero** Firestore reads/writes, scheduled jobs, xAI provider requests, or data migrations;
- does **not** expand existing `one-message` consent or change the frozen live cost reservation;
- does **not** make automatic diagnoses, memories, or reminders;
- never accepts grants supplied directly by a client request as authoritative;
- does **not** solve prompt injection or provider safety completely — evidence is explicitly untrusted, and further integration tests/prompt isolation remain mandatory.

## Next integration gates

1. First complete UX-01C PR #40 local green tests and Firebase Hosting staging visual acceptance; do not merge PRs or change Railway production ahead of the owner.
2. Validate pure AI-01A unit tests, including normal/legacy data and malicious synthetic fixtures.
3. Write server-side Firestore owner-scoped grant storage + rules/emulator assertions, revocation/export/delete and idempotency tests. **A client must never submit an arbitrary UID, grant, source text or provider instruction.**
4. Add a new versioned opt-in API request with explicit source-picker/consent UI and stable IDs. The old one-message endpoint stays untouched until independently green.
5. Add source-grounded response/title/question structured contract, safety evaluations, token accounting and full staging QA. No paid hidden calls, automatic extra requests, or unsolicited personal data upload.
6. Only after consented durable source retrieval is proved: persist session visits, derive journal continuations, schedule reminders through a durable outbox, build the visual A→B→Я path.

**Acceptance definition:** zero unauthorized excerpts; zero automatic paid retries; exactly one visible user-authored request per paid generation; no fabricated source-linked memory; inspectable/revocable scope; all tests green on exact SHA; no changes to existing staging/runtime until approval.
