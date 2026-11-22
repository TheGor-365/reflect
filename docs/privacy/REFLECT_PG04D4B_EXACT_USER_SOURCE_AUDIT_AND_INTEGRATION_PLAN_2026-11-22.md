# Reflect 2.0 — PG04D4B: exact user-local consent/preview/budget/egress audit and next integration contract
**2026-11-22 • SOURCE BYTES VERIFIED; DESIGN REVIEW, NOT EXECUTABLE INTEGRATION. Historical provider history OFF, GATE_BLOCKED.**

## Exact archive provenance
User **actually uploaded** `REFLECT_PG04D4B_SOURCE_REVIEW.tar.gz` to conversation. Assistant safely opened and inspected exactly seven REGULAR relative source files, no symlinks or path traversal. Archive SHA256 `7bc64b3aa47b82ec188d51a0e344d6f27b6690f8d0d910c370ac8ff1a74fa426`. All 7 sources parse with `node --check` in isolated Node 22.16.0. Hashes:
| Current USER-local CJS | Byte SHA256 |
| --- | --- |
| `server/privacy/contextConsent.cjs` | `8b1c6e2790e49bc77982cfd5b98fadd2faa302dd0284f3cdc6280e1e1b86d738` |
| `server/privacy/sessionContextPreview.cjs` | `072fa402f4c0d272b94d5ca8b6a5fe730b5c8ba8deb85539ef21ca7f0e4562a3` |
| `server/privacy/contextPreviewHttp.cjs` | `f60a24cfeda227e31780177af223a8788c876c244a9ff6ccacc83d214a60a6b6` |
| `server/ai/hostedHandler.cjs` | `69fce4726305dfd1d6e6655b0a1a85e14ec24634eb5bb3b932567b0ae602c1eb` |
| `server/ai/hostedBudget.cjs` | `6e5c1e5e8bf7580312c8f5c8d51e7c2ecc28080da401976358d7689292e805ea` |
| `server/ai/aiTurnRecovery.cjs` | `e717677b403e00fa7a7b5abe5820fbafdec1912ea0e0993d760ac6b022b3777f` |
| `server/ai/xaiProviderAdapter.cjs` | `07250dc16fafe1dbe3b2847be9857a4e4b6e8b5b9962f0b025053fae20bbc81b84` |

All analysis below based on actual uploaded bytes, unless labelled **PINNED GITHUB**. No archive source content has been committed to the remote backend. Never claim full Railway route wiring without the user's actual dirty `server/railway/index.cjs` references.

## Source-grounded verified contracts
### 1. PG04B LOCAL contextConsent does have proper dual-fence guards
- `contextConsent.cjs:104–120` checks both `_reflectAiPrivate/reflect-8fdc8/memoryErasureFences/{uid}` and public `artifacts/reflect-8fdc8/users/{uid}/memoryControl/erasure`, fail-closed on any existing, partial, or malformed snapshot.
- `execute(... grant):122–207`: existing grant read, two fence `tx.get` **inside the same Firestore transaction** as new grant/quota create, owner session existence read, 15-minute grant TTL. `revoke` remains possible while fenced. It does **not** attest source event revision, provider preview authorization, or full owner session contents.
- `check():210–231`: also performs both fence reads + grant verification inside one `db.runTransaction`; on transaction error denies (returns false). `list():232–263` checks both fences + bounded query in same transaction; quota state and grant tombstone lifetime are separate retention questions.
- **Correction to historical status**: the old pinned source at backend commit `1c4c121e` lacked these guards; user-local PG04B-patched version **has** them, byte-verified. Still not remotely published/deployed or one-TX with future provider dispatch.
### 2. There are *two different* preview/approval contracts; do NOT pass one directly to provider
- USER LOCAL `sessionContextPreview.cjs:19–23,53–95,98–159`: reads one owner session after consent.check and repeats check after content read, shapes at most **4 turns, 700 bytes per turn, 2400 total**; returns fields `role,content,truncated,untrustedSource`, not per-turn `sourceTurnId`, and `providerDispatchAllowed:false`. `contextPreviewHttp.cjs:123–151` further authenticates owner, checks entitlement, quota, returns `previewHash=SHA256(JSON.stringify(previewData))`, `providerDispatchAllowed:false`. This digest is **not stored as an approval receipt**, and the HTTP endpoint cannot authorize provider traffic.
- **PINNED GITHUB, not included in uploaded tar** `server/ai/sessionMemory.cjs` at backend HEAD `1c4c121e`: an alternative **unconnected** server-only preview/authorize design: up to **4 turns, 300 bytes each, 1200 total**; records `sourceTurnId`, binds SHA digest to UID/sourceId/requestId/new message/source excerpt IDs+text and contextLevel, and `authorize` requires committed user turn and matching approvedDigest, rechecking consent. `server/ai/providerSessionContext.cjs` at same pinned HEAD validates this approved shape, requires `authorizedAt:"pre-egress"`, `store:false`, distinct sourceTurnId and <=300/1200. `interactionContract.cjs` consumes this form. These pinned modules' **current LOCAL modification status is not established**.
- **Critical incompatibility**: HTTP `previewHash` from user-local `contextPreviewHttp` is not the `sessionMemory.approvalDigest`. The HTTP preview lacks `sourceTurnId` and uses different byte limits. DO NOT use `previewHash` as transmission consent nor feed `sessionContextPreview` output directly into `approvedProviderHistory`. Decide on one versioned canonical owner-approved pre-egress preview contract, or explicitly re-preview and obtain a new approval.
- `hostedBudget.reserve(...trustedContextBytes)` user-local lines **46–66** accepts **at most 1200 context bytes**, further confirming the provider-context path cannot accept unaltered 2400-byte HTTP preview.
### 3. Hosted handler/budget/attempt recovery not transactionally joined to lease
- USER LOCAL `hostedHandler.cjs:75–95` validates request Auth+AppCheck/one-message consent in policy, optional recovery.claim; `:97–106` `budget.reserve`; `:114` `recovery.providerStarted` if enabled; `:115–118` `adapter.invoke(input.message,settings,**null**, ...)`; `:126/154` `budget.finish`. No grant ID, preview digest or D4A lease is read in this handler. **Provider historical context is OFF.**
- `hostedBudget.cjs:69–119` reserves owner/day/global/day and immutable **hashed requestLedger** document inside its own `runTransaction`; `:122–145` finish uses another TX, never refunds uncertain/failed reservation. No lease or erasure intent in these transactions. Future context admission cannot simply rely on an earlier independent consent.check() snapshot.
- `aiTurnRecovery.cjs:168–210`: server reads committed user message, writes metadata `attemptOwners/{uid}/sessions/{sid}/turns/{sourceTurnId}` with new `requestId,status:provider_pending` inside its own TX; `:213–223` providerStarted flips `billedPossible:true` in a separate TX. `persistReply` jointly writes owner answer + receipt `:243–275`. `publicState():107–133` and `claim():191–206` support an **explicit user-confirmed retry with a DIFFERENT requestId** even if prior `outcome_unknown`/failed-after-provider may have been billed. This is NOT an automatic retry, but under erasure/lease protocol must be separately re-authorized and cannot mark the earlier unknown event as settled.
- `xaiProviderAdapter.cjs:130–185` supports non-null context shape and transport but **does not** itself verify Auth/AppCheck/consent/erasure/budget. It calls externally injected transport with HTTP POST; no Firestore TX can make this POST atomic. No actual transport invoked during this source review.
### 4. Separated scopes
- `contextConsent` grant permits one `session-turns` source for 15 minutes, not diary/goals/all-history. Existing one-message policy consent is **different** from historical-context grant.
- Preview is a disclosure artifact, not durable provider-send authorization. ProviderSessionContext is a shape validator, not the actual owner/lease proof. Client Rules cannot protect Admin SDK calls.
- Actual memory-only erasure writer remains a local untracked DEMO source; D4A used a reviewed COPY, not live deployed code. Retained receipts, hashed ledgers, backups/provider copies and old replicas remain excluded.

## PG04D4B recommended source-specific integration design (NO PATCH YET)
1. **Freeze canonical preview** before changing handler: choose versioned authorization flow (likely `sessionMemory.preview/authorize` since it binds UID/requestId/message/sourceTurnId and satisfies 1200-byte budget/provider shape); review exact current local file and feature flag/route. Reject **all** old `contextPreviewHttp.previewHash` values as substitute approval without an explicit new preview and consent.
2. **One server-owned request identity:** `uid,requestId,sourceTurnId,sourceId,grantId,approvalDigest,sourceRevision,ownerGeneration` for the newly proposed historical send. Original one-message path remains unchanged and default historical-context OFF. Use owner source current revision/ledger head or deny if not attestable.
3. **Atomic admission and budget reservation**: design an audited transactional extension for `hostedBudget.reserve` (or fully specified durable two-phase reconciliation) so the same Firestore TX checks signed grant, both fences, owner generation, immutable hashed ledger absence, cost quota and creates a reserved lease/receipt. An independent early consent.check() plus separate budget.reserve() plus lease.begin() is NOT an atomic authorization proof.
4. **Before external transport**: beginDispatch in an owner/fence/generation TX; record potentially billed state and one-shot request/attempt receipt. A crash between TX commit and transport remains `unknown`, not auto-refund/retry. If prepare-erasure commits after dispatch-started but before actual HTTP send, erasure remains pending until outcome resolution; stronger post-click no-send guarantee requires a separately serialized outbound gateway.
5. **Failures/retries**: a budget reservation without dispatch requires durable reconciliation, no unconditional refund; `aiTurnRecovery` explicit reattempt after unknown requires new digest, grant, source/provenance, generation, budget+lease authorization; old unknown cannot be cleared on retry.
6. **Original writer integration**: canonical `memoryErasure` nonce/private/public fences remain one writer's responsibility; D4A copy pattern needs explicit source diff, full current local Auth/consent/hostedBudget, real Firestore Admin and client Rules negative tests plus old-replica OFF. No original source overwrite or Railway deploy without reviewed authorization.
7. B2.1 private writers full census and B2.3 retention/accountability/provider copying remain OPEN; PG01–08 privacy gate still BLOCKED.

## Scope and next 1–2 user actions
**NEW user archive already supplied and examined**. Do NOT ask for reupload or repeat D4A/D3F acceptance tests. For the one missing source dimension, ask only:
```bash
cd ~/reflect-r10-railway-review
git status --short -- server/ai/sessionMemory.cjs server/ai/providerSessionContext.cjs server/ai/interactionContract.cjs server/ai/contextLevels.cjs
rg -n 'createHostedHandler|createContextConsentStore|createPreviewHttpListener|createSessionMemoryAdapter|createSessionContextPreview|verifyAuth|verifyAppCheck' server/railway/index.cjs | head -90
```
This does NOT expose `.env`, API keys, prompt content, Firestore documents or full dirty Railway source. Follow with source-grounded PG04D4B implementation review and a **test-only OFF-by-default real-source consent+budget+lease negative gate** using separate synthetic project and fake transport, but only after verifying current handler/route call graph. No paid provider / source branch push / staging deploy.

## Acceptance status
- `PG04D4B=USER_SOURCE_BYTES_VERIFIED + PRE_EGRESS_INTEGRATION_DESIGN_DRAFT`.
- `PG04D4A=USER_UNIT_12/12 + REAL_FIRESTORE_EMULATOR_6/6_DIAGNOSTIC_PASS + EXACT_CLEANUP_PASS, GATE_BLOCKED`.
- `PG04D2=ORIGINAL_WRITER_EMULATOR_0/6_NOT_RUN` (frontend 18081 occupied).
- Historical provider history OFF. No live external context transferred, no billing or production change. B2.1/B2.3 and PG01–08 OPEN.
