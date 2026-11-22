# Reflect 2.0 — PG04D4B3C3C3C2: C3C3c four-case owner probe accepted, read-only coverage metadata diagnosis

**2026-11-23 — DOCS-ONLY.** Do not merge or deploy Firestore Rules, change dirty R10 worktree source, call Railway, provider, or production Firestore.

## Owner terminal: exact accepted evidence

In dirty detached `~/reflect-r10-railway-review`, owner first attempt printed `STOP: скрипт не найден` (pure missing download, **no emulator work**). Second attempt found the correct checksum-pinned script `REFLECT_C3C3C_CLEAN_EVAL_COVERAGE_2026-11-23.sh` SHA256 `2b10def37e8aad2913e618682299c07b22cfdbf9f867b6e23cd56a4640eef505`, and ran it successfully.

- Candidate C3C3b `server/hosted/firestore.pg04d4b3c3c3b.compat.rules` SHA256 **`780bee8885d3ff4ef66153d6aaa4c81fd2add72d039c361a1314a878839dc9b2`** and original `server/hosted/firestore.rules` Git blob **`2cc47d40020e349edc6617a2f9e03578efe39799`** confirmed by script preflight.
- Independent synthetic local `demo-reflect-c3c3c-clean-eval` at **`127.0.0.1:19092`**, no cloud credentials, only local copy of candidate Rules. Root frontend/backend and Railway unchanged.
- Four actual owner-token client probes in isolated Firestore Emulator: `NO_FENCE=ALLOW`, `PUBLIC_ONLY=DENY`, `PRIVATE_ONLY=DENY`, `BOTH_FENCES=DENY`. **4/4 PASS**.
- Emulator `:ruleCoverage` returned **HTTP 200**, root JSON keys `rules,report`; aggregate field-name counts `expressionReport:0,expressionReports:0,values:28,value:86,error:0,undefined:7,line:44,position:0,source:0`. These are key occurrence counts in a recursive JSON walk and **DO NOT** establish seven actual rule-evaluation faults. User's raw JSON in owner-only scratch path:
  `/home/gor/Загрузки/reflect-c3c3c-clean-eval-vrJumoyo/ruleCoverage.raw.json`. Raw coverage **not uploaded**.
- Coverage JSON SHA256 **`29947bcab7ae6a175c94f72dc1fe410d982bd1e9c4af86d081eeb93999594d2e`** as printed by owner; **not independently byte-verified** since only local. Synthetic exact-ref cleanup PASS/no recursiveDelete, child exit0, Emulator stopped cleanly.
- Local debug log reports **`DEBUG_EVALUATION_ERROR_COUNT=18`**, `DEBUG_EXPLICIT_EVALUATION_EXCEPTION_COUNT=0`, `DEBUG_VARIABLE_UNBOUND_COUNT=0`, `DEBUG_SERVICE_CALL_ERROR_COUNT=0`, `DEBUG_VERBOSEERROR_METHOD_NAME_COUNT=6`. This confirms some Emulator policy denials printed `evaluation error at L33`; **CLEAN_EVAL NOT CERTIFIED**. C3C3b original client 80/80 & 7/7 GREEN remains accepted; don't upgrade the security gate based on 4/4 only.

## Next step: analyze already saved JSON, no rerun/release

Assistant prepared **READ-ONLY local Python analyzer** conversation artifact `REFLECT_C3C3C1_COVERAGE_METADATA_2026-11-23.py`, SHA256 **`0114707e69abbae3fd9b0af28fa0a3b6caff6a2ce8dd99a0b591751f8c913df5`**.

The script:
1. pins owner dirty R10 HEAD, original Rules Git blob, candidate Rules SHA256; requires exact owner-only scratch directory permissions; refuses symlinks, unexpected size and changed report bytes; verifies coverage JSON checksum `29947b...`;
2. reads local JSON as data, traverses bounded structural nodes, and prints only **root type/key counts**, primitive **type** distribution for fields named `undefined` and `error`, nearby numeric Rules line numbers (if represented in ancestor dictionaries), and a fixed line histogram (24–33,37,41). It **does NOT print** raw JSON, source, expressions, private paths/IDs, tokens or error messages and **never changes files or accesses the network**;
3. is author **Python `py_compile`/AST validated**, not executed on owner's actual saved JSON because those bytes are not available here. If structure lacks field-to-line association, output will say `unknown`; do not force a speculative diagnosis.

Owners' next action: download to `Загрузки`, checksum-verify SHA256 above, run from own local shell with `python3 SCRIPT`, share **sanitized console output only**. Do not upload `ruleCoverage.raw.json` or `firestore-debug.log` uninspected. If counters show a likely cause, design a separate minimal reproducer / independent clean-eval case; if no attribution available, record as an unresolved Emulator diagnostic ambiguity and retain gate.

Official Firebase documentation for the per-expression JSON coverage endpoint: https://firebase.google.com/docs/rules/emulator-reports and https://firebase.google.com/docs/firestore/security/test-rules-emulator . An upstream firebase-tools diagnostic issue #11283 may be related but has **not** been established as the cause in Reflect.

## Gate
`C3C3c=OWNER_DEMO_4/4_PASS+RULECOVERAGE_HTTP200+DEBUG_EVAL_WARNING_18/CAUSE_UNKNOWN`; `C3C3c2=COVERAGE_METADATA_SCRIPT_AUTHOR_SYNTAX_PASS/OWNER_PENDING`; `C3C3b=OWNER_TRUE_CLIENT_80/80+7/7_GREEN/RELEASE_BLOCKED`; `PRIVACY_GATE=BLOCKED`. Outstanding: private erasure state and clean expression evaluation, field-level client writes, dynamic routes/untracked Memory modules, original Auth+AppCheck approval, memoryReply/budget/recovery/erasure TX protocol, PG01–08/B2.1/B2.3 and mixed-worker rollout. No original Rules changes, Railway or production.
