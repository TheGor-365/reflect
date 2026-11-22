# Reflect 2.0 — PG04D4B3C3A additive synthetic approval receipt + one-TX attempt/budget/lease reviewed candidate
**2026-11-22. PATCH PREPARED / AUTHOR TEMPORARY-STUB UNIT 18/18 PASS / USER TRUE SOURCE TESTS NOT RUN / FIRESTORE ADMIN NOT RUN / GATE_BLOCKED.**

## Accepted entry evidence
- PG04D4B3C1 user actual original-core FakeFirestore/FAKE provider 12/12 diagnostics PASS, including TWO deliberately **unsafe release conditions**: late erasure fence after final consent read still allows fake invoke, and reply persisted while hashed ledger stays reserved if budget closeout fails.
- PG04D4B3B user 11/11 true-source Node + 7/7 real isolated Admin Firestore diagnostic PASS after six-new-file patch; **this is reviewed synthetic budget/writer COPY**, not real memoryReply source or client Rules.
- PG04D4B3C2 non-executable method-level integration change contract published, commit `2b98a253a4648f9465b6efc30aa355dc8c6cb731`. C3A is the first *additive reviewed test candidate*; not a source edit or code deployment.

## New code artifact and immutable checksum
- **Patch filename**: `REFLECT_PG04D4B3C3A_APPROVAL_JOINT_ATTEMPT_BUDGET_LEASE_2026-11-22.patch`
- **Patch SHA256**: `059d8d976fce7f6a583c97e01ee080dd118a2e5307df3abb25f4d19e30a71e9a`
- **Delivery ZIP**: `REFLECT_PG04D4B3C3A_APPROVAL_JOINT_GATE_DELIVERY_2026-11-22.zip`, SHA256 `1775a6a0ad7cc209964545979389a55a61b397ab5382389622e859d875cf6c62`.
- Exactly **THREE new files**, no replacements:
  1. `server/ai/pg04d4b3c3ApprovalJointGate.cjs` — reviewed synthetic-only approval receipt and attempt+budget+lease gate;
  2. `server/ai/pg04d4b3c3ApprovalJointGate.test.cjs` — source-hash-pinned **18** in-memory fake Firestore unit diagnostics;
  3. `docs/privacy/REFLECT_PG04D4B3C3A_APPROVAL_RECEIPT_JOINT_BUDGET_ATTEMPT_LEASE_OFFLINE_2026-11-22.md` — local detailed runbook.
- Code patches are generated as downloadable artifacts **in this ChatGPT turn**, **NOT committed to the backend source or deployed in Railway**. This GitHub artifact is documentation only.
- Direct source hash test pins from accepted user sources: `hostedBudget.cjs` SHA256 `6e5c1e5e8bf7580312c8f5c8d51e7c2ecc28080da401976358d7689292e805ea`, `aiTurnRecovery.cjs` SHA256 `e717677b403e00fa7a7b5abe5820fbafdec1912ea0e0993d760ac6b022b3777f`, `contextConsent.cjs` SHA256 `8b1c6e2790e49bc77982cfd5b98fadd2faa302dd0284f3cdc6280e1e1b86d738`, B3B reviewed planner `pg04d4b3bBudgetEmulatorCopy.cjs` SHA256 `16ab690b14bcf2161ed6366019249f9932f72e68999c7d8bc728b253a466d1d5`, pinned Git source blobs `sessionMemory.cjs` `0f48870bde1f13059c9d12c8f5a63aa8ff1b717b`, `contextLevels.cjs` `a4ec57a7cafd02e88e588913773420c91eb63721`. `SOURCE_MISMATCH` is a STOP; never bypass it.

## Current test-only capabilities
- Requires exact synthetic Firestore project `reflect-pg04d4a-synthetic` and host `127.0.0.1:19087`, both explicit `REFLECT_PG04D4B3C3_EMULATOR_ONLY=YES_SYNTHETIC` and `REFLECT_PG04D4A_EMULATOR_ONLY=YES_SYNTHETIC`, cloud credential env vars ABSENT; dependent B3B planner separately requires `REFLECT_PG04D4B3B_EMULATOR_ONLY=YES_SYNTHETIC`. Defaults OFF. No xAI HTTP, Firebase SDK or live route import in this module.
- `approve(x, principal)`: calls a **MANDATORY injected `verifyOwnerApproval` mock callback** after checking synthetic principal Auth/AppCheck flags. Then a Firestore TX checks actual-format scoped grant, BOTH canonical erasure fences, current committed owner-scoped source+contextLevel/digest, owner generation and one-time receipt absence; creates a private, metadata-only and short-expiry `issued` receipt and server-generated random id. No transcript stored in receipt.
- `admit(x, receiptId)`: one Firestore TX validates consent/source/receipt/owner/generation/replay/missing attempt, calculates **trustedContextBytes server-side** via actual `sessionMemory.boundedPreviousTurns`, reads real original-formula B3B reviewed budget runtime/quota and existing immutable ledger absence via planner, then atomically creates immutable hashed budget ledger, quota counters, one original-format attempt receipt, synthetic owner generation-bound lease and consumes approval. **All reads before writes**; rollback of Firestore transaction leaves none of those new documents.
- `begin(x, receiptId)`: rechecks source, receipt, consent, BOTH fences, generation, immutable ledger and budget kill switch, marks lease started/inFlight and attempt `billedPossible=true` in one TX before FAKE transport could run. No HTTP invocation is owned by module.
- `settleSuccess(x, receiptId, FAKE reply)`: one TX reads and verifies session/approval/attempt/lease/ledger and updates only owner session answer, persisted attempt metadata, completed budget ledger, over-reservation kill switch and lease settlement **together**. A failed/rolled-back transaction cannot leave answer persisted with unclosed budget; if the erasure fence appeared after begin, this operation denies writing reply; explicitly resolve as UNKNOWN.
- `settleUnknown`: retains immutable budget reservation, increments unknownCount, keeps erasure pending; supports an *already-started* lease from a prior owner generation after the erasure writer advanced generation and fenced. Conservative unknown prevents new owner approval.
- Source contexts: actual legacy omitted level 4/1200; `optimal` 2/400; `detailed` 4/800; `deep` 6/1100, per-turn maximum 300 bytes, version-sensitive digest. **Old 2400-byte HTTP preview hash is not used**.

## Author QA versus USER and Emulator QA
- Author completed **18/18 OFFLINE smoke PASS** on temporary substitute `sessionMemory/contextLevels/policy/xaiCost/xaiContract`, with exact original `hostedBudget/contextConsent/aiTurnRecovery` present in scratch workspace. Hash assertions were removed **ONLY from that separate smoke copy**; delivered patch retains strict expected hash checks. **Not a genuine original-source functional pass.**
- Fresh Git worktree with prior B3B prerequisites: `git apply --check`, `git apply --whitespace=error`, `git diff --check`, `node --check` two new CJS PASS; exactly three added paths. ZIP CRC integrity verified. No Firebase SDK/Emulator run for C3A.
- **USER PATCH NOT YET APPLIED, TRUE-SOURCE 0/18 NOT RUN; new C3A real Firestore Emulator NOT RUN**. Next B3C3B is isolated real Admin+FAKE test gate, only after accepted user true-source result.

## Explicit no-go / blockers
1. The `verifyOwnerApproval` callback is a **test seam**, not a verified user click, Auth/AppCheck route, KMS signature or externally trustworthy proof. Original client-supplied SHA256 `approvedDigest` is not a signature. **The receipt does NOT become a true user-approval certificate until the trusted server route and client action are independently reviewed.**
2. C3A is **NOT imported by original `memoryReply`**, `sessionMemory` or `aiTurnRecovery` and original stage-only `hostedBudget`, `contextConsent`, original erasure writer, dirty Railway index and frontend R9.2 18081 are untouched.
3. The B3B quota planner is a reviewed **synthetic COPY**; original real stage-only project guard must not be weakened. C3A original-format attempt record is produced by a new helper, not by calling real `aiTurnRecovery`; retries after UNKNOWN are intentionally MORE restrictive. Genuine migration to existing receipts must be audited.
4. Firestore transaction cannot atomically include external provider HTTP POST. A send can occur after erasure request if its begin transaction already committed; C3A only preserves inFlight/UNKNOWN and defers effective erasure. No zero-post-click-bytes guarantee; outbound gateway needs separate design if required.
5. Still OPEN: actual Auth/AppCheck + replay, private-client Firestore Rules negative tests (prior Emulator config default allow), real writer source Emulator 0/6 due frontend port18081, old Railway replica safety, B2.1 private writer census, B2.3 provider/backups and hashed receipt retention, PG01–08 privacy-release gates. Actual deployed history reply flag UNKNOWN, source default OFF. **PRIVACY GATE BLOCKED**.

## Next user — two steps
1. Download B3C3A .patch, verify SHA256 `059d8d976fce7f6a583c97e01ee080dd118a2e5307df3abb25f4d19e30a71e9a`, then `git apply --check` / `git apply --whitespace=error` to user's **dirty detached** `~/reflect-r10-railway-review`, no reset/clean, only 3 new files.
2. Run source-pinned offline fake Firestore tests using exact synthetic flags as detailed in included privacy runbook; expect **18 diagnostic tests**, not yet user-confirmed. At any `SOURCE_MISMATCH` STOP, don't change protected source or test hash.
After user output: B3C3B real isolated Admin Firestore+FAKE tests and exact per-run synthetic cleanup, preserving original port18081, then B3C4 reviewed original `memoryReply`+auth+receipt migration change control. No real provider or deployment authorization.

**Checkpoint:** `PG04D4B3C1=USER_ACTUAL_CORE_DIAGNOSTIC_12/12_PASS (two negative gaps)`; `PG04D4B3C2=REVIEW_ONLY_DIFF_COMPLETE`; `PG04D4B3C3A=PATCH_PREPARED+AUTHOR_STUB_SMOKE_18/18+USER_TRUE_SOURCE_0/18_PENDING+REAL_ADMIN_EMULATOR_NOT_RUN/GATE_BLOCKED`.
