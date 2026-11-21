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