# Reflect 2.0 — C3C3 frontend client Firestore CRUD compatibility gate

**2026-11-23 • READ-ONLY PINNED FRONTEND AUDIT / CURRENT LOCAL INVENTORY PENDING / NO RULES DEPLOY.**

## 1. True user evidence that enters this gate
User original dirty detached backend HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699`, original Rules blob `2cc47d40020e349edc6617a2f9e03578efe39799`. C3C2 FOUR NEW-file candidate patch SHA256 `3146a83e91f5707ac598937267003538b1759aaa4e8ed4c4f51eb800dc499c84`, candidate `server/hosted/firestore.pg04d4b3c3c2.candidate.rules` SHA256 `8090c2001f52e576bd0448474c6ed3968a0acd2aaa65569fb9ed3b404b94ae51`, successfully user installed.

Genuine independent **client Firestore Rules Emulator** on `demo-reflect-c3c2-rules`, `127.0.0.1:19090`, explicit candidate Rules and isolated Firebase JS SDK, **`PASS: C3C2 40/40 genuine client Firestore Rules candidate observations`** and **`GREEN: C3C2 7/7 previously unsafe writes DENIED`**. Exact synthetic cleanup PASS, no recursiveDelete, child exit 0, Emulator stopped. These tests use client SDK with synthetic identities; **no real browser Auth/AppCheck proof or live rules permission**. Several post-fence denied client writes reported `evaluation error at L35:25`, `L39:25`, `L43:25` instead of clean `false`. Their effective result was `permission-denied`; this remains a separate predicate evaluation quality/observability finding, and GREEN cannot be treated as unconditional source/security release.

Current candidate allows owner `sessions` subtree and pre-erasure `memoryEvents`, `memoryProjections`, `memoryTopics`; `profiles`, `goals`, `moods`, `diaryNotes`, `aiSettings` and all remaining unknown owner subcollections currently DENY.

## 2. Concrete, reproducible product compatibility regressions against pinned GitHub source
These are **code-level definite path-policy conflicts**, not user-observed browser test failures. Pinned backend/source commit `1c4c121e0e449f1a9360e4fb4588dcf58352e699` was fetched via connected GitHub; exact file blobs and line numbers below. Runtime/app state and dirty-local frontend may differ, so freeze local manifest before release.

| Path under `artifacts/reflect-8fdc8/users/{uid}` | Client code evidence | C3C2 Rule outcome | Product impact |
|---|---|---|---|
| `sessions/{sessionId}` + nested descendants | `src/App.jsx` blob `419dc49de13accd532beb15337c2d1620a97d760`: `useFirestore('sessions')` line39; `src/features/Sessions/sessionPersistence.js` blob `802cbe7f14fdada2009d8522dac4c7ba43600038` `setDoc` line27, `updateDoc` line39 | owner CRUD ALLOW | baseline preserved, not full behavioral certification |
| `goals/{goalId}` | App line40 subscription, line226 write; `src/features/Goals/goalOperations.js` blob `270d4782e787a8d8a84604dd19270ffe04327f1b` source line12 path, transaction line57/74, `deleteDoc` line146; `src/features/Sessions/recommendationDecisions.js` blob `6fe58470e856467c852dff5068500b03b618b024` multi-collection transaction lines44–47 | read/write DENY | goals screen, goal transactions and session→goal decisions break |
| `moods/{id}` | App line41 subscription; `src/features/Diary/Diary.jsx` blob `7870ba9e18db031d2ace28f983309527b791678e` `useEntrySave('moods')` line87; `src/hooks/useEntrySave.js` blob `cf190778b029998988e8425151e9a53df8b81776` dynamic collection `setDoc` lines44/50 | read/write DENY | mood log and dashboard fail |
| `diaryNotes/{id}` | App line42 subscription, line203/212/218 reflection write; Diary `useEntrySave('diaryNotes')` line86; `src/features/Diary/noteVersions.js` blob `f8a1a5a6c2d7a3b2228aec3cc9d81cf19ada842a` transaction line121 | read/write DENY | diary notes, revisions and reflections fail |
| `profiles/userProfile` | App lines147,179,184 `getDoc`/`setDoc` | read/write DENY | profile loading/saving blocked; App `readError` flow line296 may show application error |
| `aiSettings/preferences` | `src/features/AISettings/AISettings.jsx` blob `43a07ab7cba93237723958c8cf104007b420d71e`: path line15, `getDocFromServer` line62, `setDoc` line101; `src/api/ownerContextLevel.js` blob `e7c8b58dfef66f8e175446f1939005098bc4db36`: owner context reads line12/25 | read/write DENY | AI settings and context-level preferences break |

**Most serious regression:** App.jsx subscribes to four root collections on load; three of them (`goals`, `moods`, `diaryNotes`) are denied in the candidate. The app's `readError` handling is capable of surfacing a global loading/error state. This is not merely missing obscure settings; candidate is incompatible with the core Reflect UI even though isolated 40/40 test assertions are green.

## 3. Why not edit the candidate Rules yet
- The original broad owner-read/write wildcard is excessive around public erasure state; cannot restore it without recreating the seven proven vulnerabilities.
- Whitelisting `goals/moods/diaryNotes/profiles/aiSettings` blindly may restore legitimate CRUD, but privacy classification, cross-document transaction, nested paths, field-level rules, quota/read limits, mixed workers and erasure/retention policy are not yet fully reviewed.
- The original root docs are not the same as memory-derived artifacts by default; don't delete/deny original user content without legal/product policy, and don't automatically treat all data as memory-derived.
- Some C3C2 post-fence expected denies appeared as Rules evaluation errors; isolate why before a deploy candidate is considered.
- Client Rule success does not certify Admin APIs, original `memoryReply`, Auth/AppCheck ownership, erasure writer, charge reconciliation or any external HTTP.

## 4. Next phase C3C3a — local metadata-only source inventory, no new tests needed yet
Assistant-generated conversation artifact `REFLECT_C3C3_CLIENT_CRUD_INVENTORY_2026-11-23.py` SHA256 **`41eea747419de23df4ea307dfcea2dac9fc45184fd1da682b6b08a88c2d107a4`**, a **read-only** Python 3 script:
- hard guards root worktree name, HEAD `1c4c121e...`, original Rules Git blob `2cc47d...`, candidate SHA256 `8090c200...`; no network, no npm/Firebase and no mutation of source/Rules;
- scans supported frontend roots `src, client, web, app, apps, packages`, excluding node_modules/build/dist and symlinks; emits **only metadata** (source-relative paths, line numbers, API/hook names, literal collection hints, SHA256 file hashes, path-only git status). No source bytes, environment values, credentials, user documents or source diff in archive;
- creates `REFLECT_C3C3_CLIENT_CRUD_INVENTORY.tar.gz` under a fresh nested Downloads folder; owner inspects and attaches. Source content stays on the owner's Linux.
- author `python3 -m py_compile` PASS, isolated synthetic fake git-root test PASS (8 exact safe metadata tar members, no sources) with candidate original SHA guard; **user real local inventory NOT RUN/UPLOADED**.

Once received, independently audit metadata and ask for only specific missing source snippets if dynamic paths remain ambiguous, then build a **new additive compatibility test matrix** for verified legitimate owner CRUD and all seven erasure violations, before proposing candidate v2. Never replace, edit or deploy `server/hosted/firestore.rules` in this step.

## 5. Release gate / state
- `C3C1=OWNER_GENUINE_CLIENT_RED_20/20+7/7_FORBIDDEN_ALLOWS`.
- `C3C2=OWNER_GENUINE_CLIENT_40/40+7/7_GREEN+EXACT_CLEANUP+EXIT0`, but **COMPATIBILITY FAIL IN PINNED FRONTEND; RELEASE BLOCKED**.
- `C3C3a=PINNED_FRONTEND_PATH_AUDIT_PARTIAL+LOCAL_METADATA_INVENTORY_SCRIPT_PREPARED/OWNER_DATA_PENDING`.
- `PRIVACY_GATE=BLOCKED`, pending B2.1/B2.3/PG01–08 and real browser/Auth/AppCheck/approval+budget/erasure integration.
- No backend code push to runtime branch, no live Rules or Railway changes, no provider paid traffic.

[GitHub issue #136 C3C2 owner evidence and compatibility blocker](https://github.com/TheGor-365/reflect/issues/136#issuecomment-7085884520).
