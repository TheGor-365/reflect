# Reflect PG04D4B3C3C3C — C3C3b user-green acceptance and CLEAN-EVAL diagnostics
**2026-11-23 • DOCS AND READ-ONLY TRIAGE ONLY • PRIVACY_GATE=BLOCKED**

## Accepted C3C3b owner terminal facts
Actual Linux dirty detached backend `~/reflect-r10-railway-review`, HEAD `1c4c121e`. The additive C3C3b Rules v2 candidate patch `REFLECT_PG04D4B3C3C3B_CLIENT_CRUD_COMPAT_CANDIDATE_V2_2026-11-23.patch` SHA256 `c60961516f08708755b108ed3dcfc222cd0458aeb12565cf8a25deea0d50e5c8` installed with source guards + `git apply --check`, `--whitespace=error`, JS syntax, JSON and `git diff --check` PASS. Candidate `server/hosted/firestore.pg04d4b3c3c3b.compat.rules` SHA256 `780bee8885d3ff4ef66153d6aaa4c81fd2add72d039c361a1314a878839dc9b2`. Original `server/hosted/firestore.rules` Git blob remains `2cc47d40020e349edc6617a2f9e03578efe39799`; dirty Railway file untouched.

Genuine isolated Firebase **client** Rules Emulator `demo-reflect-c3c3b-rules` at `127.0.0.1:19091`, explicit candidate Rules, credential environment unset, and client SDK cached separately:
- **`PASS: C3C3B 80/80 genuine client Firestore Rules compatibility observations`**.
- **`GREEN: C3C3B 7/7 unsafe writes DENIED`**: public owner erasure marker CREATE/UPDATE/DELETE and post-fence memoryEvents, memoryProjections, memoryTopics, nested event note CREATE. Also private metadata/lease/approval grants DENY, foreign/anonymous DENY, source-backed owner CRUD on `sessions/goals/moods/diaryNotes/profiles/aiSettings` ALLOW, including test checks after erasure.
- `PASS: C3C3B exact per-run synthetic refs cleanup; no recursiveDelete`, child **exit code 0**, Firestore emulator clean shutdown, benign hub/logging 4401/4501 fallback.
- **Separate CLEAN-EVAL unproven:** actual stdout includes repeated `evaluation error at L33:25`, `L37:25`, `L41:25` for post-erasure client writes even though SDK returned `permission-denied`. At C3C3b Rules lines 33,37,41: `allow write: if owner() && memoryWritesOpen();`, where `memoryWritesOpen()` calls two `exists()` against public/private canonical erasure markers. **Do not infer the cause** from the SDK stderr alone, or claim every predicate evaluated normally. `evaluation error` can also arise from Emulator evaluation passes; local engine diagnostics/version and rules coverage must be checked. Never relax the public/private fence checks to force successful writes.

## Current next gate — READ-ONLY original local log triage (no re-running 80 tests)
In `~/reflect-r10-railway-review`, original Rules blob and v2 candidate SHA must still match. Report `firebase --version`, `java -version` and **counts and safe exception class fragments ONLY** from `firestore-debug.log`; do not upload the raw log (it may hold identifiers or headers). In absence of sufficient evidence, separately run an isolated minimal reproducer with `:ruleCoverage` instrumentation while Emulator is alive, not another blanket 80-test rerun. Actual Firebase official docs: https://firebase.google.com/docs/firestore/security/test-rules-emulator and https://firebase.google.com/docs/firestore/security/rules-conditions.

Suggested user-safe read-only command (stderr and log content must be redacted before posting):
```bash
bash <<'BASH'
set -euo pipefail
cd "$HOME/reflect-r10-railway-review"
[[ "$(git hash-object -- server/hosted/firestore.rules)" == "2cc47d40020e349edc6617a2f9e03578efe39799" ]] || { echo STOP_ORIGINAL_RULES; exit 1; }
[[ "$(sha256sum server/hosted/firestore.pg04d4b3c3c3b.compat.rules | awk '{print $1}')" == "780bee8885d3ff4ef66153d6aaa4c81fd2add72d039c361a1314a878839dc9b2" ]] || { echo STOP_C3C3B_CANDIDATE; exit 1; }
printf 'firebase_cli='; firebase --version
java -version 2>&1 | head -n 1
python3 - <<'PY'
from pathlib import Path
import re
p=Path('firestore-debug.log')
print('debug_log_present=',p.is_file())
if p.is_file():
    data=p.read_text(encoding='utf-8', errors='replace')
    for label, pattern in {
        'service_call_error':r'Service call error',
        'evaluation_exception':r'EvaluationException',
        'variable_unbound':r'Variable is not bound',
        'rules_runtime_error':r'com\.google\.firebase\.rules.*(?:Error|Exception)',
        'emulator_version':r'cloud-firestore-emulator-v[\d.]+',
    }.items():
        print(label+'_count=',len(re.findall(pattern,data,re.I)))
    classes=sorted(set(re.findall(r'(?:[\w$]+\.)+(?:[\w$]*(?:Exception|Error))',data)))
    print('exception_class_names=',','.join(classes[:12]) or 'NONE')
print('C3C3c=CLEAN_EVAL_CAUSE_NOT_YET_ESTABLISHED')
PY
BASH
```
Only sanitized printed counts and class names can be shared, never full debug logs, access tokens or customer records. The existence of `evaluation error` in a first pass alone is not evidence that an allowed operation failed, but it DOES prevent the strong claim of clean evaluation until traced.

## Remaining release and implementation gates
- C3C3c engine evaluation/root-cause and independent clean authorized/denied trace; full client field-level and dynamic CRUD audit; owner browser/Auth/AppCheck real consent confirmation; original memoryReply/hostedBudget/aiTurnRecovery/erasure source transaction integration; mixed-worker rollout; B2.1, B2.3, PG01–08 privacy/legal retention.
- No original Rules merge, Firestore Rules deployment, Railway, production data deletion, provider xAI HTTP or paid traffic.

**State:** `C3C3b=OWNER_REAL_CLIENT_80/80_PASS+7/7_GREEN+EXACT_CLEANUP+EXIT0/RELEASE_BLOCKED`; `C3C3c=LOCAL_EMULATOR_CLEAN_EVAL_LOG_DIAG_PENDING`; `PRIVACY_GATE=BLOCKED`.
