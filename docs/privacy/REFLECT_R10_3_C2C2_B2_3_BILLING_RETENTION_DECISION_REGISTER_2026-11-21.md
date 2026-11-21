# REFLECT 2.0 — R10.3-C2C2-B2.3 billing/privacy retention decision register
Date: 2026-11-21. **Status: INVENTORY AND DECISION GATES DRAFT; RETENTION POLICY NOT APPROVED**. No deletion, TTL policy, billing migration or staging changes performed. See B2.1 writer inventory and B2.2 owner-index design.

## Why this blocks owner-index rollout
The legacy `requestLedger/{sha256("request\0"+uid+"\0"+requestId)}` and `ownerDays/{sha256("owner\0"+uid+"\0"+UTCday)}` cannot be inventoried by UID prefix. B2.2 proposed `ownerLedgerIndexes/{uid}` allows owner link lookup but becomes **new personally linkable metadata**. Billing and fraud-prevention retention can conflict with memory-only erasure; neither permanent retention nor immediate deletion can be asserted without a legal/business purpose, access and data lifecycle determination.

## Record-class registry (current-source-backed vs proposed)
| Record | Current status / source | Purpose, deletion risk | Retention / legal basis |
| --- | --- | --- | --- |
| `_reflectAiPrivate/reflect-8fdc8/requestLedger/{digest}` | Existing `server/ai/hostedBudget.cjs`; `tx.create`, later `finish` updates status; immutable **identity**, mutable status | Idempotency, charge reservation, uncertain outcome. Automatic deletion could re-enable repeat provider calls. No TTL in pinned code. | **UNDECIDED**. No guessed 30/90/365-day TTL; protect replay invariant independently of any eventual archival policy |
| `ownerDays/{digest(uid,UTCday)}` | Existing budget writer, hashed, `tx.set`; `ids:[]` | Owner count, token+money reserved, recent timestamps. May matter for audit; current day rollover handled by day hash | **UNDECIDED**, no prefix owner enumeration |
| `globalDays/{UTCday}` | Existing budget writer, shared global counter | Global spending limit; never owner-erased as if personal memory | **UNDECIDED**, independent operational retention |
| `runtimeFlags/ai` | Existing budget kill switch | Overspend emergency OFF and enabled state | Preserve until separately authorized; not subject to owner memory-only erase |
| `ownerLedgerIndexes/{uid}/requests/{digest}` and `.../days/{day}` | **NOT in live writer**, B2.2 demo/fixture/shadow only | Link a real UID to hashed billing ledger; can expose existence of requests; owner export/scope complexity | **UNAPPROVED**: purpose limitation, actor access, notice, UID lookup, migration, deletion/retention obligations and backup copies must be decided before ON |
| `_reflectAiPrivate/reflect-8fdc8/attemptOwners/{uid}/sessions/{sid}/turns/{turnId}` | Existing AI attempt-recovery private owner receipt | Distinguish pre-provider vs maybe-billable and no duplicate attempt; may contain metadata referencing source | **UNDECIDED**. Separate owner memory content vs durable billing receipt; no blanket delete |
| `contextGrants/{uid}/grants/{grantId}`, `contextConsentQuotas/{uid}` | Existing staging consent store (TTL **permission**, not physical record deletion) | Consent issue/revoke, replay prevention, 12/day. Tombstones prevent grantId reuse | **UNDECIDED** for storage, not safe to equate 15-minute access TTL with automatic purge |
| `memoryErasureFences/{uid}`, public `memoryControl/erasure` | Existing C2C1/C2C2-A demo/local erasure design, not proven deployed | Prevent memory re-creation/provider reuse, requires provenance and mismatch handling | **UNDECIDED**: memory-only erase should preserve a safe permanent-or-approved sentinel; never auto-repair mismatched legacy states |
| App Check replay fingerprints `appCheckReplayGuard.cjs` | Existing global security ledger, SHA256 token only, bounded expiration sweep | Prevent replay; not UID-addressable. Deleting it can degrade security | Govern under **security** retention, not owner memory erase |
| Firestore backups/PITR, logs/receipts, QA exports, local/browser caches, Railway storage, xAI/provider copies | Separate systems; no proof from bounded emulator cleanup | May hold metadata or full content after live deletion; independent export/deletion/restore | **UNVERIFIED** actual configuration, contracts, retention and exceptions. Do not claim physical global erasure |

## Hard design constraints
1. Memory-only erasure **does not imply** full account deletion, charge cancellation or global ledger erasure. Keep any retained record access limited and document exclusions.
2. Any proposed billing-data purge must maintain cross-day idempotency and prevent replay of historical request IDs; legal review plus independent durable anti-replay strategy must come *before* TTL or archival.
3. Proposed UID-linked owner index is private server-only. No client Firestore Rules read, no raw user messages/provider response, no raw requestId in sidecar payload. Storing UID in document path itself is still personally identifiable.
4. Existing hashed ledger alone is not a reliable owner inventory. Mixed-version Railway replicas and legacy-unindexed records prevent claims of full coverage.
5. Never infer provider-charge zero from missing cost/receipt; keep uncertain billable state and reservation until separately reconciled.
6. No provider usage or deletion/restore certification from demo synthetic smoke results.

## Decisions needed before implementation (owner/legal/ops)
| Decision | Required evidence | Current decision |
| --- | --- | --- |
| Purpose/legal basis and controller/jurisdiction for personally linkable billing metadata | Business/legal review of service terms and governing law for users and sole proprietor | **OPEN** |
| Retention duration per ledger/owner index/receipt/quota/fence | Accounting/tax/audit/security obligations and product data policy | **OPEN** (do not set TTL) |
| Erasure vs account closure exception boundaries; user notice and appeal | Privacy policy, concrete data flows, testable user experience | **OPEN** |
| Who can view/export and respond to owner data requests | Access controls, audit log, role separation, backup retrieval | **OPEN** |
| Firestore backups/PITR, Railway logs and xAI provider data handling | Actual service configuration, approved contracts and provider settings; source timestamps | **OPEN** |
| Historical unindexed ledger treatment / migration and multi-version rollout | Source release inventory, backfill correctness proof or explicit `legacy-unindexed-unknown` status | **OPEN** |
| Deletion and retention verification protocol | Owner-scoped bounded inventory + external records; distinguish reported erasure from guaranteed purge | **OPEN** |

## Next operations (safe only)
1. Inventory CURRENT private writers and configured data stores (B2.1); compare actual local files/hosted release versions and document sources, no secrets.
2. Prioritize PG-04 fail-closed consent fence. Test in isolation; do not infer the retention period while fixing consent.
3. Make explicit retention choices, then review default-OFF writer integration with **separate** synthetic Firestore Emulator TX/race tests, no stage ON.

**Status:** `B2.3_INVENTORY=DRAFT`, `B2.3_POLICY_APPROVED=NO`, `PRODUCTION_OWNER_INDEX=OFF/NOT_WIRED`, `BILLING_LEDGER_ERASURE=NOT_AUTHORIZED`.
