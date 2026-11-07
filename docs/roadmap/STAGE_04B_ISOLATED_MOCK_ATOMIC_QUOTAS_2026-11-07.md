# Reflect 2.0 — Stage 04B: isolated mock AI with atomic Firestore quotas

**Date:** 2026-11-07. **Status:** isolated, deliberately **nondeployable** test prototype stacked on Stage04A Draft PR #29. No paid AI, real provider, production Firebase, cloud function, API key, new user account, or browser AI switch.

## Starting point

- Stage03I PR #28: 50/50 real synthetic Firestore Rules assertions SUCCESS in isolated Auth/Firestore. Goals/moods/sessions still require only authenticated UID ownership, not strict field validation for real legacy users.
- Stage04A PR #29: 16/16 pure server-policy checks and explicit `AI_SESSION_ENABLED = false` frontend guard. The policy is not itself a transaction or a billing cap.
- Owner archived private Test user data on local machine and revealed **only** aggregate Stage03G counts. Main/released frontend and original Auth 9099, Firestore 18081, backup 18080, Vite 3100 must not be touched. Exact same UID before/after restored snapshot was not independently confirmed.

## Implementation

1. `server/ai/firestoreQuota.cjs` — Firestore **Admin** transaction on three documents in a demo-only project:
   - pseudonymous per-owner UTC-day count, recent minute timestamps, reserved token budget;
   - global per-UTC-day reserved token budget;
   - a stable SHA-256 owner+request ID ledger (stored as **hashed ID**, retained 48 hours, independent of day rollover).
   Reads occur before writes, and there is **no provider call inside a retryable transaction**. The transaction creates the ledger and updates both budgets as one atomic commit. The latest successful reservation, not a client-supplied estimate, determines whether a call may proceed. Uncommitted or denied reservations cannot trigger a response generator.
2. `server/ai/mockCallable.cjs` — simulates the **handler after** Firebase Functions v2 Auth/App Check validation. Accepts authenticated server-identity context and an App Check context, and validates per-message consent and a strict payload allowlist via Stage04A policy. Produces a fixed explicit mock message; its responder does not receive user text or other personal context. Reserves all budgets before invoking it; a repeat request ID fails. A timeout or failure leaves the reservation charged and the ledger marked failed. Provider errors are replaced by a generic error without leaking input data.
3. `server/package.json` — isolated Node 22 Admin SDK dependency. Root browser dependency graph is not changed.
4. `tests/ai/firebase.json` and `firestore.rules`: isolated `demo-reflect-stage04b` with Auth **19098** and Firestore **19082**. Its Rules deny browser access to all documents; Admin may update isolated counters. It does **not** share any original Test account or local Firestore snapshot.
5. `server/ai/integration.test.cjs` — checks actual Firestore Admin transactions against a freshly initialized test emulator; verifies a synthetic Auth Emulator ID token, denies browser reads of quota and ledger documents, checks parallel same-ID contention, two-user global budget contention, minute/day rate limits, midnight replay, provider errors, timeout, invalid result, and absence of user text/UID in quota records.
6. `.github/workflows/reflect-ai-mock-integration.yml` — stand-alone CI with pinned Firebase CLI, Node22, Java21 and the isolated Admin SDK. Checks both existing Stage04A pure contract and isolated integration, and ensures the frontend AI flag stays false.

## Security properties and explicit limitations

- These are **not** production Firebase callable functions. The Auth token is really verified against an emulator in one integration test, but `mockCallable` receives an **injected trusted context**. It does **not** cryptographically verify App Check itself. A real v2 `onCall({enforceAppCheck:true})` wrapper and App Check failure/replay integration tests remain Stage04C.
- All quota writes are genuine Firestore server transactions with a ledger. Global/day limits depend on these transactions being the only writers; privileged Admin misuse and scaling hot-spot tradeoffs require separate operational review. High contention can fail closed.
- The demo's input-token estimate uses byte length plus overhead, **not a provider tokenizer**. It is not a mathematically safe ceiling for any chosen model. An enforced monetary limit requires a verified upstream price/token accounting strategy and provider-side spending limits. Firebase/GCP budget *alerts* are not hard expenditure caps.
- The example ledger expires after 48 hours. It blocks retries across UTC-day boundaries within retention, but cannot promise permanent replay protection. No per-request message, response, profile, diary or transcript is saved to Firestore. Timestamps, hashed request identifiers and usage counts remain as privacy-relevant metadata with restricted server access.
- No external provider call, no API secrets, no Cloud Billing setup, no deployment, no real App Check, no client consent UI, no model response persisted in user history, no clinical advice or diagnosis.
- The frontend still offers `В дневник` as the existing real Firestore action. No unsupported, fabricated AI chat is exposed.

## Future Stage04C gates

1. Attach a real **v2 callable** wrapper using Firebase Auth and enforced App Check; avoid reading any diary/profile data automatically. Test missing/expired Auth, missing/consumed App Check and cross-app calls in a dedicated demo Functions/Auth/Firestore emulator.
2. Replace the mock-only estimator with an approved provider tokenizer/cost strategy; add provider-specific timeout, moderation, privacy policy, retention, applicable geography and eligibility assessment.
3. Add strict global kill switch, provider spending caps where available, independent monthly budget and monitoring; handle initial deploy quotas, rollbacks and safe request tracing **without** logging prompts/identities.
4. Approve provider and budget explicitly before provisioning any secret or generating a bill. No merge to main or production/preview releases without owner authorization.

**Evidence required:** record exact Stage04B PR head, actual count and successful isolated CI links in this handoff; keep worktree Test and Firebase untouched.
