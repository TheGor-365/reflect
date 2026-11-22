# Reflect 2.0 — PG04D4B: real consent + budget + provider-boundary source preflight
**2026-11-22 • DESIGN / READ-ONLY SOURCE REVIEW PENDING. NO EXECUTABLE PATCH, NO DEPLOY.**

## PG04D4A user evidence accepted
User in dirty backend worktree `~/reflect-r10-railway-review`, detached HEAD `1c4c121e`, Node 22.23.4: first patch lookup `STOP: патч не найден` superseded by `PASS: PG-04D4A установлен`. New-only reviewed original-writer COPY patch SHA256 `86166a6cb421a7f4fd8c98c019594abdcf62dce9a5fa436d39ab7b542bd5c80b`, unit **12/12 PASS**, syntax on three new CJS and `git diff --check` clean.

**Genuine** Admin SDK Firestore Emulator on `127.0.0.1:19087`, isolated project `reflect-pg04d4a-synthetic`, explicit opt-in, Firebase/Google credentials unset: **6/6 PASS**: same-TX canonical private/public fence + generation prepare/cancel; actual-format copied writer confirm/step defers during active dispatch and deletes one synthetic memory event after settlement while retaining tombstones; unknown outcome blocks confirm; FAKE-only late-send-after-request gap demonstrated; private-only fence fails closed; concurrent prepare/admit produces safe serializable state. `GATE_BLOCKED` correctly printed; exact claimed synthetic document cleanup PASS, no recursiveDelete, exit 0, clean shutdown.

Warnings: hub 4400→4401, logging 4500→4501 were automatically handled; missing Firestore Rules means default allow and **client Rules NOT tested**. Firebase CLI update notification irrelevant to test outcome. Scope: source is `pg04d4aMemoryErasureReviewedCopy.cjs` from original writer SHA `485757d8bd718bc31a1052e500994aa9314de46531fdb707000a1505ee088f81`. Original untracked `memoryErasure.r103c2b.cjs` and real Railway remain untouched; Auth/consent callbacks mocked positive, no hostedBudget, network provider or user data. **PG04D2 true original writer diagnostics 0/6 remain unrun**, frontend R9.2 owns hardcoded 18081; do not stop/reuse.

## Pinned source review (backend commit 1c4c121e; unchanged tracked AI files per user status)
- `server/ai/hostedHandler.cjs:75–84`: authenticated owner + consumed AppCheck; `:89–95` optional attemptRecovery claim; `:97` calls `budget.reserve` (its own TX); `:112–115` optional recovery.providerStarted then **`adapter.invoke(input.message,settings,null,...)`**; `:126` budget.finish successful, `:147–158` error handling. Historical context remains OFF at this code path, no real shared lease gate.
- `server/ai/hostedBudget.cjs:46–119`: reserves immutable hashed requestLedger in transaction `:69`, updates owner/day/global counters and checks kill-switch. `finish` separately updates ledger in TX `:127` and intentionally never releases unknown or failed reserve automatically. Cannot assume budget reserve and new lease.begin will be atomic or that a retry is uncharged.
- `server/ai/xaiProviderAdapter.cjs:130–175`: optional context supported but adapter does NOT perform Auth, consent, erasure, lease or budget gating.
- `server/privacy/contextPreviewHttp.cjs:127–150`: preview returns hash and explicitly `providerDispatchAllowed:false`. A preview acknowledgment is not server authorization for actual external transmission.
- User local `git status` confirmed `M server/privacy/contextConsent.cjs` and `M server/railway/index.cjs`; tracked hostedHandler/Budget/Xai Adapter unchanged. Railway index lines 401–403 build real consent store. The exact **current local modified consent source** must be read before proposing PG04D4B source changes; pinned remote is stale.

## PG04D4B required integration contract (design only)
1. Server verifies Auth/AppCheck/entitlement, current grant, trusted owner/source/revision and exact approved preview digest. Read both canonical erasure fences and owner lease generation fail closed at provider request-bound admission/start. Consent 15min active TTL never equals erasure or provider permission.
2. One durable request identity across attempt recovery, immutable hashed budget ledger, lease and source/preview receipt. **Separate budget.reserve TX and lease.begin TX have partial failure windows**: budget reserved but lease not begun; lease admitted but budget denied; unknown external send outcome. Need explicit idempotent two-phase recovery or an audited same-TX API extension before changing production writer. Never auto-refund or blindly retry a possibly billed request.
3. Original erasure writer alone owns nonceHash and private/public fence creation. Its prepare/cancel/confirm/step must read coordinator in same Firestore TX; cancel cannot resurrect prior reserved leases; unsettled/unknown requests block effective deletion. Do NOT take D4A review copy as new production source.
4. Firestore transactions cannot make an external HTTP POST atomic. Late send after erasure request is a verified fake ordering; do not advertise no-send-after-click guarantee. Must prevent erasure-effective completion until all potentially in-flight work accounted for, and review stronger outbound gateway separately.
5. Distinct client Firestore Rules tests, real Admin authorization tests, legacy fence/missing owner failure, old Railway replica OFF, billing consistency, B2.1 complete writer census and B2.3 retention decisions remain mandatory. Provider-history OFF, no deployment.

## Next exactly two read-only user actions
(A) User should locally inspect then attach **source-only** TAR (not yet in this conversation):
```bash
cd ~/reflect-r10-railway-review
tar -czf "$HOME/REFLECT_PG04D4B_SOURCE_REVIEW.tar.gz" \
  server/privacy/contextConsent.cjs \
  server/privacy/sessionContextPreview.cjs \
  server/privacy/contextPreviewHttp.cjs \
  server/ai/hostedHandler.cjs \
  server/ai/hostedBudget.cjs \
  server/ai/aiTurnRecovery.cjs \
  server/ai/xaiProviderAdapter.cjs
sha256sum "$HOME/REFLECT_PG04D4B_SOURCE_REVIEW.tar.gz"
tar -tzf "$HOME/REFLECT_PG04D4B_SOURCE_REVIEW.tar.gz"
```
Do not include .env/secrets, actual Firestore records, or whole dirty `server/railway/index.cjs`; review code for embedded credentials/private values before sharing.
(B) Targeted route wiring (safe read-only references, no source dump): `rg -n 'createHostedHandler|createContextConsentStore|createPreviewHttpListener|createLazyRailwayMemoryAttestationRoute|verifyAuth|verifyAppCheck' server/railway/index.cjs | head -90`.

**Status** `PG04D4A=USER_UNIT_12/12+REAL_FIRESTORE_EMULATOR_6/6_DIAGNOSTIC_PASS+EXACT_CLEANUP_PASS, GATE_BLOCKED`; `PG04D4B=READ_ONLY_CURRENT_LOCAL_SOURCE_REVIEW_PENDING`; B2.1 PARTIAL, B2.3 UNAPPROVED; history OFF. Next after exact archive: source-specific reviewed design/diff with true consent and billing gates; no source overwrite until explicit scope approval.
