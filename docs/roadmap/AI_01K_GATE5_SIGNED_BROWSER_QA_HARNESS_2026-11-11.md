# AI-01K Gate 5 — owner-signed browser acceptance (staging only)

**Scope:** narrow stacked Draft branch based on PR #60 exact SHA
`d96d0d64d946686d7877e1c414e4f3fd3b8106ad`.
No changes to backend API, Firebase Rules, hosting, Railway config, production,
provider integration, secrets, account records or grant semantics.

## Current live boundary

- Railway staging active Preview flag: **OFF** (rollback recorded in PR #60).
- Server source: PR #59 SHA `71e64a5d`, deployment `ecee79ff` SUCCESS.
- Existing staging Hosting UI: PR #58 code; this branch is **not published**.
- Owner final browser list: empty; explicit revoke of the last grant ID
  **not independently proven** (could have expired).
- Gate 5 signed Preview same-token replay, cross-route replay, and fresh
  token after revoke: **PENDING LIVE**, even when synthetic HTTP CI passes.

## Threat model and controls

| Failure | Mitigation |
| --- | --- |
| QA runs on non-staging or exposes history | `contextPreviewUiEnabled` staging guard plus independent `VITE_ENABLE_REFLECT_PREVIEW_GATE5_QA=true`; requires exact synthetic fixture ID **and title** already visible from owner-scoped session list |
| Unexpected API credentials or text leak | Real `getLimitedUseToken(appCheckClient)` inside closure; no display/log/store of Auth/App Check token, grant ID, source ID or response body; Preview response body is never parsed |
| Wrong App Check token accepted after replay | Reuses precisely same headers/body for each request pair; HTTP 200→401 is required; 200→200 is FAIL |
| Cross-route replay bypasses global ledger | Preview→Consent list and Consent list→Preview must each be 200→401 with token fresh per pair |
| Misclassify revoked denial as replay | After signed list verifies exact grant exists, signed revoke is issued, fresh signed list excludes it, **another fresh token** invokes direct Preview; only HTTP 403 passes (401 FAIL) |
| Revoke real session or wrong grant | No grant creation. UI permits only exact named synthetic fixture and **exactly one active grant**; dedicated confirmation checkbox for revocation; server still enforces owner, source and grant; it revokes only selected ID |
| Stale owner or stale UI | Auth UID rechecked before/after token creation and HTTP, component generation ref clears status and aborts when UID/list refresh changes; no storage, no cross-user state |
| Timeout/network/late responses | 15-second per-request AbortController, external cancellation, no silent retries; incomplete evidence is FAIL/error |
| Paid calls, quota explosion | No xAI endpoint; individual manual buttons; no loops against live quota, and 20/UID/hour tested separately with pure/emulator |
| Token leakage from DevTools | UI shows HTTP-only results; do not copy headers, HAR, Copy as cURL, action URLs or credentials. Screenshots of QA codes only |
| Multiple active grants per source | UI blocks QA until owner has **exactly one** synthetic grant; existing per-grant revoke semantics unchanged |
| Wrong Origin/malformed/unauthed/expired/cross-owner | Covered in backend synthetic HTTP and emulator tests; additionally negative smoke in controlled live gate. Browser cannot forge Origin; do not emulate with malicious origin override in signed UI |

## Exact expected HTTP contracts

| Manual button | Network sequence | Exact pass |
| --- | --- | --- |
| Same-token replay | Preview with token T1 → Preview with **T1** | 200 → 401 |
| Cross-route | Preview T2 → Consent list **T2** → Consent list T3 → Preview **T3** | 200 → 401 → 200 → 401 |
| Revoke & direct deny | Consent list T4 verifies specific ID → revoke T5 → list T6 confirms absent → direct Preview T7 | 200 → 200 → 200 → **403** |

The first two workflows read synthetic Preview via HTTP but deliberately discard the
body and do not expose history in React. No copy of the transcript appears in QA output.
Revocation is a real owner-authorized write to exactly one synthetic grant; it must
**not** be triggered until after replay acceptance, because tests need a live grant.

## Acceptance procedure (future, NOT authorized by this Draft)

1. Review code/test suite and full exact-head CI. Before publication obtain an
   **independent owner GO for Firebase Hosting staging**; build QA flag only for
   the isolated staging Firebase project and expected Railway origin. No prod.
2. Separate owner GO for **temporary Railway Preview ON**. Confirm exact source
   SHA, diff (only the one runtime flag), start/terminal SUCCESS and rollback
   deployment. Repeat negative smoke for unsigned 401, Origin 403, fake
   schema-correct tokens 401, GET 404. Unexpected 200 ⇒ STOP and rollback OFF.
3. Owner loads *existing* synthetic session, explicitly creates **one** new
   15-minute grant if empty (never auto-grant), refreshes list, manually arms
   QA. Run replay then cross-route, check actual HTTP status-only UI.
4. Owner separately checks revoke confirmation and runs direct deny; distinguish
   authentic **403** from consumed-token 401. Signed list refresh should show
   **no synthetic grants**; check other grants separately.
5. Return Preview server flag **OFF**, wait for SUCCESS, assert anonymous
   POST 404; clear local preview, refresh list, screenshot empty owner state.
   Post exact PR/SHA/deployment IDs and classify Gate 5 PASS only if every
   live critical assertion is demonstrated.

**Other checks:** Expiry boundaries, 20/UID/UTC-hour quota, simultaneous same
token, wrong-origin, schema 400, expired grant 403, foreign owner 403/404,
ledger outage fail-closed and Firestore quota cost: pure/emulator first.
Do not exhaust a live 20-call quota. CI green is not live signed acceptance.

## Synthetic tests in this branch

- `src/api/stagingPreviewGate5Audit.test.js`: exact replay headers/body,
  cross-route distinct tokens, fresh-token-after-revoke, absent grant, unexpected
  replay 200, preview OFF 404, account switch, timeout, zero response leak.
- `src/features/AISettings/StagingPreviewGate5AuditPanel.test.jsx`: opt-in only,
  no automatic calls, synthetic target, duplicate grants blocked, dedicated
  revoke checkbox, stale owner clear.
- Existing PR #60 `server/privacy/contextPreviewSecurityGate.test.cjs` covers
  backend synthetic cross-route/atomic ledger and bounded excerpts.
- Exact-head GitHub workflow runs existing backend contract plus new Vitest
  browser transport tests. **None** of these alone prove Firebase live behavior.

## Rollback

- UI is default OFF unless `VITE_ENABLE_REFLECT_PREVIEW_GATE5_QA=true` is
  expressly set in a new staging build; existing Hosting remains unchanged.
- Server Preview stays OFF unless owner separately permits temporary ON.
- Untrusted unexpected response ⇒ do not interpret as PASS; immediately
  restore Preview OFF and verify terminal Railway SUCCESS + HTTP 404.
- No automatic grant creation, no background jobs, no provider dispatch.

**Security note:** Context Preview is not consent to send any history to xAI.
AI-01L requires an independent, explicit external-transfer authorization.
