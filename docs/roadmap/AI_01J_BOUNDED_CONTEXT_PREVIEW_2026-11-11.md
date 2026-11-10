# Reflect 2.0 — AI-01J: ограниченный серверный preview исторического контекста

**Checkpoint: 2026-11-11 | Draft / isolated security code | No runtime integration**

## Verified starting point

Owner's three authenticated staging screenshots show the complete owner-clicked **grant → list → revoke** cycle at current Firebase Hosting build `9c347878f96c184ec24bbe8d4032e4f7010066a7`, with server-confirmed 15-minute grant readback and server-confirmed removal from the active list. PR #56 includes the acceptance evidence. An additional full reload / second-account retention audit was not shown. Railway staging consent server `b247312863c2593563f5f53bc01aaa6ca994e535` remains separate from the one-message Grok API.

### Actual persisted session format confirmed in source

`src/features/Sessions/Sessions.jsx` stores one owner-scoped document:
`artifacts/reflect-8fdc8/users/{uid}/sessions/{sessionId}`, fields including `title` and `chatHistory`, with each turn carrying `role: 'user'|'assistant'` and `content`. Historical messages are in this existing array; no migration or new subcollection is necessary to read their current structure. Session title, profile, diary, goals, session schema and recommendations are NOT in consent scope.

## What this PR implements

- New **server-only** `server/privacy/sessionContextPreview.cjs`. Not imported by Railway, hosted AI handler, xAI provider, React, or any HTTP route.
- Requires a server-created staging principal (`uid`, verified Auth/App Check context) and exactly one `grantId + sourceId + scope:'session-turns'`. It calls the existing private `consentStore.check` **before** reading the one source document and **again** after shaping the preview. A missing, revoked, expired or mismatched grant denies without returning preview content.
- Reads exactly **one** owner-scoped session using Firebase Admin, never a collection query. The existing owner UID path and any explicit `uid`/`ownerUid` fields must not conflict. No owner or source ID is trusted from the session document itself.
- Only the **last four** `user/assistant` turns may be included, each clipped at **700 UTF-8 bytes**, total **2,400 UTF-8 bytes**; preserves Unicode code-point boundaries. Invalid roles, control characters, malformed/empty transcript and more than 1,000 source turns are rejected. Older turns are omitted; clipped turns are marked.
- Every extracted turn is labeled `untrustedSource: true`. This metadata is not equivalent to prompt-injection protection; future provider integration MUST wrap history as quoted data, not system instructions.
- Result includes `disclosureRequired:true`, `providerDispatchAllowed:false`. It is only an in-memory preview. It is not logged, stored, returned to the app, or sent to Grok; no new access or paid request occurs.
- Node unit tests cover forged IDs/scopes, cross-account isolation, a revoked grant during reading, server outage, missing/malformed messages, UTF-8 clipping, source path restrictions and redacted private failures.
- Firebase **synthetic Auth + Firestore Emulator** test extends the actual grant flow: issuer grants source, Admin preview succeeds, wrong owner preview denied, issuer revokes, preview denied after revoke. Existing deployed-source Rules still reject direct browser access to private grant metadata.
- Existing consent CI now runs the preview tests and asserts no imports from active Railway/provider/client paths.

## Explicit limits and remaining blockers

1. **No genuine user session is read by this PR.** Tests operate on synthetic fixtures and demo Firestore Emulator only. The full real-data preview and UX have NOT been accepted.
2. **UTF-8 byte caps are NOT model token caps.** Before any paid call, integrate a separate conservative tokenizer/model-specific token budget and the existing daily quota ledger, with explicit cost limit and no implicit retries.
3. Double grant-check protects the in-process preview, but cannot eliminate a revoke race *after return*. A future provider pipeline needs independent just-in-time verification/locking or cancellation semantics immediately before dispatch and a clear user-visible outcome for in-flight requests.
4. Preview may contain private content. Future HTTP preview route must verify unrevoked Firebase Auth + consumed App Check, selected scope, live entitlement, safe Origin, request size and rate limiting; return only to the owner over HTTPS without caching, logging or storing. Obtain **separate, explicit owner confirmation of the exact bounded text** before any transfer to xAI.
5. A future source preview needs scrub/review controls and plain disclosure that sending to a third-party provider may retain content. De-identification cannot be promised automatically. Do not add all-history or automatic upload.
6. Require a separate source-specific provider contract and independent security/design review; keep current `/v1/ai/reply` **one-message-only**, consent flags and Firestore Rules unchanged during this PR. Do not change `main`, production, Railway, Hosting, tokens or real documents.

## Status and next slice

- **AI-01I** — owner staging PASS for grant/list/revoke; grant revoked and active list empty at last screenshot.
- **AI-01J** — isolated server-side bounded preview model + synthetic/emulator tests. Draft, not deployed.
- **AI-01K proposal** — authenticated, read-only, owner-only **preview-and-approve UX** with source text disclosure; no paid calls; then separate, approved history-aware provider runtime, with just-in-time recheck and budget enforcement.

Release gate: exact-head CI successful; inspect resulting docs/tests; explicitly approve staging-only read-only preview endpoint in a *subsequent* PR. No immediate Railway/Hosting deploy necessary for this isolated module.
