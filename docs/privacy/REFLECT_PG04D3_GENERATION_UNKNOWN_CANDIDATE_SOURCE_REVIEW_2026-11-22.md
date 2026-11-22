# Reflect 2.0 — PG04D3 generation / unknown-outcome candidate and local wiring evidence
2026-11-22 • **TEST-ONLY SOURCE CANDIDATE PATCH_PREPARED, USER LINUX QA PENDING; NOT A FIRESTORE PRIVACY GATE**

## Latest user read-only host and local wiring proof
- `ss`/proc: localhost 18081 listener Java PID `1729032`, user `gor`, parent Node PID `1728982`, cwd `/home/gor/reflect-r9-2-workflow/tests/emulator`. Follow-up `ps -p 1728982 -o pid,ppid,user,etime,comm` returned Node PPID `1728971`, elapsed `23:46:49`. This supports an R9.2 frontend test-runner process chain, **not independent proof of the Firebase project**. The listener is not to be killed or reused.
- User `rg` in backend source `~/reflect-r10-railway-review` (excluding `*.test.*`, `*.smoke.*`) found real `server/railway/index.cjs:377,380` using `createLazyRailwayMemoryAttestationRoute` and `:401,403` using `createContextConsentStore({db,projectId:STAGE_PROJECT})`.
- `createDemoMemoryErasure` and `createDemoDispatchLeasePg04d1` names appear as local privacy factory declarations/exports and explicit `pg04d2ActualWriterDiagnostic.emulator.cjs:72–86` imports/initialization, **not as imports in the searched `server/railway` paths**. Scoped rg does not certify full hidden dynamic call graph; local `server/railway/index.cjs` remains dirty, not remotely committed, and live Railway deployment SHA unverified.
- Existing `contextConsent.cjs` locally modified and PG04B/PG04C proof accepted; pinned remote source is older. Frontend R9.2 test Emulator held 18081; PG04D2 actual diagnostic 0/6 RUN (port blocked), while its user eight strict unit guards 8/8 PASS.

## Review of three exact uploaded source files
- SHA256 of actual `server/privacy/memoryErasure.r103c2b.cjs`: `485757d8bd718bc31a1052e500994aa9314de46531fdb707000a1505ee088f81`; `prepare()` transaction creates canonical private/public fences with challenge nonceHash, `cancelPending()` deletes both fences only before confirmation/deletion, and does not check active D1 lease/coordinator.
- `server/privacy/demoMemoryConsentAdmission.r103c2b2.cjs`: `cbb2de536dadb3b4c2f4997a5c3b6fc6e725d7591b39bd3173dc99813d6887f2` (synthetic grant-before-fence TX).
- `server/privacy/demoDispatchLease.pg04d1.cjs`: `a4f516ce0a8f3588bdbe6faa02df60f827ae1b9019d4cb0cd0781b440832fae4`. Its owner coordinator stores `generation` but D1 individual lease does not store generation; `markDispatchStarted()` cannot compare. `settle(outcome:"unknown")` decrements activeCount, possibly marking `dispatches-drained`. This is NOT source-ready for erasure.

## New PG04D3 synthetic generation/unknown candidate
Delivered from current ChatGPT turn as `REFLECT_PG04D3_GENERATION_UNKNOWN_CANDIDATE_2026-11-22.patch`, SHA256 **`28bed526665908f324a5bf0032156f0888cfb3cf4cc54fb5a7609bfafa0f818f`**, and ZIP `REFLECT_PG04D3_GENERATION_UNKNOWN_CANDIDATE_DELIVERY_2026-11-22.zip`. Adds only THREE new files:
1. `server/privacy/pg04d3OwnerCoordination.cjs` (in-memory synthetic-only model, exact explicit opt-in and demo project, synthetic IDs, no Firebase/transport APIs).
2. `server/privacy/pg04d3OwnerCoordination.test.cjs` (32 Node unit/source SHA regression tests).
3. `docs/privacy/REFLECT_PG04D3_GENERATION_UNKNOWN_CANDIDATE_2026-11-22.md` (local runbook and limitations).

The model preserves per-lease generation and invalidates reserved leases after request; cancelPending bumps generation again and cannot re-enable old lease. `unknown` status explicitly increments `unknownCount`, blocks readiness and cancellation. It never creates actual Firestore fences, returns payment credits, deletes real data, calls xAI, sends HTTP, or reports actual erasure completed. `eligible-for-writer-review` is NOT an erasure certificate.

**Author checks in isolated Node 22.x with original three reviewed user files: 32/32 PASS, fresh Git repository `git apply --check` and `git apply --whitespace=error` PASS, `node --check` both, `git diff --check` PASS, ZIP CRC PASS. User patch apply and user Linux 32/32 PENDING.** No real Firestore Emulator in PG04D3; 18081 may remain occupied and is not needed for tests.

**Known hard limitation:** a Firestore transaction setting `dispatch-started` and an external provider HTTP POST are not atomic. Requesting erasure after beginDispatch but before an eventual send cannot be treated as an absolute post-request egress ban. Actual erasure writer needs one authoritative fence owner and a coordinated gate; synthetic results are NOT permission to wire provider historical context, change Railway, cancel real account erasure, or settle unknown billing. Later PG04D3 true source integration requires explicit user-reviewed diff/approval and real isolated Emulator+FAKE-transport races.

## Next
1. User SHA-verify/apply ONLY the new-file-only patch in dirty `~/reflect-r10-railway-review`, run `node --test server/privacy/pg04d3OwnerCoordination.test.cjs` (expected 32 PASS) and JS syntax/diff. Do not rerun earlier guards or touch existing source.
2. Continue read-only B2.1 actual current local writer census and B2.3 retention policy in parallel; PG04D2 real diagnostic remains BLOCKED by port 18081 (0/6 run).
3. After accepted D3 user unit output, work on separate reviewed source-aware Firestore Emulator candidate and fake transport; require safe port isolation without affecting R9.2. No stage/prod deploy or provider history enablement.
