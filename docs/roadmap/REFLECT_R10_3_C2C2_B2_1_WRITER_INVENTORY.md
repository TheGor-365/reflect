# Reflect 2.0 — R10.3-C2C2-B2.1 PRIVATE WRITER INVENTORY (DRAFT)
2026-11-21 • Status: READ-ONLY DISCOVERY / NOT ACCEPTED • remote source baseline 1c4c121e0e449f1a9360e4fb4588dcf58352e699; dirty LOCAL overlay not available via GitHub.

## Evidence
A. User terminal 2026-11-21 `rg -n '_reflectAiPrivate|attemptOwners|requestLedger|ownerDays|contextGrants|...'` in `~/reflect-r10-railway-review` (local overlay, HEAD 1c4c121e). This finds references but does not prove write semantics.
B. Authoritative *remote pinned* file reads from GitHub 2026-11-21. These files might differ from dirty local `server/railway/index.cjs` and untracked R10 `server/memory/*` / `server/privacy/*`.
C. B1 local tests 45/45 PASS and real synthetic Emulator smoke PASS, **not global retention coverage**.

## Pinned remote writer matrix (NOT CURRENT LOCAL CERTIFICATION)

| ID | Writer / path under _reflectAiPrivate/reflect-8fdc8 | Current confirmed behavior from pinned source | Owner query / retention gap |
|---|---|---|---|
| BW-01 | `server/ai/aiTurnRecovery.cjs`: `attemptOwners/{uid}/sessions/{sid}/turns/{sourceTurnId}` | creates/updates per-turn metadata receipt within transactions; assistant turn also committed to owner session | UID-addressable; B1 bounded descendants scan. Receipt persistence policy unknown |
| BW-02 | `server/ai/hostedBudget.cjs`: `requestLedger/{SHA256("request\\0"+uid+"\\0"+requestId)}` | create immutable reservation identity, later status/charge update; explicitly **NO TTL**, prevents repeated provider billing | **NOT owner-prefix addressable**; no global removal/retention plan. Don't delete or weaken idempotency |
| BW-03 | `server/ai/hostedBudget.cjs`: `ownerDays/{SHA256("owner\\0"+uid+"\\0"+day)}` | transactionally updated owner per-day quota/money counters | **NOT owner-prefix addressable**; retention unknown |
| BW-04 | `server/ai/hostedBudget.cjs`: `globalDays/{UTCday}` and `runtimeFlags/ai` | transactional global quotas and emergency disable flag | GLOBAL, not a deletable UID object; exclude from owner erasure certificates |
| BW-05 | `server/privacy/contextConsent.cjs`: `contextGrants/{uid}/grants/{grantId}` | grant create; explicit revoke tombstone maintained; 15-min *active consent TTL* | UID-addressable; **grant expiry ≠ storage purge**. Verify server-side fence in dirty current work |
| BW-06 | `server/privacy/contextConsent.cjs`: `contextConsentQuotas/{uid}` | create/update daily consent issuance quota | UID-addressable; B1/A saw leftover quota but retention not proven |
| BW-07 | `server/privacy/contextPreviewQuota.cjs`: `contextPreviewQuotas/{uid}` | create/update hourly preview quota | UID-addressable; **not currently included in B1 private scan**, retention unknown |
| BW-08 | `server/railway/appCheckReplayGuard.cjs`: `appCheckReplayTokens/{SHA256(rawToken)}` | create token fingerprint with expiresAt, bounded opportunistic cleanup by expiresAt, 64-at-time; prevents replay | NOT UID-addressable; token-based global security ledger; cleanup is not guaranteed schedule or account erasure |
| BW-09 | `server/ai/stagingEntitlement.cjs`: `entitlements/{uid}` | **reader** observed; writes must be located in Admin provisioning/ops code | Owner-scoped data exists, retention/writer provenance unverified |
| BW-10 | `server/railway/index.cjs`: `runtimeFlags/ai` | **reader** in pinned code, dirty local modifications present | Inspect local diff before assumptions |
| BW-11 | LOCAL `server/memory/memoryAttestationQuota.r103c1.cjs`: `memoryAttestationQuotas/{uid}` | path reported by user terminal; not in remote pinned source | Need local source and txn write inspection; quota survives erasure in prior QA |
| BW-12 | LOCAL `server/privacy/memoryErasure.r103c2b.cjs`: `memoryErasureFences/{uid}`, context grants, memory quota | paths reported by user, synthetic tests previously PASS | Need exact local transaction/write implementation and legacy recovery policy |
| BW-13 | LOCAL `server/privacy/demoMemoryConsentAdmission.r103c2b2.cjs`: fence and grant refs | local read refs reported by user | Need exact local write/read classification, DEFAULT-OFF and demo constraints |
| BW-14 | B1 `memoryPrivateRetention.r103c2c2b.cjs`, A/C1 auditors | read-only audit tools by design, but inspect actual current source | Bounded/unpaginated scans, never deletion proof |

## Important distinctions
1. Some entries are **readers** or **metadata** only. Presence in rg is not evidence of write or a user-visible stored record.
2. Legacy consent expires after 15 minutes for authorization, but a document may persist. Do NOT mistake an expiresAt or a quota reset for a Firestore retention guarantee.
3. `requestLedger` uses a one-way keyed-by-value hash but not a secret HMAC; it is not queryable by UID and cannot be safely exhaustively erased by scanning one user path. No owner index is present in pinned source. Consent tombstones and billing ledger have distinct compliance needs.
4. `appCheckReplayTokens` is global token-fingerprint state and gets opportunistic cleanup only; deleting security replay state can undermine the replay defense.
5. Firestore Admin SDK bypasses client Firestore Rules; all Admin writer paths must enforce trusted principal/fence themselves.
6. B1 proven `owner-scoped orphan receipt + consent tombstone` detection doesn't certify `requestLedger`, `ownerDays`, backups/PITR, appCheckReplayTokens, logs or provider copies.
7. Do not assert staging deployment, account-wide export/erasure, or production-safe enumeration.

## Next evidence request (read-only, no secrets)
On LOCAL backend worktree, inspect actual writes, guard preconditions and new R10 code:
```bash
cd ~/reflect-r10-railway-review
git status --short
rg -n 'tx\\.(set|update|create|delete)|batch\\.(set|update|create|delete)|\\.(set|update|create|delete)\\(|runTransaction\\(|_reflectAiPrivate|requestLedger|ownerDays|attemptOwners|contextGrants|appCheckReplayTokens|contextPreviewQuotas' server/ai/{hostedBudget,aiTurnRecovery,stagingEntitlement}.cjs server/privacy/{contextConsent,contextPreviewQuota,memoryErasure.r103c2b,demoMemoryConsentAdmission.r103c2b2}.cjs server/memory server/railway/{appCheckReplayGuard,index}.cjs --glob '*.cjs' --glob '!*.test.cjs'
```
Avoid printing live env files, secrets, credentials, private Firestore documents, source transcriptions or provider payloads. After classification B2.1 needs a source verified writer catalog and explicit coverage gaps, then B2.2 propose owner-addressable *metadata* reconciliation without violating billing/replay idempotency. No write patch until reviewed.

## Acceptance criteria for B2.1
- Every server-private collection that is actually written or read classified: writer, owner scope, data categories, lifecycle/retention, index strategy, deletion exception;
- actual local dirty code examined, not just pinned SHA or rg;
- metadata redaction and no unbounded provider/history access;
- exact known gaps/negative tests and policy blockers;
- status updated to B2.1 ACCEPTED only after evidence and user confirmation.

## Verified CURRENT LOCAL source excerpts — user terminal, 2026-11-21 (B2.1 PARTIAL)

Evidence: user supplied read-only `sed` and `git diff -U3 -- server/railway/index.cjs` from the dirty `~/reflect-r10-railway-review` worktree, pinned HEAD `1c4c121e`; pasted output is exact local source up to `memoryErasure.r103c2b.cjs` line 300, NOT beyond it. This evidence supersedes assumptions in pinned remote source for the following four files.

| Source | Local evidence | Consequence/status |
|---|---|---|
| `server/memory/memoryAttestationQuota.r103c1.cjs` | `STAGING_PROJECT = reflect-ai-staging`; method `consume(uid)` uses `db.runTransaction`, reads `memoryAttestationQuotas/{uid}`, then `tx.update` or `tx.create` with `{uid,hour,count}`, cap 6/hour; no explicit record expiry field or deletion in displayed module. | **LOCAL VERIFIED WRITER**, owner-addressable metadata; physical retention unknown. Module constructor checks supplied `projectId`, but in supplied excerpt does not independently compare `db.projectId` — review environment binding and tests before real deployment. |
| `server/privacy/memoryErasure.r103c2b.cjs` | `enabled=false` default; rejects non-`demo-reflect-auth-qa` project and emulator host other than `127.0.0.1:18081`; `prepare` atomically `tx.create` public `memoryControl/erasure` and private `memoryErasureFences/{uid}`, records nonce hash and pending state. `cancelPending` atomically deletes both fences only before confirmation and before any work. `confirm` transitions to `revoking` after independent owner/consent guards; `step` revokes up to 20 active grants and deletes from owner memory collections in subsequent pages. | **LOCAL VERIFIED DEMO WRITER + scoped erasure**, not an HTTP handler or production-safe account deletion. Source excerpt ends inside `step` at line 300; remaining code, finishing status and all paths NOT YET VERIFIED. Nested/orphan descendants excluded by known erasure scope. |
| `server/privacy/demoMemoryConsentAdmission.r103c2b2.cjs` | `enabled=false` default and isolated demo project/host. `issue` requires trusted-like principal and reads private fence in **same Firestore transaction** before checking existing grant/source and `tx.create` for `contextGrants/{uid}/grants/{grantId}`; TTL of active grant 15 minutes. | **LOCAL VERIFIED DEMO CONSENT WRITER**, independent fence race gate. It does not prove current `server/privacy/contextConsent.cjs` (staging) has an equivalent in-transaction fence read. Grant authorization TTL != storage purge. |
| Dirty `server/railway/index.cjs` | Exact diff introduces `REFLECT_MEMORY_ATTESTATION_ENABLED === "yes"`, default OFF; requires existing `enabled && valid && consentEnabled`, constructs quota and lazy attestation route from `server/memory/*`, reuses `verifyAuth`, `verifyAppCheck`, `authorizeAccount`, exact route `/v1/privacy/memory-attest`. | **LOCAL VERIFIED ROUTE WIRING, NOT DEPLOYED**, not direct proof of auth behavior or provider egress. A new quota write is possible when explicitly enabled in staging. Review route's consumption order and reject/error tests before production. |

### Findings that need correction or design decisions
1. **Critical privacy gate:** The demo-only `demoMemoryConsentAdmission` reads the erasure fence transactionally. The older pinned staging `contextConsent.cjs` grant writer has no demonstrated equivalent check, and the new attestation route is not proof of it. Treat production consent after erasure as **UNVERIFIED**, deny new provider use until independently proven.
2. **Quota persistence:** `memoryAttestationQuotas/{uid}` survives memory-only erasure in earlier QA; do not infer TTL from a per-hour counter. Clarify privacy policy/retention and export/reconciliation scope.
3. **Exact erasure tail NOW VERIFIED locally (2026-11-21):** `step` deletes up to 20 docs from one of 3 known top-level memory collections per transaction, increments `steps` and `totalDeleted`, then when those top-level collections are empty reads and, if it exists, deletes `memoryAttestationQuotas/{uid}`; it marks the private fence `complete` and retains the paired public/private fences. Returned flags explicitly say `fullAccountDeletion:false`, `nestedCollectionsAudited:false`, `externalCopiesAudited:false`. `status` is a private fence read and does not certify residual absence. This does **not** delete `contextConsentQuotas`, receipts, hashed ledgers, originals, nested descendants, or backups; no recursive deletion. No actual staging wiring.
4. **Potential constructor hardening:** `createMemoryAttestationQuota` validates its `projectId` argument but did not check actual `db.projectId` in the shown file; its production impact depends on trusted call-chain and must be assessed before release. No code change authorized here.
5. **Other CURRENT local writes still to inspect:** `server/memory/*` loader/route, `server/privacy/contextConsent.cjs`, `server/privacy/contextPreviewQuota.cjs`, `server/railway/appCheckReplayGuard.cjs`; where pinned code matches local, record exact SHA or `git diff` result. Hashed billing and anti-replay remain excluded from B1 deletion certification.

### B2.1 progress / remaining gates
- DONE: pinned remote 14-row draft + exact local references; read-only local inspection of three R10 writer modules and Railway attestation diff.
- PENDING: actual local `railwayAttestationRoute.r103c1.mjs` and other server/memory modules, actual staging consent guard mitigation (known missing at pinned HEAD), remaining private writer paths, reader/writer matrix for all private paths, retention owner-scope and auth/cost invariants.
- `B2.1=PARTIAL_LOCAL_SOURCE_VERIFIED`, **NOT ACCEPTED**; `B2.2=NOT STARTED`, no patch.


### Confirmed staging consent-fence gap from pinned unmodified source (B2.1 security finding)
**Verified 2026-11-21:** read full `server/privacy/contextConsent.cjs` at backend pinned commit `1c4c121e0e449f1a9360e4fb4588dcf58352e699`. The user `git status --short` lists only `server/railway/index.cjs` as a modified tracked file; no `contextConsent.cjs` modification is reported. At lines **104–184**, `execute` creates context grants (`tx.create(recordRef, record)`) and consumes quota, but never reads `memoryErasureFences/{uid}` or public `memoryControl/erasure` in the grant transaction. At lines **187–201**, `check` validates grant active state but does not read those fences either; `list` only fetches active grants. This is a **concrete code-level coverage gap** relative to demo consent admission's same-transaction fence guard, not a claim that a public HTTP route currently exposes or exploits it. Railway release/feature-flag enablement is not verified. Keep provider-use authorization **OFF** until an independently tested staging guard exists.
Acceptance fix later under Privacy Gate: create grant requires transactionally checking an authoritative fence and source ownership; check/list must fail closed on erased owner; negative race and emulator tests, no implicit un-erasure. Preserve 15-minute scope, expiry and immutable grant IDs.


## Verified LOCAL erasure completion and attestation loader — second read-only pass (2026-11-21)

Evidence: user terminal `sed -n '300,460p' server/privacy/memoryErasure.r103c2b.cjs` and `sed -n '1,260p' server/memory/railwayAttestationLoader.r103c1.cjs`, both from dirty backend worktree, HEAD `1c4c121e`.

**Demo erasure completion (verified).**
- `step` uses `tx.delete(doc.ref)` on each selected top-level memory document, tracks `steps/totalDeleted`, and at completion `tx.get(quotaRef(uid))`, `tx.delete(quotaRef(uid))` (if present), and `tx.update(privateFence, { status:"complete", ... })`. Paired public state remains fenced; private fence remains an irreversible tombstone after confirm.
- Normal `cancelPending` before any step/confirmation deletes *both* fences; not a rollback of completed erasure.
- Returned `scope:"memory-derived-only"`, `fullAccountDeletion:false`, `nestedCollectionsAudited:false`, `externalCopiesAudited:false`; `status` only reports fence status, counters, `fullAccountDeletion:false`. No data-content or descendant scan in this final step.
- **Retention correction:** The demo engine explicitly deletes `memoryAttestationQuotas/{uid}` at completion. Earlier B1 residual test proves quotas *can* exist; it does not prove they must survive a successfully completed demo erasure. `contextConsentQuotas/{uid}` is different and **not** deleted in this excerpt. Billing/receipt/index/backup scope excluded.

**Lazy staging attestation loader (verified).**
- `createLazyRailwayMemoryAttestationRoute(options)` returns a 404 rejector when `enabled !== true`. Enabled mode dynamically imports `railwayAttestationRoute.r103c1.mjs` on the first request, caches its promise, and invokes its generated handler. Import/handler failure before sending response becomes generic `503 attestation-unavailable`.
- This loader contains **no Auth, App Check, entitlement or quota checks itself**; the surrounding dirty `server/railway/index.cjs` injects these dependencies. Whether the imported route consumes them correctly remains **UNVERIFIED** until the real local `.mjs` file is inspected and its tests pass. No evidence of deployed route or provider access.

**B2.1 status:** ERASURE TAIL VERIFIED + LOADER VERIFIED; end-to-end route, staging consent fence, hashed/global writer ownership/retention and full ledger index audit STILL PENDING. `B2.1=PARTIAL_LOCAL_SOURCE_VERIFIED`, not accepted. `B2.2=NOT_STARTED`, no code patch.

**Precisely next source request (read-only, no secrets):**
```bash
cd ~/reflect-r10-railway-review
sed -n '1,320p' server/memory/railwayAttestationRoute.r103c1.mjs
git diff -- server/privacy/contextConsent.cjs server/ai/hostedBudget.cjs server/railway/appCheckReplayGuard.cjs
rg -n --glob '!*.test.*' --glob '!*.smoke.*' 'createMemoryAttestationQuota|createLazyRailwayMemoryAttestationRoute|createRailwayMemoryAttestationRoute|memoryErasureFences|requestLedger|ownerDays' server/memory server/railway server/ai server/privacy
```
`git diff` empty for pinned files is useful evidence of no tracked local modifications; `rg` captures extra dynamic callers, not proof by itself.

## Verified LOCAL route and unchanged tracked writers — user terminal 2026-11-21

**New local evidence:** `wc -l server/memory/railwayAttestationRoute.r103c1.mjs` = 160; `sed -n '1,320p'` showed the complete local route. `git diff -- server/privacy/contextConsent.cjs server/ai/hostedBudget.cjs server/railway/appCheckReplayGuard.cjs server/privacy/contextPreviewQuota.cjs` produced **empty output**, corroborating the pinned source is unchanged relative to current detached HEAD in these four tracked files (this does not prove they are deployed).

- **Attestation route entry:** exact `/v1/privacy/memory-attest`; staging project `reflect-ai-staging`, owner namespace `reflect-8fdc8`, staging origin only, default `enabled=false`. Factory validates `db.projectId === reflect-ai-staging`, supplied verifiers and quota callback.
- **Actual runtime order:** request URL/Origin/method/header checks → strictly sized JSON body with only `topicId` → `verifyAuth(bearer)` + principal UID/audience check → `verifyAppCheck(appCheck)` with exact Firebase app ID and `alreadyConsumed === false` → `authorizeAccount(principal)` → `consumeQuota(principal.uid)` → owner-scoped document/event queries → pure `createReadOnlyTopicAttestor` result. The shared module states the injected auth verifier uses revoked-ID-token checks and AppCheck verifier consumes tokens; external verifier implementation and integration tests remain separate evidence.
- **Firestore paths:** `getDocument` checks prefix `artifacts/{namespace}/users/{verifiedUid}/` and exact one-document names `memoryTopics|memoryProjections|sessions`; `listTopicEvents` filters by exact owner-root, requested topic and 1..251 limit. Events are sorted in Node **after** a bounded Firestore query without explicit `orderBy`; verify projection/attestor rejects incomplete or limit-truncated sequence before asserting a verified result.
- **Output/no provider:** fields `contractVersion,topicId,asOfSequence,eventCount,sourceDocumentCount,verification`, fixed `providerUseAllowed:false`, `providerContextSent:false`. No xAI invocation in module; internal error yields generic 503 without raw documents/paths.
- **Privacy blockers:** module does **not** check `memoryErasureFences/{uid}` before Admin-backed memory reads; an independent erasure-aware read gate is needed for rollout. Unchanged `contextConsent.cjs` still does not read erasure fence in grant-create transaction or `check()`; don't claim consent correctness or provider permission.
- **Cost/abuse nuance:** quota is consumed *before* attestor Firestore reads. Valid requests that subsequently fail attestation may consume a slot (not necessarily a bug, but should be specified/tested). Limited-use AppCheck token likewise consumed before quota.
- **Billing writer pinned code verified (unchanged):** `hostedBudget.cjs` uses `tx.get` for runtime flag, existing request ledger, hashed owner-day, global-day before `tx.set` for day counters and `tx.create` request reservation; replay requestID gets `already-exists`. Later `finish` updates same ledger status without releasing reservation on failure/unknown outcome. It calls the ledger "immutable" for request identity, **but status fields do update**. No TTL and no UID-index.
- **Anti-replay writer pinned code verified (unchanged):** `appCheckReplayGuard.cjs` writes SHA256(token) fingerprint plus expiration via transaction, performs bounded opportunistic 64-at-a-time cleanup of expired records; global token key is not owner-keyed and not a memory-erasure target.
- **Source-level acceptance boundary:** First-pass known private writer/addressability classification now has direct current-local evidence for route/erasure/quota, plus clean-diff evidence for four tracked pinned writers. **B2.1 is SOURCE-REVIEWED WITH OPEN GAPS**, not complete account-wide census or retention certification: other/Admin provisioning paths, computed collection names and untracked server/memory modules need targeted discovery. Thus B2.2 architecture can be drafted without asserting B2.1 final closure.

**B2.1 status:** `SOURCE_REVIEWED_PARTIAL`. Next: B2.2 proposal **design-only**; no source patch until trust gate and retention policy are reviewed.


## 2026-11-22: exact LOCAL archive reclassification + PG04D3 lease data (B2.1 still PARTIAL)
**Actual user-uploaded `REFLECT_PG04D2_SOURCE_REVIEW.tar.gz` byte-level verified**, SHA256 `a5fadd0501d02b2b13b24cbb50d51537089111b97950664321da6a4030dea723`. Full `memoryErasure.r103c2b.cjs` (341 lines), `demoMemoryConsentAdmission.r103c2b2.cjs` (73 lines), `demoDispatchLease.pg04d1.cjs` (190 lines), exact contents in user archive; the following supersedes any earlier partial/older assumptions about these three files, **not** other dirty local writers.

| ID | Exact source/method (line) | Firestore writes and scope | Retention/privacy/completeness status |
| --- | --- | --- | --- |
| BW-12a | `memoryErasure.r103c2b.cjs:103–130 prepare` | Two transaction `tx.create`: private `memoryErasureFences/{uid}` `status:pending, nonceHash, expiry, steps`; public `artifacts/reflect-8fdc8/users/{uid}/memoryControl/erasure` `state:erasure-fenced` | DEMO project/host only; no D1 lease active-count check. Private fence owner-scoped, public owner-visible, **not account-wide deletion** |
| BW-12b | `memoryErasure.r103c2b.cjs:136–162 cancelPending` | Transaction deletes **both** private/public fence refs only when no confirmation/steps/deletes/revoke | Existing D1 reserved lease is **not invalidated** and no generation bump; unsafe to wire without PG04D3 |
| BW-12c | `memoryErasure.r103c2b.cjs:196–231 confirm` | TX `tx.update(privateFence,{status:"revoking"})`; does independent consent/owner guard callback checks before TX | Guard checks outside transactional transition do not account for active provider dispatch; no atomic external POST promise |
| BW-12d | `memoryErasure.r103c2b.cjs:234–320 step` | TX quota/grant reads, up to 20 grants `tx.update(status:"revoked")`, deletes up to 20 docs from one of `memoryEvents/memoryProjections/memoryTopics`, deletes `memoryAttestationQuotas/{uid}` at scoped completion, updates private fence status/steps/counters | Bounded three collections only; nested descendants, session/diary/goal originals, billing and provider copies excluded. Retained tombstone private/public. No full deletion certificate |
| BW-13 | `demoMemoryConsentAdmission.r103c2b2.cjs:47–71 issue` | `tx.get(privateFence)` before `tx.create(contextGrants/{uid}/grants/{grantId})`, only when a session source exists | DEMO-only grant writer, 15min permission TTL does NOT purge Firestore document; status remains active unless revoke. Not production `contextConsent` |
| BW-15 | `demoDispatchLease.pg04d1.cjs:89–185` | DEMO-only `demoPg04d1DispatchOwners/{uid}` TX creates/updates phase/gen/activeCount, creates/updates `leases/{leaseId}`; `requestErasure` attempts to create **same** real private/public fence paths with incompatible private schema | **TEST MODEL ONLY, NOT imported into real Railway**. Lease docs do **not** contain generation despite owner coordinator generation; `settle(unknown)` decrements activeCount and may yield dispatches-drained even when external outcome unresolved. No automatic deletion, retention for these synthetic records undefined. Must not be treated as real billing/erasure writer |

**Updated staging consent status:** user had previously applied PG04B patch to dirty local `server/privacy/contextConsent.cjs`, old+new 37/37 PASS and PG04C *real isolated Firestore Emulator* 6/6 PASS. Earlier 2026-11-21 prose saying local `contextConsent.cjs` was unchanged is **historical/SUPERSEDED**. However remote backend pinned `1c4c121e` still lacks those local changes and live deployment remains unconfirmed.

**Local process provenance, 2026-11-22:** `127.0.0.1:18081` is held by user `gor` Java PID 1729032, PPID 1728982, cwd `/home/gor/reflect-r9-2-workflow/tests/emulator`. Do not attach to or terminate a separate frontend workspace service; Firebase Emulator identity is not established solely by cwd. PG04D2 8/8 guard PASS; real six-case diagnostics 0/6, not run.

**B2.1 remains PARTIAL**: dirty `server/railway/index.cjs` current full route import/writer call sites, `server/memory/*` attestation handlers, actual `contextPreviewQuota.cjs`, replay guard, `aiTurnRecovery.cjs`, `hostedBudget.cjs` need current-local read/diff confirmation and owner/retention mapping. Legal B2.3 still unapproved. No source commit, deployment or deletion action.

## 2026-11-22 — Byte-exact current LOCAL consent/budget/recovery writer audit from PG04D4B TAR
- **User archive exists and was opened:** `REFLECT_PG04D4B_SOURCE_REVIEW.tar.gz`, SHA256 `7bc64b3aa47b82ec188d51a0e344d6f27b6690f8d0d910c370ac8ff1a74fa426`. See full method/line and per-file hashes in [PG04D4B exact source audit](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/privacy/REFLECT_PG04D4B_EXACT_USER_SOURCE_AUDIT_AND_INTEGRATION_PLAN_2026-11-22.md). These entries supersede old pinned remote-only assumptions for seven files, **not** all dirty backend.
- **BW-05/06 actual LOCAL consent** `contextConsent.cjs:90–264`: `execute(grant)` writes owner private `contextGrants/{uid}/grants/{grantId}` with immutable grantId, active 15m, and `contextConsentQuotas/{uid}` count, in same TX as **both private/public erasure fence reads**. `revoke` writes retained tombstone; `check` and `list` read both fences in same transaction and fail closed. **Old pinned 2026-11-21 “local contextConsent missing fence check” is superseded for these exact bytes**. No source revision/preview digest bound to grant issuance, no guarantee of live staging rollout. Retention grant tombstone and quota physical purge still unknown.
- **BW-02/03/04 actual LOCAL hostedBudget** `hostedBudget.cjs:28–147`: `reserve` in Firestore TX reads runtimeFlags, hashed immutable `requestLedger/{sha256(uid\0requestId)}`, `ownerDays/{sha256(uid\0day)}`, `globalDays/{day}`, writes owner/global counts and receipt atomically. Separate `finish` TX updates receipt; failed/unknown does not refund. NO owner-queryable index at user local source; retention unknown/no ledger TTL; external dispatch lease not joined to this transaction. `trustedContextBytes` input max 1200, not 2400 preview.
- **BW-01 actual LOCAL aiTurnRecovery** `aiTurnRecovery.cjs:168–275`: metadata receipt `attemptOwners/{uid}/sessions/{sid}/turns/{turnId}` created/updated through separate claim/providerStarted/failed/persistReply transactions; final owner session assistant reply and metadata receipt written in ONE TX. `publicState` can offer user-confirmed retry after outcome_unknown with a new requestId; that does not settle old external provider/charge ambiguity. Physical retention and erasure scope unknown.
- **Not-private-writers:** `sessionContextPreview.cjs` reads single session, consent before+after, returns bounded source text; `contextPreviewHttp.cjs` returns preview content+hash (not persisted); `xaiProviderAdapter.cjs` external transport only, no Firestore writer. Current `hostedHandler` orchestrates budget and recovery but `adapter.invoke(...,null,...)` no history; it is not an independent transactional permission check. All 7 sources pass Node syntax only; NO new real Emulator/permission test executed in PG04D4B.
- **Critical PG04D4B contract gap**: HTTP review preview hash `4×700/2400` without per-turn source IDs differs from PINNED older `sessionMemory` authorized excerpt digest `4×300/1200` with sourceTurnIds/request/UID/message binding and `providerSessionContext` shape. Need choose single audited authoritative approval flow, then bind consent+owner generation+immutable hashed billing ledger+lease requestId in same transaction or proved durable two-phase recovery. No history provider enable until PG/B2.3.
- B2.1 **STILL PARTIAL**: current dirty `server/railway/index.cjs` and other `server/memory/*`, `appCheckReplayGuard`, `contextPreviewQuota`, legacy hashed/global receipts, Rules/retention and external provider copies remain not fully enumerated/tested. No complete deletion certificate.

## 2026-11-23 — BW-07/BW-08 current-local parity pending; exact PINNED remote writer logic independently read
The connected GitHub source for exact backend pinned HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699` was re-opened for these two **tracked** files; *the owner's dirty current-local bytes are not rechecked yet*. Next one owner-local `git hash-object` check is required before promoting from PINNED REMOTE to CURRENT LOCAL.
 
| BW ID | Pinned source blob / verified transaction flow | Privacy retention and owner concern | Current-local evidence |
| --- | --- | --- | --- |
| **BW-07** | `server/privacy/contextPreviewQuota.cjs`, blob `e27be69dc8f8d5eea940d54b410bfdf021d241fa`: `createPreviewQuota({db,projectId,clock})`, rejects invalid env/UID/time, private document `_reflectAiPrivate/${NAMESPACE}/contextPreviewQuotas/${uid}`, `db.runTransaction` reads `tx.get(ref)`, validates existing UID/hour/count, then `tx.create` or `tx.update` only `{uid,hour,count}`; max 20 per UTC hour | UID-addressable; hourly logical counter reset is **NOT Firestore physical TTL**; erasure/retention not established and B1 scan omitted this class | **PENDING EXACT git blob parity** |
| **BW-08** | `server/railway/appCheckReplayGuard.cjs`, blob `b155c9141bcc968a01e05567b9d7b3cd32d72866`: `createAppCheckReplayGuard({db,projectId,clock})` runs Admin TX, `tx.get` hashed token fingerprint document and `tx.create` `{schemaVersion,createdAt,expiresAt}` on first use. Opportunistic `pruneExpired`: collection query `expiresAt <= now-grace`, limit 64, `batch.delete` then `batch.commit`. Cleanup happens for sampled first-use tokens and cleanup failure does not permit a repeated token. | Global SHA256(token)-addressed security ledger, **not owner-queryable**; cleanup is not guaranteed at expiry, and deleting its fingerprints during owner erasure would weaken replay protection. Retention/legal exception requires B2.3 policy | **PENDING EXACT git blob parity** |

**Evidence scope:** No provider, runtime or Firebase usage was executed; this is directly inspected pinned remote source, not claimed proof that the dirty local worktree or deployed Railway has identical bytes. Historical 2026-11-21 matrix notes about missing local `contextConsent.cjs` erasure fence were superseded by **2026-11-22 exact local archive audit** showing local atomic fence checks; neither proves staging deployment. Do not change Rules or source based on this classification.
