# Reflect 2.0 — PG-04D provider context egress safety boundary (design, no release)
Date: 2026-11-22. **Status: ACTUAL SOURCE REVIEWED / NON-DEPLOYABLE DESIGN / TOCTOU NOT SOLVED.**

## Accepted evidence
- PG-04A demo 20/20 user-local unit PASS.
- PG-04B actual *local, uncommitted* `contextConsent.cjs` dual-fence fix 37/37 user-local old+new Node tests PASS; no remote staging commit.
- **PG-04C actual real Firestore Emulator** at `127.0.0.1:19085` / `--project reflect-ai-staging`, with `env -u FIREBASE_CONFIG` on CLI child: six user-reported PASS lines plus `PASS: PG04C 6/6 isolated localhost real Firestore Emulator checks`, exact synthetic per-run cleanup PASS, exit code 0. Prior `ENV_BLOCKED` superseded. The tests used Firebase Admin and no provider or live cloud data.
- `server/node_modules/firebase-admin/lib/index.js` successfully resolved from `server`; pinned `server/package.json` declares `firebase-admin: 13.4.0`. User's local `npm install --no-save --package-lock=false --ignore-scripts firebase-admin@13.4.0` was up to date, `npm` reports **8 moderate vulnerabilities**. Record for future dependency audit; do **not** blindly run `npm audit fix --force`.

## Pinned true backend source inspection (HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699`)
| Boundary | Verified behavior / source file |
| --- | --- |
| `server/ai/hostedHandler.cjs` | `createHostedHandler` calls `adapter.invoke(input.message, settings, null, evidenceV2?...)`: **third arg is unconditionally null**, so no consented past-session context is passed by this current handler. `readOwnerSettings` reads owner `aiSettings/preferences`, not historical transcript. `recovery.claim` → `budget.reserve` → `recovery.providerStarted` → provider `invoke`, retains financial reservation on failed/unknown charge, no automatic retry. |
| `server/ai/xaiProviderAdapter.cjs` | `invoke(message, interactionConfig=null, consentedContext=null, turnEvidence=null)` has an optional SERVER-ONLY M3 third arg; non-null context without interaction config is rejected before secret read/transport. This adapter itself does **not** verify Auth/App Check, permission, erasure or request-time consent. Its existence does not mean historical context is enabled in current handler. |
| `server/privacy/contextPreviewHttp.cjs` | Strict authenticated, App-Check-consumed preview; passes preview metadata and SHA256 to owner, explicitly returns `providerDispatchAllowed:false`. Preview digest is **not** provider-transfer authorization. |
| `server/privacy/contextConsentHttp.cjs` | Owner-scoped consent manage/list/revoke HTTP listener, no provider call; incoming browser cannot select UID. Pinned `contextConsent.cjs` is old; user's locally patched PG04B changes it, but remote code remains old. |
| `server/privacy/contextConsent.cjs` | Local PG04B dual-private/public-fence checks passed old+new unit and real Emulator PG04C synthetic tests. Consent is **only one gate**, not a transport permission or in-flight erasure cancellation contract. |

## Critical race: a transactionally checked consent is NOT automatically an atomic external network authorization
A `check()` transaction may return true, then erasure may create owner fence before `transport()` sends the historical context. The external HTTP POST cannot participate in the Firestore transaction. PG04C confirms final owner consent is unusable after fence, **not** that an accepted concurrent request can never reach provider after erasure begins.

**Do not implement:** `await consent.check(...); await transport(...)` and label it race-safe. Neither a second independent `check`, a time delay, a client-reported preview hash, nor a null receipt makes network dispatch atomic with erasure.

## Future candidate, needs explicit erasure-writer interoperability and acceptance testing
Before enabling context provider dispatch, define an owner-scoped, durable `erasureIntent/dispatchLease` protocol that serializes admission and the erasure lifecycle:
1. Auth + consumable App Check and paid entitlement verified server side; no client UID/provider/control flag.
2. Exact chosen session source exists and owner/source-turn identities are bound to a durable user turn. Preview snapshot hash and original grant version/scope/expiry must be checked against a **fresh source read** and immutable request identity (no silent stale preview).
3. Owner private AND public erasure fences and **erasure-intent** read in the **same transaction** as creating a bounded provider-dispatch admission/lease record. Any fence, stale consent, missing source, unknown or malformed state rejects **without creating a lease or reading/transferring historical bytes**.
4. Erasure writer must transactionally publish pending intent to stop new leases, then wait for already accepted leases to finish or explicitly cancel them before marking effective erasure. If existing active dispatch cannot be recalled from external provider, document it and distinguish `erasure-requested` from `erasure-effective`.
5. Before transport, request must own an active lease and read current erasure-intent state; if pending, abort and release safely. **A just-before-send check alone is insufficient to claim an absolute guarantee**. A provable no-egress-after-effective-erasure invariant depends on the coordinated lifecycle and no untracked transports/old replicas.
6. If provider request started or outcome unknown, conserve budget reservation and receipt idempotency; never retry automatically or treat failure as proof of no bill.
7. Provider egress only from dedicated server API and only with exact approved context size, source scope and redacted logs. Do not expose provider-selected memory or raw consent to client.
8. Mixed Railway versions (old handler unaware of admission lease), multiple replica deployment, lease expiry recovery, clock skew, abandoned requests, backup/PITR and rate limits need a separate threat model/rollout gate. **Do not use new owner-index as billing deletion authority**.

## PG-04D0 minimal precondition and acceptance path
- Document and regression-test **current OFF invariant**: hosted handler third arg to `adapter.invoke` is null; preview returns `providerDispatchAllowed:false`; owner consent endpoint cannot call provider; M3 adapter rejects unstructured non-null context. This is a narrow **source contract**, not a proof of future concurrent egress safety.
- Before any opt-in production code, user must provide locally current `server/railway/index.cjs` registration and untracked memory/session authorization code, which are not in the pinned GitHub snapshot. Do not overwrite dirty files.
- Introduce separate **PG-04D1** modeled lease-intent/erasure lifecycle and **PG-04D2** actual isolated Firestore Emulator concurrency + fake transport tests, with an enforced provider/erasure boundary. Nothing is allowed to contact real xAI.
- PG04D real provider context rollout remains **BLOCKED**, B2.1 full writer census **PARTIAL**, B2.3 privacy/billing retention **UNAPPROVED**.

**No user account erasure, no production billing writer change, no Railway deployment, no provider call or GitHub source push is authorized by this document.**
