# Reflect C3C3d — isolate Firestore Rules `!exists()` false-predicate diagnostics
**2026-11-23 • diagnostic-only, no app source/Rules modification, deployment or paid provider.**

## Owner C3C3c2 evidence accepted
The user ran SHA256-guarded `REFLECT_C3C3C2_EXPRESSION_POSITION_AUDIT_2026-11-23.py` on their private scratch Firestore Emulator JSON, **PASS** on original Rules Git blob `2cc47d40020e349edc6617a2f9e03578efe39799`, candidate C3C3b Rules SHA256 `780bee8885d3ff4ef66153d6aaa4c81fd2add72d039c361a1314a878839dc9b2`, exact private coverage report SHA256 `29947bcab7ae6a175c94f72dc1fe410d982bd1e9c4af86d081eeb93999594d2e` (owner-local file, not independently downloadable). Local stdout:
```
REPORT_ENTRIES=28
WALK_NODES=63
VALUE_TYPE_COUNTS=false:7,other-oneof:59,true:13,undefined:7
UNDEFINED_LINE_HIST=28:3,29:2,33:2
UNDEFINED_EVAL_COUNT_BY_LINE=28:72,29:48,33:48
LINE_28_EXPR=7,UNDEFINED=3,TRUE_EVALS=15,FALSE_EVALS=21
LINE_29_EXPR=6,UNDEFINED=2,TRUE_EVALS=6,FALSE_EVALS=6
LINE_33_EXPR=3,UNDEFINED=2,TRUE_EVALS=42,FALSE_EVALS=18
UNKNOWN_LOCATION_EXPR=0
MALFORMED_VALUE_ITEMS=0
SOURCE_AND_IDENTIFIERS_NOT_PRINTED=YES
CLEAN_EVAL_NOT_CERTIFIED
```
The exact source snapshot in conversation C3C3b patch confirms:
- Line **28**: `return !exists(/databases/$(database)/documents/artifacts/.../memoryControl/erasure)`
- Line **29**: `&& !exists(/databases/$(database)/documents/_reflectAiPrivate/.../memoryErasureFences/$(uid))`
- Line **33**: `allow write: if owner() && memoryWritesOpen();` for `memoryEvents`

These are positional correlations, **not a proven root cause**. `value.undefined` may reflect rule-expression evaluation semantics, short-circuiting, or an Emulator diagnostic bug; there was no `error` key in the prior coverage scan, while failed client writes printed generic `evaluation error`. The real user previously verified C3C3b **80/80 client observations, 7/7 forbidden DENY**; C3C3c four markers state test **4/4 PASS** and exact synthetic cleanup; neither constitutes a production privacy approval.

## New C3C3d isolated control diagnostic
This checkpoint accompanies the **user-facing** standalone script:
`REFLECT_C3C3D_EXISTS_FALSE_CONTROL_2026-11-23.sh`
**SHA256 `5df91a5ef96443b991f39761e16e85ea3fca76121bc71da8281da336df73956c`**.

Design:
- Author checked shell `bash -n`, embedded Node `node --check`, Firebase JSON and static rules line bindings; **no genuine Firebase Emulator run in author environment**. The script checks pinned original+candidate Rules and owner dirty detached HEAD, SDK cache and local Admin SDK.
- Makes only a **new private scratch folder** in user's Downloads, with an independent 16-line **synthetic test ruleset**, a Firestore-only local Firebase config and JS probe. Existing project files and existing candidiate rules untouched.
- Dedicated **`demo-reflect-c3c3d-exists-control`** Firestore Emulator at loopback **127.0.0.1:19093**; credentials/remote cloud config denied. Exact opt-in, fake owner tokens and synthetic marker documents only.
- FOUR probes: **NO_MARKER=ALLOW**, **MARKER_EXISTS=DENY** from `!exists()`; **LITERAL_FALSE=DENY**; **FOREIGN_OWNER=DENY**. This creates two different intentional-false control cases without any Reflect app data. The standalone expression is `!exists(/databases/$(database)/documents/_diagnosticMarkers/$(uid))`. It uses the same Rules primitive as C3C3b, but deliberately does **not** test the whole private/public erasure policy.
- Collects `ruleCoverage` while Emulator is running and prints **only numeric line/type histograms**; full raw coverage stays under owner-only local scratch (never upload without inspection). Counts `evaluation error` in new scratch debug log, never copies old log or originals. Removes only exact per-run synthetic refs (never recursiveDelete), stops Emulator and prints exit status.

Expected (NOT confirmed): four explicit ALLOW/DENY outcomes, `ruleCoverage HTTP200`, exact scoped cleanup PASS, emulator exit0. Distinguishing generic `evaluation error` in a syntactically valid `false` predicate from an actual exception requires inspecting coverage results, **not just HTTP DENY**. Official [Firebase Rules Emulator reports](https://firebase.google.com/docs/rules/emulator-reports) supports expression evaluation tracing. [Upstream firebase-tools #11283](https://github.com/firebase/firebase-tools/issues/11283) reports generic evaluation errors on valid false `exists()` rules in a synthetic emulator; this is context only, **not conclusive for Reflect**.

## Release gates and next after the user run
If the isolated `!exists()` false-control reproduces undefined/evaluation errors while literal false is clean, classify as **diagnostic ambiguity** supported by isolated evidence, not necessarily a Rules implementation error. If both fail or error types differ, investigate emulator version/coverage. The C3C3b candidate still cannot be merged or deployed pending reviewed field-level CRUD/dynamic paths (including three untracked local Memory modules), real browser Auth/AppCheck owner attestation, original memoryReply/budget/erasure transaction logic and mixed-worker compatibility, B2.1/B2.3 and PG01–08.

**Statuses:** `C3C3c2=OWNER_COVERAGE_LINE_ATTRIBUTION_PASS`; `C3C3d=AUTHOR_ISOLATED_4CASE_CONTROL_PREPARED/USER_REAL_RUN_PENDING`; `C3C3b=OWNER_REAL_CLIENT_80/80+7/7_GREEN/RELEASE_BLOCKED`; `PRIVACY_GATE=BLOCKED`. No original Rules change, Railway or production action.
