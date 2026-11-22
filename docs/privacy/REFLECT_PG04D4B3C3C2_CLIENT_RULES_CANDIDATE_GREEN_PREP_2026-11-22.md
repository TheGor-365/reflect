# Reflect 2.0 — C3C1 genuine client Rules RED accepted → C3C2 isolated GREEN candidate prepared
**2026-11-22 • documentation-only checkpoint, not a production/security release**

## Accepted owner source evidence
User's actual Linux `firebase emulators:exec` completed with explicit `server/hosted/firestore.rules`, demo project `demo-reflect-c3c1-rules`, loopback Firestore 19089, Firebase JS SDK 10.12.2 in separate `~/.cache` path:
- **20/20 client DENY/ALLOW baseline observations PASS**, exactly **7/7 EXPECTED_RED** user-owner forbidden writes that were in fact ALLOWED.
- Forbidden allows: `artifacts/reflect-8fdc8/users/{uid}/memoryControl/erasure` CREATE/UPDATE/DELETE; POST-FENCE `memoryEvents`, `memoryProjections`, `memoryTopics` CREATE and nested event-note CREATE.
- Private grants/ledger client DENY; cross-user session reads DENY; owner original session read/update ALLOW. SDK `permission-denied` logs are expected denied probes.
- Exact synthetic refs cleanup `PASS` without `recursiveDelete`, child exit 0, emulator clean shutdown. Rules **policy FAIL**, not privacy pass.
- Local original Rules Git blob **`2cc47d40020e349edc6617a2f9e03578efe39799`** (user read-only hash confirmation). [Issue #136 actual test acceptance](https://github.com/TheGor-365/reflect/issues/136#issuecomment-7085600286).

## Candidate test-only patch — NOT pushed to runtime source
User-facing conversation artifact:
`REFLECT_PG04D4B3C3C2_CLIENT_RULES_CANDIDATE_GREEN_2026-11-22.patch`

**SHA256 `3146a83e91f5707ac598937267003538b1759aaa4e8ed4c4f51eb800dc499c84`.**

Adds exactly **4 NEW** paths; no overwrite or modification of original `server/hosted/firestore.rules`, `server/railway/index.cjs`, original budget/recovery/writer, or previous C3C1 tests:
- `server/hosted/firestore.pg04d4b3c3c2.candidate.rules` candidate SHA256 `8090c2001f52e576bd0448474c6ed3968a0acd2aaa65569fb9ed3b404b94ae51`
- `firebase.pg04d4b3c3c2.rules.json`: explicit candidate rule file, loopback `127.0.0.1:19090`, `demo-reflect-c3c2-rules`, UI disabled
- `server/privacy/pg04d4b3c3c2ClientRulesGreen.emulator.cjs`: genuine client SDK + server Admin fixture, **40** intended assertions and **7** prior forbidden writes now expected DENY, post-fence UPDATE/DELETE, one-sided public/private fences, foreign/anonymous/private boundaries and allowed owner original sessions
- `docs/privacy/REFLECT_PG04D4B3C3C2_CLIENT_RULES_CANDIDATE_GREEN_2026-11-22.md`: local runbook and guarded commands. Patch SHA is provided separately rather than recursively embedded in its own content.

**Candidate semantics:** original broad owner **write** is eliminated, not merely supplemented with overlapping DENY (OR match semantics). Private namespace client read/write always DENY; original sessions owner CRUD permitted; owner three memory-derived collections and descendants writable only while `memoryControl/erasure` **and** `_reflectAiPrivate/.../memoryErasureFences/{uid}` both absent (any marker fails closed); owner public erasure state GET only and cannot be written/listed; all other client document paths deny. Explicit default deny is intentionally restrictive.

**Author checks completed:** C3C2 script Node syntax PASS; JSON valid; candidate SHA check PASS; original Rules unchanged; independent fresh local C3C1 snapshot `git apply --check` / `git apply --whitespace=error` PASS, `git diff --check` clean, exactly four additive paths; negative missing-opt-in guard STOP; source static expected-case count verified. **No firebase CLI / client Rules execution in author container. C3C2 user Emulator 0/40 NOT RUN.**

## Next owner 1–2 actions
1. Download this patch, verify exact SHA256 `3146a83e91f5707ac598937267003538b1759aaa4e8ed4c4f51eb800dc499c84`, original Rules Git blob `2cc47d...`, apply only if `git apply --check`, run syntax/JSON/diff/candidate SHA checks. Never reset/clean/commit user's dirty detached backend.
2. Use existing separate npm SDK cache `NODE_PATH=$HOME/.cache/reflect-c3c1-firebase-sdk/node_modules`. Run **new independent** demo `firebase emulators:exec --only firestore --project demo-reflect-c3c2-rules --config firebase.pg04d4b3c3c2.rules.json`, only if port19090 free and cloud credential env unset, with `REFLECT_PG04D4B3C3C2_RULES_ONLY=YES_SYNTHETIC GCLOUD_PROJECT=demo-reflect-c3c2-rules FIRESTORE_EMULATOR_HOST=127.0.0.1:19090 node server/privacy/pg04d4b3c3c2ClientRulesGreen.emulator.cjs`.
3. Provide complete terminal result, especially 40/40, 7/7 GREEN, scoped cleanup, exit0. **Don't claim them before the owner run.**

## Release exclusions
**Not production-ready even after candidate tests GREEN.** Old broad owner write match supported many unknown frontend paths; this conservative candidate permits only `sessions` and three memory collections. Requires **full frontend/server client CRUD path inventory** and no-functional-regression authorization tests before any merge, Rules deployment or mixed-worker rollout. It does not validate real Firebase Auth/AppCheck browser or owner consent action; server-only approval receipt; original `memoryReply`/budget/attempt/erasure writer transactions; billing/retention/PG01–08; any external HTTP. Real network POST cannot be atomic with Firestore.

**Status:** `C3C1=OWNER_REAL_CLIENT_RULES_20/20+EXPECTED_RED_7/7+EXACT_CLEANUP_PASS`; `C3C2=AUTHOR_ADDITIVE_PATCH_PREPARED / OWNER_REAL_EMULATOR_0/40_PENDING`; `PRIVACY_GATE=BLOCKED`. No production, Railway or client Rules deployed.