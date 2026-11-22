# REFLECT 2.0 / PG04D4B3C3C0 — byte-verified real-source integration and Rules plan

**2026-11-22 • READ-ONLY SOURCE AUDIT COMPLETE • IMPLEMENTATION CONTRACT / NO EXECUTABLE PATCH / NO DEPLOY.**

Source hierarchy: owner terminal > exact owner-uploaded archive from dirty detached R10 backend HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699` > matching GitHub pinned files > design notes. `C3B` user genuine isolated Firebase Admin Emulator 10/10 PASS + exact cleanup/exit0; not real client Rules/Auth/consent/production certification. [Issue #136 accepted evidence](https://github.com/TheGor-365/reflect/issues/136#issuecomment-7083229492).

## 1. Provenance and local-source lock

Received owner-uploaded archive `REFLECT_C3C0_REAL_SOURCE_PREFLIGHT.tar.gz`. Independently verified ZIP/TAR format safety: exactly **12 regular members**, no links/path traversal, no unexpected members; 7 declared source SHA256 records match embedded file bytes; `HEAD.txt` matches pinned HEAD. Archive SHA256 **`fadea18afaa995fbf79211f36700a65b924651574a7683259446ba038f464f6d`** (identical to user's CLI).

| Local original file | SHA256 observed in uploaded archive | Status |
|---|---|---|
| `server/ai/memoryReply.cjs` | `2e41b4f65628ddc544c17a7e7b77fbe65a531195da3de7ebd1cf98404e3d129a` | GitHub pinned blob `972c488a9df3d43f4af15ee6390dfe62687277a3` |
| `server/ai/aiTurnRecovery.cjs` | `e717677b403e00fa7a7b5abe5820fbafdec1912ea0e0993d760ac6b022b3777f` | locally byte-pinned |
| `server/ai/hostedBudget.cjs` | `6e5c1e5e8bf7580312c8f5c8d51e7c2ecc28080da401976358d7689292e805ea` | locally byte-pinned |
| `server/ai/sessionMemory.cjs` | `4fa4e61a0d8fc898395eba30fc61e7e3cd31a6491eafc87ab84489ce09c7870a` | GitHub pinned blob `0f48870bde1f13059c9d12c8f5a63aa8ff1b717b` |
| `server/ai/contextLevels.cjs` | `4c042bac7ba623738c7e2f41bac7eb78e551b4c13e498fe96da37e9c53297c73` | source reviewed |
| `server/privacy/contextConsent.cjs` | `8b1c6e2790e49bc77982cfd5b98fadd2faa302dd0284f3cdc6280e1e1b86d738` | dirty local modification; GitHub pinned bytes differ |
| `server/privacy/memoryErasure.r103c2b.cjs` | `485757d8bd718bc31a1052e500994aa9314de46531fdb707000a1505ee088f81` | untracked local original, not on pinned GitHub backend |

`SCOPED_GIT_STATUS.txt` reports ` M server/privacy/contextConsent.cjs` and `?? server/privacy/memoryErasure.r103c2b.cjs`. **Do not replace these files with GitHub pinned versions; do not git reset/clean/add or commit user's dirty backend.**

`ROUTE_SYMBOL_LOCATIONS.txt` confirms local Railway index references the separate /v1/ai/session-memory-reply pathway (source code not included; line numbers only), consent store and sessionMemory adapters. Current **deployed** Railway flags remain UNKNOWN.

## 2. Exact seams and confirmed gaps

### Runtime / Auth and owner-action
- Actual `server/ai/memoryReply.cjs:91–188` validates a verified `request.auth.uid`, App ID, `alreadyConsumed === false`, request shape, server-preview digest, stored source turn. `contextLevel` optional canonical variants via `contextLevels.cjs`. **Do not call this "no authentication"**.
- Pinned `server/railway/index.cjs:351–363` has `verifyIdToken(token,true)`, `getAppCheck(...).verifyToken(token,{consume:true})`, and server replay ledger; private account entitlement applies under `allowProvider()` and other gates. This is GitHub-pinned route evidence, **not a byte-verified dirty local index**.
- `sessionMemory.cjs:105–124,126–195` recomputes digest from owner+request+source+message+bounded turns+context level (omitted legacy 4/1200; optimal 2/400; detailed 4/800; deep 6/1100; per-turn 300 bytes), checks consent before and after session read. **The client sends `approvedDigest` and `externalHistoryApproved: true`; there is NO server-created, one-time owner-action approval receipt in these original source files. SHA256 digest alone is not signed owner proof.**
- No real browser click/attestation trace or connected original source approval endpoint was delivered; don't claim one.

### Dispatch / budget / recovery
- `memoryReply.cjs:112,115,127,137,140,142,149,152`: first memory.authorize → recovery.claim own transaction → budget.reserve own transaction → recovery.providerStarted own transaction → final memory.authorize → provider adapter.invoke → recovery.persistReply own transaction → budget.finish own transaction (closeout exceptions swallowed). **No shared owner fence / generation / budget+attempt+lease admission TX in original memoryReply**.
- `aiTurnRecovery.cjs:168–241` receipt keyed by `uid/sessionId/sourceTurnId`; `providerStarted` marks billedPossible in separate transaction. `persistReply` changes session chatHistory and attempt receipt together but **without immutable ledger/lease**, so successful saved reply with ledger still RESERVED remains possible.
- `hostedBudget.cjs:28–147`: `reserve` has atomic flag+hashed requestLedger+owner/global quota creation *inside its own TX*, then `finish` updates ledger separately; over-reserve kill switch. Budget semantics/limits must be preserved. Do not import offline-reviewed COPY as production.
- `contextConsent.cjs:104–120,132–149,210–230`: real local version checks *both private and public* erasure markers in transaction (any existing marker denies, malformed/partial fail closed); **separate** from eventual external HTTP. Erasure request after final consent recheck can still race with FAKE network send. C3B shows a synthetic joint protocol, NOT an integrated solution.
- `memoryErasure.r103c2b.cjs:47–60` **hardcodes demo project `demo-reflect-auth-qa` and emulator host `127.0.0.1:18081`**; it is NOT a source-compatible staging/production writer. `:103–160` creates/deletes both canonical fences atomically; `:174–183` needs actual client Rules owner-write deny + consent-creation deny guards, not callbacks mocked true. `:288–320` only deletes bounded top-level memoryEvents/projections/topics and returns nested/external copies NOT audited. The current source does not establish a production generation+inFlight protocol.

### Firestore Rules exact verified pinned source (NOT user-local bytes)
`server/hosted/firestore.rules` pinned GitHub HEAD blob SHA1 **`2cc47d40020e349edc6617a2f9e03578efe39799`**. It explicitly DENIES all client read/write on `/_reflectAiPrivate/{document=**}`, but has broad owner permit:
```rules
match /artifacts/{appNamespace}/users/{uid}/{document=**} {
  allow read, write: if appNamespace == 'reflect-8fdc8'
    && request.auth != null && request.auth.uid == uid;
}
```
This **also permits** an authenticated owner to create/update/delete `artifacts/reflect-8fdc8/users/{uid}/memoryControl/erasure` and to recreate/write derived memory after erasure. The private marker cannot be mutated by client, but public marker **can**, if local Rules match pinned GitHub. Deleting public marker on its own makes server's dual-fence checks fail closed, but it breaks authoritative state integrity and must NOT be allowed. A newly added matching `allow write: if false` rule **does not override** a broader allow: Firestore Rule matches combine as OR, requiring a redesign of broad owner write rule.

**Crucial: the actual local `server/hosted/firestore.rules` path was listed but its bytes were NOT included in C3C0 archive**. Verify local Git blob hash before building Rules tests; don't silently assume GitHub version is deployed.

## 3. Implementation order / acceptance

**C3C1-R — negative client Firestore Rules tests first (RED baseline).**
1. Verify local Rules Git blob hash equals `2cc47d40020e349edc6617a2f9e03578efe39799` or collect exact local Rules bytes as separate safe source. Use a dedicated synthetic project, isolated ports, an explicit Rules file (NEVER emulator default-allow), actual client SDK identity plus Admin fixture seeding. No provider, no staging/prod Firebase.
2. Deny: unauthenticated private read/write, owner private grant/ledger/attempt/lease read/write, foreign UID original-session access, and owner create/update/delete of public `memoryControl/erasure`. Owner must also be unable to create/update/delete `memoryEvents`/`memoryProjections`/`memoryTopics` after Admin has placed the erasure marker. Before-fence normal owner session read/write and other owner basic actions must remain functional. Test nested subcollection paths and partial/malformed canonical fence state; avoid giving broad exemptions for ambiguous owner derived-data writes.
3. Current broad owner Rule should produce deliberate **EXPECTED RED** on public-fence protection and after-fence derived writes. This is *evidence of a Rules vulnerability*, not a successful gate. After full client collection inventory, create a **separate candidate Rules file** replacing broad write match with exhaustive safe scopes, and achieve all client DENY+ALLOW tests GREEN. Never patch production rules directly on these limited sources. Beware OR semantics.
4. Admin SDK bypasses Rules and must be independently tested; do not count C3B 10/10 as Rule approval. The public fence should allow owner **read only** after Admin insertion; all client writes must be server-only. Consistent with erasure only of memory-derived collections; avoid accidentally blocking unrelated retained original sessions.

**C3C2-A — server-attested explicit owner history approval.**
- Expose a **separate feature-flag OFF** server approval endpoint after `verifyIdToken(checkRevoked=true)`, AppCheck consume+replay, entitlement, exact persisted source turn/grant and two canonical fences.
- Create metadata-only private `approvalReceipts` (owner, session/sourceTurn/request, grantId, SHA256 exact message and clipped context digest, canonical `contextLevel`, source revision/generation, short expiration, nonce, unconsumed). Receipt must be minted by server in response to a distinct owner action; browser cannot create/read/consume it via Rules. The digest is a binding, not HMAC/signature.
- Joint TX consumes receipt once, rereads source+both fences+grant+owner generation and immutable hashed budget ledger+quotas+attempt/lease; all reads before all writes; replay/revoked/expired/changed source/mismatched level deny before money reservation. Owner approval and runtime route attestation are separate evidence.

**C3C2-B — transaction-composable ACTUAL dependency review and default-OFF FAKE integration.**
- Refactor original guarded `hostedBudget` into read-only `prepareReserveTx` and write-only `applyReserveTx`, preserve original quota day/token/money semantics from B3A, indexed ledger and kill switch. Refactor original `aiTurnRecovery` attempted-state/persist reply as TX composable, preserve owner-scoped answer format. Original `contextConsent` should expose transaction-safe grant/fence reads; original erasure writer needs a production-safe generation/inFlight/UNKNOWN protocol (demo hard guard must NOT be relaxed).
- `memoryReply` feature flag OFF by default; joint admission TX for approval+grant+source+2 fences+quota/ledger+attempt+lease; separate begin TX verifies generation/fences before marking potentially-billed; FAKE external adapter only; single atomic settle TX writes owner reply+attempt+ledger+lease; outcome UNKNOWN quarantined without auto retry/refund; reconcile saved reply and budget receipt after partial crashes.
- Firestore TX does **not** atomically serialize an HTTP POST. A post-begin erasure request may precede an outbound call; effective deletion must wait for inFlight/UNKNOWN resolution, or a separately designed network serialization gate. Never promise no bytes after erasure-click.

**C3C3 — actual staged proof and privacy release gates.**
- Independent REAL original-source Admin TX tests, independent REAL client Rules tests, real browser owner approval/Auth/AppCheck entitlement/replay negative tests, mixed-version old Railway worker OFF gate, fail-safe rollback, B2.1 private writer inventory, B2.3 legal retention and billing reconciliation, PG01–08; provider history, paid xAI and production ON forbidden until these pass and explicit owner release approval.

## 4. Next user action (only scoped read-only, no secrets)
From dirty backend run:
```bash
cd "$HOME/reflect-r10-railway-review"
git hash-object -- server/hosted/firestore.rules
git status --short -- server/hosted/firestore.rules server/railway/index.cjs
```
Share the hash and scoped status. **If local Rules hash differs**, share only the reviewed `server/hosted/firestore.rules` file after inspecting for secrets; do not upload `.env`, Railway credentials or private datasets. This establishes whether C3C1 test fixture may use exact GitHub rules. No need to rerun accepted C3A or C3B.

## Current phase
`C3C0=OWNER_ARCHIVE_RECEIVED+SHA/MANIFEST_12_OF_12_VERIFIED+SOURCE_AUDIT_COMPLETE`; `C3C1=RULES_NEGATIVE_TEST_PLAN_READY/LOCAL_RULES_HASH_PENDING`; `C3B=OWNER_REAL_ADMIN_10/10_PASS+EXACT_CLEANUP`; `PRIVACY_GATE=BLOCKED`. No new executable source/Rules patch, backend GitHub source push, Railway/Firebase release, provider calls or paid data traffic.
