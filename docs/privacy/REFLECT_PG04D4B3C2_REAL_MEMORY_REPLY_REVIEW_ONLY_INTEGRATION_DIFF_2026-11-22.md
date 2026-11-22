# Reflect 2.0 — PG04D4B3C2 review-only integration diff: actual memoryReply, approval, budget, lease and recovery
**2026-11-22 • REVIEW / ARCHITECTURAL CHANGE SET ONLY • NOT executable, not approved for `git apply`, NOT deployed.**

## 1. Entry gate: actual user tests, with scope
On user's Linux dirty detached backend `~/reflect-r10-railway-review`, HEAD `1c4c121e`, Node 22.23.4, PG04D4B3C1 source-hash-pinned additive diagnostic patch successfully installed. User ran offline `REFLECT_PG04D4B3C1_OFFLINE_ONLY=YES_SYNTHETIC` with cloud creds and Firestore host unset: **12/12 actual-source in-memory-Firestore + fake-provider diagnostics PASS (125.567852ms)**, `node --check` and `git diff --check` clean. This is **not** a real Firebase Emulator or provider test.
- Actual combined source: original `server/ai/memoryReply.cjs`, `sessionMemory.cjs`, user-local PG04B `contextConsent.cjs`, `hostedBudget.cjs`, `aiTurnRecovery.cjs`. Source pins passed.
- NEGATIVE diagnostic **`C1 EXPECTED UNSAFE: source verifies consent but late erasure fence precedes FAKE invoke`** PASS = *bug remains* in actual memoryReply ordering.
- NEGATIVE diagnostic **`C1 budget closeout failure leaves immutable reservation after REAL reply persisted`** PASS = *reconciliation is needed*. The reply+recovery receipt commit precedes budget `finish`; ledger remains `reserved` when finish fails.
- Revoked/expired grant, source edit after reserve, kill switch, possibly billed UNKNOWN, replay and partial erasure fence behaved as expected on the in-memory fake. Neither green count gives privacy-release approval.
- Earlier user PG04D4B3B **11/11 local + 7/7 real synthetic Admin Firestore diagnostics PASS** verified budget ledger **creation** and generation-bound lease in a single TX **in reviewed copies**, not the actual handler or real source-guarded consent/budget factory. Real staged/production history flag remains UNKNOWN; source defaults OFF.

## 2. Exact original source provenance and callsites
- `server/ai/memoryReply.cjs` at backend `1c4c121e0e449f1a9360e4fb4588dcf58352e699`, Git blob `972c488a9df3d43f4af15ee6390dfe62687277a3`: `createMemoryReplyExecutor` around lines 91–187; first `memory.authorize(target)` at 112, `recovery.claim` 115, `budget.reserve` 127, `recovery.providerStarted` 137, second `memory.authorize` 140, non-null `adapter.invoke` 142–147, `recovery.persistReply` 150, `budget.finish` 153, then error path `finishFailed` and `budget.finish(failed)` 177–184. Source DOES NOT import B3B lease.
- Actual user-local `server/ai/aiTurnRecovery.cjs` byte SHA256 `e717677b403e00fa7a7b5abe5820fbafdec1912ea0e0993d760ac6b022b3777f`: `claim` is a separate session+attempt receipt TX, `providerStarted` is another receipt TX, and `persistReply` atomically writes owner session reply+private attempt receipt, **but not budget ledger or lease**. `publicState` permits user-confirmed new-requestId retries following ambiguous state; previous unknown must remain outstanding and may be billed.
- Actual user-local `server/ai/hostedBudget.cjs` SHA256 `6e5c1e5e8bf7580312c8f5c8d51e7c2ecc28080da401976358d7689292e805ea`: `reserve()` reads `runtimeFlags/ai`, the SHA256 request ledger `requestLedger/{sha256("request\\0"+uid+"\\0"+requestId)}`, ownerDays and globalDays and writes quota+immutable receipt in own TX; `finish` updates ledger in another TX. **PG04D4B3A 16/16 user true-dependency parity PASS** supports a read-only `prepareReserveTx` then write-only `applyReserveTx` REVIEW COPY, not a refactor of live source.
- Actual user-local `contextConsent.cjs` SHA256 `8b1c6e2790e49bc77982cfd5b98fadd2faa302dd0284f3cdc6280e1e1b86d738`: checked both private and public canonical erasure fences inside grant/check transaction; `check()` is still separate from memoryReply's HTTP send and budget reservation.
- Pinned `sessionMemory.cjs` blob `0f48870bde1f13059c9d12c8f5a63aa8ff1b717b`: `authorize()` recomputes `digestFor` against actual committed current turn and compares with **client-provided `approvedDigest`**, with repeated `consentStore.check`. **This is NOT a cryptographic signature and NOT an independently persisted server-attested user approval receipt.** `sessionMemory` is source-bound and fail-closed, but the approval event and one-time consumption have no durable server-proof object in this source.
- Pinned `contextLevels.cjs` blob `a4ec57a7cafd02e88e588913773420c91eb63721`: legacy omitted level 4 turns/1200 bytes; `optimal` 2/400, `detailed` 4/800, `deep` 6/1100. `sessionMemory` turns <=300 bytes each. The synthetic B3B `validateArgs` currently **rejects all explicit `contextLevel`**. Never claim B3B already supports current v3 approval schema. Legacy HTTP `contextPreviewHttp.previewHash` up to 2400 bytes is a **different disclosure-only hash**, not a provider send receipt.
- Original real erasure writer `memoryErasure.r103c2b.cjs` SHA256 `485757d8bd718bc31a1052e500994aa9314de46531fdb707000a1505ee088f81`; D4A only reviewed COPY. Source hard-codes original test frontend port 18081 occupied by R9.2; **PG04D2 original real Emulator 0/6 not run**. No source guards should be weakened.
- Dirty `server/railway/index.cjs` user scoped `rg` confirmed `REFLECT_AI_SESSION_MEMORY_REPLY_ENABLED==="yes"` conditional route at 259–260/409–411/454. The actual deployed variable is **UNKNOWN**, source default OFF. Do not claim staging provider history definitely OFF from `hostedHandler(...,null)`: the memoryReply route is distinct.

## 3. REVIEW-ONLY pseudo-diff at actual memoryReply seam — not a patch
The following is a **non-executable interface-level diff** of the existing call sequence, not a complete source edit. Names `approvalReceipts` and `jointDispatch` DO NOT exist in the current repository. **DO NOT `git apply`, wire in Railway or turn on history from these fragments.**

```diff
--- a/server/ai/memoryReply.cjs (existing — source observed)
+++ b/server/ai/memoryReply.cjs (PROPOSED INTERFACE ONLY — NOT IMPLEMENTED)
@@ createMemoryReplyExecutor / handleMemoryReply
  const target = { principal, sourceId, grantId, requestId, message,
                   approvedDigest, contextLevel };
- let checked = await memory.authorize(target);
- attempt = await recovery.claim({ uid, sessionId, sourceTurnId, requestId,
-                                  message, retryConfirmed: false });
- await budget.reserve({ uid, requestId, message, nowMs: clock(),
-                        structured: true, trustedContextBytes: checked.totalBytes });
- const settings = settingsForCommittedTurn(await readSettings(uid), attempt);
- await recovery.providerStarted(attempt);
- checked = await memory.authorize(target);
- providerAttempted = true;
+ const initialContext = await memory.authorize(target); // still useful; not a TX lock
+ const userApproval = await approvalReceipts.verifyServerAttested({
+   uid, sessionId, sourceTurnId, requestId, grantId, approvedDigest,
+   contextLevel: envelope.contextLevel
+ });
+ const admission = await jointDispatch.claimAttemptAndReserveBudgetAndLeaseTx({
+   target, userApproval, initialContext /* NEVER trust its cached source alone */,
+   nowMs: clock()
+ }); // ONE Firestore TX: read current SOURCE+grant+BOTH fences+owner gen
+       // +approval one-time receipt+runtimeFlag+quota+ledger absence+replay;
+       // validate real source digest/context level/owner; write attempt claim,
+       // hashed immutable budget ledger, quota, lease and consumed receipt.
+ const settings = settingsForCommittedTurn(await readSettings(uid), admission.attempt);
+ const checked = await memory.authorize(target);
+ const started = await jointDispatch.beginDispatchTx({
+   uid, requestId, admission, checked
+ }); // RECHECK in one TX: source/grant/approval/fences/owner gen/ledger/receipt;
+       // mark attempt billedPossible + lease inFlight before external transport.
+ // Do not refund when begin or downstream outcome is ambiguous.
  const reply = await adapter.invoke(input.message, settings, {
      sourceId: envelope.sessionId, requestId: input.requestId,
      authorizedContext: checked
- }, evidenceV2Enabled ? { sourceTurnId: attempt.sourceTurnId,
-                         evidence: attempt.evidenceSnapshot } : null);
- await recovery.persistReply(attempt, reply);
- await budget.finish({ uid, requestId, status: "completed",
-                       nowMs: clock(), actualUsdTicks: reply.actualUsdTicks });
+ }, evidenceV2Enabled ? { sourceTurnId: admission.attempt.sourceTurnId,
+                         evidence: admission.attempt.evidenceSnapshot } : null);
+ await jointDispatch.commitReplyReceiptBudgetAndLeaseTx({
+   started, reply, actualUsdTicks: reply.actualUsdTicks, nowMs: clock()
+ }); // ONE TX must atomically persist owner reply+attempt receipt,
+       // ledger closeout, over-reserve kill switch, and lease settlement.
@@ error/recovery
- await recovery.finishFailed(attempt, { beforeProvider: !providerAttempted, error });
- if (reserved) await budget.finish({ uid, requestId, status: "failed", nowMs: clock() });
+ await jointDispatch.quarantineOrFailBeforeStartTx({
+   admission, startedIfKnown, error, nowMs: clock()
+ }); // if begin may have committed: UNKNOWN, no TTL auto release/retry/refund;
+       // if provably no begin and no provider invocation, conservatively
+       // reconcile an unused pre-reserved receipt under explicit rules.
```

**Important:** even with a correct `beginDispatchTx`, an external POST may begin **after** erasure intent commits if `begin` committed first. Firestore TX and network POST are NOT atomic. This protocol can guarantee *no effective erasure completion while inFlight/unknown* if every writer obeys it; it cannot guarantee *no outbound bytes after erasure-click* without a separately designed serialized outbound gateway. Do not promise the stronger guarantee.

## 4. Implementation change order (explicit source approval before changing live code)
**C2A: approval attestation + source/fence contract.** Add a server-only approval-receipt creation/consumption workflow initiated by a distinct user action under Auth+AppCheck+entitlement; store metadata only (UID, sessionId, sourceTurnId, requestId, grantId, canonical approvalDigest, committed message digest, source revision, contextLevel, expiry, status, one-time nonce/id). The private receipt cannot be written by client Rules. If a **cryptographic signature** is explicitly required, specify keyed signature/HMAC and key rotation; current SHA digest alone is NOT a signature. Source content remains in owner-scoped session, not private receipt.

**C2B: transaction-composable source adapters.** Review changes to REAL stage-only guarded `hostedBudget`, `contextConsent`, `aiTurnRecovery`, original writer, and B3B coordinator. Full budget calculations must match accepted B3A parity while executing all Firestore reads before writes. Single canonical request identity across durable attempt, immutable ledger, grant/approval receipt, lease, source revision and erasure generation. Do not load B3A OFFLINE-only or B3B synthetic-only factories as live dependencies.

**C2C: safe dispatch and settlement.** In new default-OFF source-reviewed memoryReply path use joint `claim+reserve` and `begin`, then FAKE provider, then atomic `persistReply+attempt+budget ledger+lease` outcome. On persisted reply + unclosed ledger, do NOT clear unknown or issue new paid call: reconcile with persisted owner answer/attempt and immutable ledger. On crash after begin but before network, remain conservatively possibly billed until reconciliation. All readers/writers must enforce the same source/revocation/erasure generation fence, including older Railway replicas; default OFF until migrated.

## 5. Required NEGATIVE acceptance matrix before historical context ON
1. Approval receipt absent, duplicated, expired, client-forged, different uid/request/session/turn/message/grant/digest, or legacy 2400-byte preview hash: **deny before any reservation**.
2. Validate all `contextLevel` variants and legacy omitted level at 2/400, 4/800, 6/1100, and 4/1200 bytes respectively (turn clipping at 300). Source modified after preview/after admit/after reserve before begin, or missing committed current turn: **deny**; retain possibly reserved budget correctly.
3. Grant expired/revoked after approval, after admission, or before begin; one-sided/malformed canonical erasure fence: **deny**, no new outbound transport.
4. Owner generation changes between admission/begin; cancel cannot resurrect reserved lease; concurrent `prepare` vs budget CREATE/admit/begin serializes under true Admin Firestore Emulator; partial transactions roll back quota+ledger+lease+receipt together.
5. Duplicate requestId, different leaseId for same request, retry after unknown with different requestId; durable old UNKNOWN quarantines provider-history until explicit settlement, no automatic paid retry/refund.
6. Budget disabled, missing flag, owner/day/global cap, UTC date rollover, cost over-reserve kill switch, immutable ledger status and multi-owner isolation; refactored code must match original `hostedBudget` semantics.
7. Crash simulations: before admission; after joint reserve before begin; after begin before HTTP; after HTTP with unknown outcome; after reply+attempt persist but before ledger closeout. Either settle atomically or keep durable uncertainty, never give a false completion.
8. Actual source (not just reviewed copies) Auth token revocation + AppCheck replay/owner entitlement; separate client **Firestore Rules DENY** access to grants/ledger/leases/private approval and public erasure mutation.
9. Old and new Railway replicas with mixed release; historical egress remains hard OFF until all workers implement gate; rollback preserves old ledger and unknown quarantine. Test external provider only with separate explicit approval after legal/retention decisions.
10. B2.1 private writer census, B2.3 provider/history copy/backup/immutable ledger retention and PG01–08 full privacy gate must be cleared. PG04D2 original writer's genuine test remains `0/6` because frontend owns localhost18081; do not hijack it.

## 6. Status and next executable work item
- **PG04D4B3C1=USER REAL-SOURCE IN-MEMORY DIAGNOSTIC 12/12 PASS; TWO NEGATIVE GAPS CONFIRMED.**
- **PG04D4B3B=USER 11/11 UNIT + 7/7 REAL SYNTHETIC ADMIN EMULATOR PASS** in reviewed copies; GATE_BLOCKED.
- **PG04D4B3C2=REVIEW-ONLY CHANGE DIFF AND ACCEPTANCE CONTRACT PREPARED; NO executable patch, no validation of new code, no source changes.**
- **NEXT PG04D4B3C3**: implement *additive, guarded, OFF-by-default reviewed-copy* approval receipt and atomic attempt+budget+lease composer, starting with a failing/negative source-level test. Then user true-source unit and isolated Admin Emulator+FAKE; do not modify original `memoryReply`/Railway until explicit reviewed diff and approval. Do not repeat previously accepted B3C1/B3B diagnostics.
- Original program files, real user data, source branch and Railway unchanged; deployed `REFLECT_AI_SESSION_MEMORY_REPLY_ENABLED` state unknown. `PRIVACY_GATE=BLOCKED`.
