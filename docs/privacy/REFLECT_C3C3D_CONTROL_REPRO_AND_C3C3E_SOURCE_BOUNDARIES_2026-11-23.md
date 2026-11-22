# Reflect 2.0 — C3C3d false-`exists()` control accepted; C3C3e source-boundary audit next
**2026-11-23. Documentation evidence only; no app Rules/source merge or production rollout.**

## Owner real C3C3d synthetic-control evidence (accepted)
User executed checksum-verified script `REFLECT_C3C3D_EXISTS_FALSE_CONTROL_2026-11-23.sh`, SHA256 `5df91a5ef96443b991f39761e16e85ea3fca76121bc71da8281da336df73956c`; script verified dirty detached HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699`, original `server/hosted/firestore.rules` Git blob `2cc47d40020e349edc6617a2f9e03578efe39799`, and isolated C3C3b v2 candidate SHA256 `780bee8885d3ff4ef66153d6aaa4c81fd2add72d039c361a1314a878839dc9b2`. No source modifications.

Real **Firestore client** SDK against synthetic-only separate minimal rules, local `demo-reflect-c3c3d-exists-control` at `127.0.0.1:19093`. All **4/4** actual client observations:
- `NO_MARKER=ALLOW`;
- `MARKER_EXISTS=DENY` for `!exists(/databases/$(database)/documents/_diagnosticMarkers/$(uid))`: **Emulator printed generic `evaluation error at L6:24`**, not `false`;
- `LITERAL_FALSE=DENY`: **same emulator printed straightforward `false for 'create' @ L11`**, no generic `evaluation error` for that denial;
- `FOREIGN_OWNER=DENY`: ordinary `false for 'create' @ L6`, not generic evaluation error.
- `RULE_COVERAGE_HTTP=200`, `COVERAGE_LINE_6=expr:5,undefined:1,true:3,false:2`, `COVERAGE_LINE_7=expr:5,undefined:0,true:1,false:1`, `COVERAGE_LINE_8=expr:5,undefined:2,true:2,false:2`, `COVERAGE_UNDEFINED_TOTAL=3`. Local raw ruleCoverage SHA256 **`8451b836bddcaf1852366f4e6d8987e5f025de6a49f9797425d09410849c197d`** as user printed; assistant has NOT independently accessed owner-local bytes.
- `EXACT_SCOPED_CLEANUP=PASS` without recursiveDelete; script child exit **0**, emulator shut down. `DEBUG_GENERIC_EVALUATION_ERROR=3`, `DEBUG_EXPLICIT_EVALUATION_EXCEPTION=0`, `DEBUG_VARIABLE_UNBOUND=0`, `DEBUG_SERVICE_CALL_ERROR=0`.
- Scratch dir `/home/gor/Загрузки/reflect-c3c3d-exists-UQGMJ36f`, not source tree.

**Conclusion, bounded:** A minimal independent valid `!exists()` predicate that correctly returns DENY when synthetic marker exists reproduces the **same class of generic evaluation-error diagnostic**, while a literal false denial and foreign owner denial give clean `false` diagnostics. This supports an **Emulator diagnostic/evaluation-reporting ambiguity for the false `!exists()` path** in this installed environment. It does NOT establish that the full Reflect C3C3b erasure predicate is clean, does NOT rule out distinct root causes, and does NOT permit removing either erasure fence. `CLEAN_EVAL` remains **NOT_CERTIFIED**; no further 80/80 or 4/4 replay just to reconfirm identical observations.

Previously accepted: C3C1 original Rules genuine client **20/20 observations with 7/7 forbidden operations allowed (EXPECTED_RED)**; C3C2 candidate **40/40 and 7/7 formerly unsafe denied** but broke core owner CRUD; C3C3b v2 candidate **80/80 and seven forbidden DENY** with core collection CRUD tested, + scoped cleanup/exit0; C3C3c focused **4/4** marker states, ruleCoverage; C3C3c2 undefined attribution to Rules lines 28:3/29:2/33:2.

## Next C3C3e — source-based trust boundary, field-level writes and 3 local Memory files
Source read from pinned repository HEAD:
- `src/features/AISettings/aiSettingsModel.js` blob `3cfdf1076be86e5ea8e3505ca643208417163157` explicitly says **server independently validates AI setting fields and source grants**; client settings `aiSettings/preferences` are **not a history-consent grant**.
- `src/api/ownerContextLevel.js` blob `e7c8b58dfef66f8e175446f1939005098bc4db36` reads only owner's `aiSettings/preferences` and explicitly labels this a preference, not a session grant.
- `server/privacy/contextConsent.cjs` blob `fa80e33005a4866796713274910b6af335f5740f` issues/checks private context grants in `_reflectAiPrivate/.../contextGrants` using authenticated server context and Admin transaction. `server/ai/memoryReply.cjs` blob `972c488a9df3d43f4af15ee6390dfe62687277a3` documents separate owner-signed history approval and validates stored grant/digest rather than trusting a client AI settings flag.
- `src/security/ownerDataRecovery.js` blob `5e83a64f164d5745c91590c8947637d71d1723ab` explicitly restricts restoration to an Emulator demo mode. Its cross-collection owner transaction paths need browser regression checks under Rules v2. Do not generalize test-only restore to production.
- Three local **untracked** `src/features/Memory/topicEvidenceContract.js`, `topicMemoryAudit.r102c.js`, `topicMemoryProjection.js` are reported by C3C3a source metadata but **are NOT present in GitHub pinned HEAD**; their actual source and import semantics remain unknown. We should not copy/push those files or claim a full field-level audit before a minimal code-independent local metadata inspection.

For the user, next is a **single read-only local command** to output for those three files only: existence, sha256, line count, use of Firebase client SDK / Firestore Admin imports, Firestore API-call counts, and literal collection-name hits. Do not output file contents, env values, tokens, private client data, or absolute paths. This is a precondition to decide whether additional Rules collection grants or field-level-negative probes are warranted; it is not an authorization to widen any allow. If files do not exist or changed, report that rather than recreate or reset.

## Release restrictions
`C3C3d=OWNER_4/4_CLIENT_CONTROL_PASS+RULECOVERAGE_HTTP200+FALSE_EXISTS_GENERIC_EVAL_WARNING_REPRODUCED`;
`C3C3e=SOURCE_BOUNDARY_PARTIAL/THREE_LOCAL_MEMORY_MODULES_METADATA_PENDING`;
`C3C3b=OWNER_80/80+7/7_GREEN/RELEASE_BLOCKED`;
`PRIVACY_GATE=BLOCKED`. Pending clean-expression attribution, full client dynamic CRUD and field-level verification, real Firebase Auth/AppCheck+owner one-use approval, original memoryReply and budget/recovery/erasure generation/lease integration, mixed workers, PG01–08/B2.1/B2.3. No original Rules replacement, production Firestore, Railway or provider calls.
