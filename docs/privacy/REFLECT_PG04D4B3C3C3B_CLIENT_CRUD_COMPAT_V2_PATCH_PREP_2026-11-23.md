# Reflect 2.0 — C3C3a metadata audit accepted; C3C3b standalone client CRUD-compatible Rules v2 TEST PATCH PREPARED
**2026-11-23 • ONLY documentation + independent chat artifact • not backend source commit, not deployed.**

## Verified user material
Owner-uploaded `REFLECT_C3C3_CLIENT_CRUD_INVENTORY.tar.gz` independently verified SHA256 **`43ad78a4069c3b56927d525b0ba83cf5f7a597cdad0e4db6bf408dc18e652e3e`** (matches terminal). Strictly eight **regular metadata** entries, no source files:
`CLIENT_CALLS.tsv`, `COLLECTION_HINTS.tsv`, `DYNAMIC_PATH_REVIEW.tsv`, `FIRESTORE_FILES.tsv`, `LOCAL_SRC_STATUS.txt`, `META.txt`, `README.txt`, `SOURCE_SHA256.tsv`.
No symlink or suspicious paths. Meta reports local HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699`, original Rules blob `2cc47d40020e349edc6617a2f9e03578efe39799`, C3C2 candidate Rules SHA256 `8090c2001f52e576bd0448474c6ed3968a0acd2aaa65569fb9ed3b404b94ae51`, 200 scanned frontend source files, 86 API/hook call occurrences, 37 literal collection hints, 65 dynamic-review row occurrences. Values verified in archive, NOT source-file bytes independently validated because only hashes were packaged.

Local source metadata reports **three untracked files**:
`src/features/Memory/topicEvidenceContract.js`,
`src/features/Memory/topicMemoryAudit.r102c.js`,
`src/features/Memory/topicMemoryProjection.js`.
Their content is NOT in the archive. No claim of fully approved client-path inventory or runtime deployed version.

## Resolved collection-level compatibility needs (verified against pinned GitHub frontend source)
| Owner collection under `artifacts/reflect-8fdc8/users/{uid}/` | Verified client usage | Evidence |
|---|---|---|
| `sessions` | subscribed/read, create, update, nested turn-related records; Mindspace and recommendation transactions | `src/App.jsx:39`; `src/features/Sessions/sessionPersistence.js:19–39`; `src/features/Mindspace/mindspaceOperations.js:25–98` |
| `goals` | subscribed/read, create/update/delete, goals transactions and Mindspace linking | `src/App.jsx:40`; `src/features/Goals/goalOperations.js:12–146`; `src/features/Mindspace/mindspaceOperations.js:26` |
| `moods` | subscribed/read, created via shared entry-save hook | `src/App.jsx:41`; `src/features/Diary/Diary.jsx:87`; `src/hooks/useEntrySave.js:44–50` |
| `diaryNotes` | subscribed/read, create, edits in transaction, notes in session interactions | `src/App.jsx:42`; `src/features/Diary/noteVersions.js:119–121`; `src/features/Diary/Diary.jsx:86` |
| `profiles/userProfile` | read and merge-set, included in export/import | `src/App.jsx:147–184`; `src/security/ownerDataExport.js:86`; `src/security/ownerDataRecovery.js:176,235–262` |
| `aiSettings/preferences` | explicit getDocFromServer + setDoc, level lookup | `src/features/AISettings/AISettings.jsx:15,62,100–101`; `src/api/ownerContextLevel.js:12,25` |

The 65 dynamic-review entries include helper indirection and tests; 65 ≠ 65 distinct Firestore paths. Other confirmed sources `ownerDataExport.js` read 4 core collections and profile; `ownerDataRecovery.js` restore docs via transaction; `readinessPersistence`, `sessionReturn`, `hypothesisReviews`, `recommendationDecisions` update sessions/goals. Current C3C2 client Rules **40/40 PASS and seven unsafe operations DENIED** but would DENY five of six core owner collections: actual compatibility blocker. A full AST/callgraph and three local untracked Memory module review are still OPEN.

## NEW independent C3C3b candidate v2 artifact (not pushed into original source branch)
**Conversation patch** `REFLECT_PG04D4B3C3C3B_CLIENT_CRUD_COMPAT_CANDIDATE_V2_2026-11-23.patch` SHA256
**`c60961516f08708755b108ed3dcfc222cd0458aeb12565cf8a25deea0d50e5c8`**.
Exactly FOUR new files:
1. `server/hosted/firestore.pg04d4b3c3c3b.compat.rules`, SHA256 **`780bee8885d3ff4ef66153d6aaa4c81fd2add72d039c361a1314a878839dc9b2`**. Preserve owner-only read/write for source-confirmed `sessions`, `goals`, `moods`, `diaryNotes`, `profiles`, `aiSettings` including descendants, while restricting three memory-derived collections to owner writes before both erasure fences; client private namespace entirely DENY; public `memoryControl/erasure` GET-only, no owner wildcard ALLOW. This is intentionally broad within each known core collection; no field-level permission hardening has been reviewed.
2. `firebase.pg04d4b3c3c3b.rules.json` explicitly loads independent candidate Rules at `127.0.0.1:19091` with `demo-reflect-c3c3b-rules`, UI disabled.
3. `server/privacy/pg04d4b3c3c3bClientCrudRules.emulator.cjs`: preserves 40 C3C2 client DENY/ALLOW cases, plus **40 new** cases for 5 source-supported collections (30 owner/foreign/anonymous before fence, 10 owner edit/delete after fence). **80 planned** client checks; 7 previously unsafe must still DENY; explicit strict owner/host/project/cloud credential/Rules hash guard, original Rules and previous C3C2 candidate identity guard, exact synthetic fixtures cleanup with no recursiveDelete. Synthetic in-process Firestore client identities, no live Firebase Auth/AppCheck.
4. `docs/privacy/REFLECT_PG04D4B3C3C3B_CLIENT_CRUD_COMPAT_CANDIDATE_2026-11-23.md`: local runbook and release exclusions.

**Author QA only:** JS syntax, JSON, Rules/patch SHA, static 40+40 count, `git diff --check`, clean isolated C3C2 source base `git apply --check` + `git apply --whitespace=error` and previous files equality **PASS**. Guarded preflight reached client SDK import in sandbox; sandbox lacks Firebase JS SDK and CLI, so **NO real C3C3b Emulator run was performed**. Previous user C3C2 genuine 40/40 PASS remains accepted; do not rerun needlessly.

## Owner next action and remaining gates
Owner may verify exact patch SHA and apply only FOUR new files to dirty detached backend. Then isolated `demo-reflect-c3c3b-rules` port 19091 with `NODE_PATH=~/.cache/reflect-c3c1-firebase-sdk/node_modules`, explicit opt-in and cloud credential environment unset; report owner `80/80`, `7/7`, cleanup, exit0 and **whether log contains `evaluation error`**. A 80/80 test can still be fail-closed by evaluation errors; clean Rules evaluation proof is a **separate required gate**. Also need full frontend/browser compatibility, field-level ownership, untracked Memory modules and deploy SHA, owner-attested approvals, budget/recovery/erasure writer integration, PG01–08/B2.1/B2.3.

**Status:** `C3C3a=USER_ARCHIVE_SHA_AND_METADATA_VERIFIED+PATH_MATRIX_PARTIAL`; `C3C3b=TEST_ONLY_ADD_4_PATCH_PREPARED / OWNER_REAL_EMULATOR_0/80_PENDING`; `C3C2=USER_REAL_CLIENT_40/40+7/7_GREEN/BLOCKED_BY_CRUD`; `PRIVACY_GATE=BLOCKED`. **NO original Rules edit, backend source release, Railway/staging/production, cloud writes or paid AI.**
