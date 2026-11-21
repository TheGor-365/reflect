# Reflect 2.0 — R10.3-C2C2-B2.2-B1b2 / review of hostedBudget owner-index integration
Date: 2026-11-21. **Status: DESIGN_REVIEW_ONLY**. No source patch, no staging use, no provider permission, no production/staging deployment.

## Evidence already accepted
- **B1a:** User Linux imported the actual local `server/ai/hostedBudget.cjs` and passed **17/17** in-memory contract tests; `node --check` and `git diff --check` clean.
- **B1b0:** User applied fixture-only `ownerLedgerTxExtension.r103c2c2b1b0.cjs` and passed **15/15** unit tests, syntax and diff checks clean.
- **B1b1:** **New user-confirmed 2026-11-21** checksum-guarded local patch installed, `node --test server/ai/hostedBudgetOwnerIndexCompatibility.r103c2c2b1b1.test.cjs` returned **19/19 PASS, 0 FAIL** and syntax + `git diff --check` clean. The test-local AsyncLocalStorage wrapper is an experiment, **not a production integration**.
- Previous B2.2-A+B0: **35/35** combined unit PASS, synthetic local Firebase Emulator smoke PASS (owner index and read-only receipt reconciliation). No actual billing or payment.
- Pinned original source reviewed at backend HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699`: `server/ai/hostedBudget.cjs` blob `b6d847a2062a5359c2af0ec4abf510d67632dfc4`; `server/ai/hostedHandler.cjs`; `server/ai/policy.cjs`; `server/ai/xaiCost.cjs`. User earlier confirmed `git diff -- server/ai/hostedBudget.cjs` empty. This is NOT a proof of installed staging release SHA.

## Exact existing trust and billing path
`createHostedHandler` currently calls `createHostedBudget(db, projectId)` with only **2 args**. Existing budget writer:
1. `reserve()` validates UID, requestId, message length, trustedContextBytes and time; `runTransaction` reads `runtimeFlags/ai`, requestLedger SHA256 key, hashed owner/day and shared global/day.
2. It denies when global AI flag is OFF or request ledger exists. `planQuotaReservation` and `planMoneyReservation` compute limits; one transaction writes owner day (set), global day (set), **creates** request ledger: exactly **3 writes**.
3. It returns a reserved maximum `$0.01`/request, `$0.05`/owner/day, `$0.20`/global/day in 10^10 ticks/USD. Limits are staging examples, not substitute for provider-side cap or a proof of exact charges.
4. `finish()` updates only the pre-existing request ledger status; failed or unknown provider outcome never refunds reservations; over-reserve actual charge turns off `runtimeFlags/ai.enabled`.
5. Hosted handler sequence: `recovery.claim` (optional) → `budget.reserve` → `recovery.providerStarted` → provider → `recovery.persistReply` → `budget.finish` best-effort. **Never add sidecar write after `reserve`**, especially not as an asynchronous task or after provider call.
6. Global app-check token replay security ledger is separate; never delete it on memory/account erasure without its independent safety policy.

## Proposed minimal source diff — REVIEW ONLY, NOT READY TO APPLY
This is an architectural contract. It intentionally does not give an executable billing migration or live release patch.

**New trusted adapter** (different from fixture-only B1b0):
- Proposed `server/ai/ownerLedgerIndexStore.cjs`, only server Admin, exact approved staging project ID when ON, `db.projectId` match, strict validated principal and `nowMs`, schema-v1 link validators, no plaintext requestId or raw content in value fields. The B1b0 helper is hard-locked to `reflect-ai-stage-fixture01` and synthetic IDs; **do not reuse in live staging**.
- Proposed extension signature `createHostedBudget(db, projectId, { ownerIndexEnabled=false, ownerIndexStore=null }={})` with the original two-argument call remaining byte-equivalent when OFF. An ON config without a validated store must fail closed at factory creation, not silently omit index.
- Host's currently unconditional `createHostedBudget(db, projectId)` needs separately reviewed server-only wiring; never let HTTP body, app settings or client-supplied flag select ON. Preserve current provider, entitlement and consent gates unchanged.
- Exact index paths:
  ```text
  _reflectAiPrivate/reflect-8fdc8/ownerLedgerIndexes/{uid}/requests/{sha256("request\0"+uid+"\0"+requestId)}
  _reflectAiPrivate/reflect-8fdc8/ownerLedgerIndexes/{uid}/days/{YYYY-MM-DD}
  ```
  The *only* valid project namespace is `reflect-8fdc8`. Never infer document ownership from SHA-only ledger paths.
- Suggested link payload `{schemaVersion:1, ledgerKey: digest, day:"YYYY-MM-DD", createdAtMs:nowMs, purpose:"billing-idempotency", retentionClass:"billing-ledger"}` and day payload `{schemaVersion:1, ownerDayKey:digest, day:"YYYY-MM-DD"}`. These are personally linkable **private metadata** via UID path; retention and access policy not yet approved.

**Same-transaction order for ON (pseudocode, not a patch):**
```js
return db.runTransaction(async tx => {
  const indexPlan = ownerIndexEnabled
    ? await ownerIndexStore.prepare({tx, uid, requestId, nowMs}) // tx.get only
    : null;
  const [flagSnap, ledgerSnap, ownerSnap, globalSnap] = await Promise.all([
    tx.get(flag), tx.get(req), tx.get(keys.owner), tx.get(keys.global)
  ]);
  // EXACT existing validate/planQuotaReservation/planMoneyReservation;
  // fail all exceptions BEFORE sidecar or legacy writes.
  tx.set(keys.owner, unchangedOwnerDay);
  tx.set(keys.global, unchangedGlobalDay);
  tx.create(req, unchangedLedgerReservation);
  if (indexPlan) ownerIndexStore.stage({tx, plan:indexPlan}); // same TX, 1 or 2 creates
  return Object.freeze({reservedUsdTicks: spend.reserveTicks});
});
```
No reads after the first write. OFF mode exactly 3 original writes; ON fresh day 5 writes; ON repeated owner/day 4 writes. All 3+1/2 writes must commit or roll back together. A malformed marker/orphan index denies new reservation, not silently repairs or re-entitles it. Existing requestLedger blocks same requestId even if index missing.

## New safety findings and conditions
1. **Mixed-version release hazard:** old Railway replicas continue to create legacy ledger entries **without** a sidecar while new code is ON. Never assert 100% coverage by UID, even for a post-flag date, without deployment-version exclusion/attestation and an authoritative transactional rollout fence. A default-OFF source patch is acceptable for review; turning it ON requires a separate verified cutover plan.
2. **Partial recovery receipts:** `recovery.claim` precedes `budget.reserve`; a denied transaction can leave `failed_before_provider` receipt. Owner-index must not be used to infer spend or authorize retry. B0 reconciliation remains read-only and ambiguous charge state requires manual review.
3. **Retention legality:** personally linkable index values/paths create new metadata; B2.3 policy and backup/PITR exceptions not approved. Memory-only erasure must not delete legally required immutable billing IDs; full account erasure cannot be certified from this index.
4. **Erasure fence/consent gap:** current staging `contextConsent.cjs` grant issuance does not transactionally read `memoryErasureFences/{uid}`; its check/list are also not fence-aware. PG-04 remains BLOCKED; no long-term context provider enablement.
5. **Firestore safety:** no mutating Firestore SDK or emulator on the actual `reflect-ai-staging` project during design. The legacy `hosted.integration.test.cjs` uses `recursiveDelete(root)` on its dedicated fixture `127.0.0.1:19084` — do NOT run against the existing demo emulator `127.0.0.1:18081`.
6. **Document size and query coverage:** index owner subtree must be paginated/bounded, with explicit truncated/legacy-unknown flags. Sidecar is not a source of truth for charge or a complete historical index.

## B1b2 acceptance checklist before B1b3 source patch
- [x] B1a real-source baseline 17/17 PASS and B1b1 wrapper baseline 19/19 PASS (user local).
- [x] B1b0 fixture module 15/15 PASS (user local).
- [x] Design documents exact old call signature and transaction write-count parity.
- [ ] Review actual current local `hostedBudget.cjs` and `hostedHandler.cjs` for any new modifications; prior pinned SHA evidence, not live-release proof.
- [ ] Dedicated **new** server-only index store contract and default-OFF integration proposal reviewed; do not promote fixture-only helper into staging.
- [ ] Real Firestore Emulator integration: feature OFF 3 legacy writes / feature ON atomic 5/4, no cross-owner, fake txn rollback, duplicate/UTC race and broken day index; no real xAI.
- [ ] Externally authorized retention policy (B2.3), complete B2.1 private-writer census, and PG-04 staging grant/read-erasure fence fix with negative/race tests BEFORE enabling ON.
- [ ] Explicit release strategy, mixed-version protection, observability and rollback without ledger deletion, paid-call authorization separate.

**Status:** `B1b1=LOCAL_APPLIED+UNIT_PASS`; `B1b2=DESIGN_DRAFT / SOURCE_INTEGRATION_NOT_STARTED`; `B1b3=NOT_STARTED`; `PrivacyGate=BLOCKED`; `real staging/prod=NOT_DEPLOYED`.

## Next safe two user-side checks (READ ONLY)
```bash
cd ~/reflect-r10-railway-review
git diff -- server/ai/hostedBudget.cjs server/ai/hostedHandler.cjs
git status --short -- server/ai/hostedBudget.cjs server/ai/hostedHandler.cjs server/ai/ownerLedgerTxExtension.r103c2c2b1b0.cjs server/ai/hostedBudgetOwnerIndexCompatibility.r103c2c2b1b1.test.cjs
```
Return output. No patch, Firebase emulator, provider or deploy is needed for this B1b2 design review.
