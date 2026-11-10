# Reflect AI-01B.4 — Verified source reads · 2026-11-10

**Draft, read-only, not runtime-wired and not deployed.**

## Why this stage matters

The current paid Reflect/Grok handler uses `one-message` only. The legacy personal data lives under `artifacts/reflect-8fdc8/users/{uid}` in Firestore. Each user's journal note is a document containing `entries[]` (sometimes including revision snapshots); sessions contain `chatHistory[]` in a single legacy document. Fetching all session history and filtering only after reads could violate fine-grained consent and waste tokens.

The explicit personal-context permission protocol created in PR #46 is a **pure reader only**. PR #47 validates candidate Firestore Rules in a synthetic emulator, but these rules **have not replaced** the currently broad hosted rules.

## Implemented (no provider traffic)

`server/ai/ownerEvidenceReader.cjs`:

1. Requires server-verified Auth UID to equal requested owner UID, finite valid timestamp, server database handle and bounded `maxDocuments` (at most 6).
2. Loads **fresh** owner-specific settings/grants from `loadOwnerContextAccess`; unknown/invalid settings or storage failures never authorize data.
3. Derives an exact, deduplicated list of permitted document IDs from active, unexpired, source-specific grants; never accepts client-supplied content or lists collections.
4. Allows read-only `diaryNotes/{id}` for `selected-history` (`diaryEntry`) and `goals/{id}` for `selected-goals` (`goal`). Ignores grant permissions for unrelated collections.
5. Reads only those exact owner paths using `doc(id).get()`; deleted/invalid source snapshots are ignored, a read error rejects the entire result (no partial leakage).
6. Diary materialization takes only the current user-authored `entries[].text`, **not** saved `versions[]`, AI-created proxy notes, or linked metadata. Overlong material is skipped under `contextSelector` limits.
7. Passes only allowed normalized source records into existing `selectContext`, marking snippets as **untrusted evidence**, not instructions for the model. Returns bounded excerpts and safe read counters, never a full Firestore document.

**Legacy `sessionTurn` / body check-in / memory recall is deliberately unsupported** in this loader. Existing `sessions/{sessionId}` embed several turns in `chatHistory[]`; a per-message grant ID cannot be safely mapped to an individual Firestore document without a new consent and source-ID contract. Do not reclassify a whole session as one user-authored turn. No migration/deletion of existing sessions is proposed.

## Test coverage

`server/ai/ownerEvidenceReader.test.cjs` adds ten synthetic tests:
- no grant means zero journal/goal reads;
- two approved documents are fetched, unrelated documents never fetched;
- wrong owner rejected *before* reads;
- revoked, expired or future grants perform no source reads;
- legacy sessions/memory/body sources remain unsupported;
- AI-authored notes and historical snapshots excluded;
- missing, oversized, future and corrupt notes excluded;
- database failure blocks the entire operation;
- six-document upper bound with stable dedupe;
- corrupt cross-owner grant blocks all context.

Included in `npm test` by `test:ai:unit`. CI verdict must be verified at the exact PR HEAD before release.

## Security and product gates

**Do not import this adapter into the paid handler yet.**

- Currently broad hosted Firestore Rules would allow a client to author `aiContextGrants` under its own UID, so Admin SDK grants cannot be trusted without the separately approved effective ruleset.
- A real owner-facing scope consent UI and trusted grant/revoke endpoint, with deletion semantics and source-ID validation, remain unimplemented.
- Topic relevance is not yet ranked. Sorting uses deterministic ID order; **do not claim intelligent retrieval**. Next stage: owner-approved source picker, context relevance ranking, provenance, narrow token budget, and exact on-request billing.
- For session continuation, develop per-turn consent and a safe legacy `chatHistory` adapter before touching actual chat texts.
- No authorization to fetch the entire diary, no background summarization, no auto-generated suggestions, no new scheduled jobs, and no silent provider transfers.
- Once the policy is proven, stage a **new versioned API** after Auth/App Check, source consent, budget reservation, readiness safety and provider prompt injection controls. Keep the existing one-message API unchanged until staged acceptance.

**Real QA still required:** owner confirms UX-01E AI setting `Подробно` persists after reload; screenshot does not yet exist. PRs #45/#46/#47/#48 are stacked/in separate branches and are not an integrated production release.
