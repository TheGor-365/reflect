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
