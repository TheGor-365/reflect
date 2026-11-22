# Reflect PG04D4B3C3C3C1 — Clean-eval: user diagnostic accepted, narrow ruleCoverage handoff

**2026-11-23 • DOCS + isolated conversation shell diagnostic only • NO runtime change or deploy.**

## Actual user console (read-only C3C3c first-pass)
Owner Linux dirty detached HEAD `1c4c121e` had guard-confirmed original `server/hosted/firestore.rules` Git blob SHA `2cc47d40020e349edc6617a2f9e03578efe39799` and unmodified separate C3C3b candidate Rules SHA256 `780bee8885d3ff4ef66153d6aaa4c81fd2add72d039c361a1314a878839dc9b2`.
- Firebase CLI **15.34.2**.
- Java **OpenJDK 21.0.12.1**.
- `firestore-debug.log` exists.
- Bounded 2,000,000-byte tail scan returned `SERVICE_CALL_ERROR=0`, `EVALUATION_EXCEPTION=0`, `VARIABLE_UNBOUND=0`, `RULES_RUNTIME_ERROR=82`.
- Class-name-only examples: `com.google.cloud.datastore.core.exception.DatastoreException`, `com.google.cloud.datastore.emulator.impl.rules.DefaultEmulatorRulesAuthorizer.verboseError` and `.withVerboseError`.

**Inference LIMIT:** the previous script's `Rules.*(?:Error|Exception)` regex spans generic tracebacks and matches `verboseError` method names. Thus **82 is not 82 independently confirmed Rules faults**. No `EvaluationException` strings does **NOT** prove clean evaluation: the earlier C3C3b client requests still logged `evaluation error at L33:25 / L37:25 / L41:25` and received `permission-denied`. These are candidate `allow write: if owner() && memoryWritesOpen()` lines; `memoryWritesOpen()` checks both public/private erasure document paths using `exists()`. Underlying expression/error kind remains UNKNOWN. A related emulator diagnostic precision issue is reported upstream [Firebase CLI issue #11283](https://github.com/firebase/firebase-tools/issues/11283), but similarity alone does NOT identify root cause or justify skipping a root-cause test.

[Official Firebase Rules emulator report](https://firebase.google.com/docs/rules/emulator-reports) documents local `/emulator/v1/projects/{project}:ruleCoverage` raw JSON and HTML variants. [Official Firestore emulator testing](https://firebase.google.com/docs/firestore/security/test-rules-emulator) confirms an explicit `firestore.rules` path is needed, otherwise permissive defaults risk invalidating a test.

## New owner diagnostic script — 4 cases only, strict isolation
User-facing conversation artifact:
`REFLECT_C3C3C_CLEAN_EVAL_COVERAGE_2026-11-23.sh`
SHA256 **`2b10def37e8aad2913e618682299c07b22cfdbf9f867b6e23cd56a4640eef505`**.

- Bash `-n`, embedded Node `--check`, embedded JSON `python3 -m json.tool`, SHA/source safety and static command contract verified by assistant. **NO genuine owner emulator run yet**; assistant container has no Firebase CLI/client SDK.
- Checks pinned user HEAD, original production Rules Git blob, C3C3b candidate SHA. Copies **only** candidate Rules into a fresh protected local `~/Загрузки/reflect-c3c3c-clean-eval-XXXXXXXX` folder and writes scratch-only Firebase config and Node harness; **does not edit source repo, original or previous Rules, original debug file, Node packages or Railway**.
- Dedicated **`demo-reflect-c3c3c-clean-eval`**, loopback **`127.0.0.1:19092`**; exact opt-in, cloud credential/config/auth emulator env unset, preinstalled cached SDK and pinned Admin dependency.
- Four synthetic authenticated-owner client probes: (1) no fence → ALLOW memoryEvents create; (2) public-only erasure fence → DENY; (3) private-only → DENY; (4) both fences → DENY. Admin exclusively seeds synthetic marker fixtures and afterward deletes **exact per-run document refs only**, no recursiveDelete/project-wide wipe.
- While Emulator is running, harness queries **only localhost** `/emulator/v1/projects/demo-reflect-c3c3c-clean-eval:ruleCoverage`, validates JSON, prints **aggregate keys/counts+SHA256 only**, stores raw JSON privately as `ruleCoverage.raw.json` within the freshly created scratch folder. Sanitized class/error pattern counts from that folder's debug log are printed after emulator stops. **DO NOT upload raw rules coverage/debug log uninspected; they could contain identifiers.**
- Script is test-only and does not attempt to declare CLEAN-EVAL. Expected output if successful: `NO_FENCE=ALLOW`, `PUBLIC_ONLY=DENY`, `PRIVATE_ONLY=DENY`, `BOTH_FENCES=DENY`, `RULE_COVERAGE_HTTP=200`, `EXACT_SCOPED_CLEANUP=PASS`, `4/4 ... PASS`, `EMULATOR_EXIT_CODE=0`. **Not yet observed**.

## Next stage / gates
1. Owner downloads artifact, validates exact SHA256, invokes `bash` (read-only to repo). Provide **stdout** and sanitized ruleCoverage aggregate metrics, not raw private logs.
2. If ruleCoverage shows genuine expression errors, prepare separate scoped candidate v3 and independent DENY+ALLOW test; if only generic False predicate warnings, record quality issue and retain independent Security Rules validation. Do **not** promise automatic clean pass.
3. Complete frontend dynamic route and field-level privilege audit, three local untracked Memory modules, browser Auth/AppCheck explicit owner receipt, real original memoryReply/budget/erasure TX integration, mixed Railway worker compatibility, B2.1/B2.3 and PG01–08.

**State:** `C3C3b=OWNER_GENUINE_CLIENT_80/80+7/7_GREEN+EXACT_CLEANUP+EXIT0/RELEASE_BLOCKED`, `C3C3c=FIRST_PASS_LOG_TRIAGE_COMPLETE/ROOT_CAUSE_UNKNOWN/COVERAGE_4_CASES_PREPARED_OWNER_PENDING`, `PRIVACY_GATE=BLOCKED`. No original Rules edit/deploy, Railway, production, real provider HTTP, paid traffic.
