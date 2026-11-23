# Reflect 2.0 — B2.1 final preview return checks (owner-local source evidence)

**Date:** 2026-11-23. **Scope:** privacy source review, NOT a release certificate.  
**Evidence origin:** actual user's Linux terminal pasted in the next conversation.  
**Local worktree:** `~/reflect-r10-railway-review`, dirty detached HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699`.  
**Marker:** `B2_1_PREVIEW_FINAL_CHECK_REVIEW` → `HEAD_OK` → two `SHA256_OK` → `B2_1_PREVIEW_FINAL_CHECK_READY`, `SOURCE_FILES_UNCHANGED`, `FIRESTORE_OPERATIONS=0`.  
**What ran:** read-only source inspection with string/comment redaction. **What did not run:** application import, actual HTTP request, Node tests, Firestore Emulator, live Firestore, Railway, provider.

## Pinned source and observations

| File | Owner-local SHA256 | Evidence |
| --- | --- | --- |
| `server/ai/sessionMemory.cjs` | `4fa4e61a0d8fc898395eba30fc61e7e3cd31a6491eafc87ab84489ce09c7870a` | `load()`: final pre-return `consentStore.check(target)` lines 162–164 then returns `{target,selected,digest}` at 165. `preview()` lines 168–176 awaits `load(...requireCommitted:false)` then returns frozen preview without another separate consent check. `authorize()` lines 178–194 awaits `load(...requireCommitted:true,approvedDigest)`, verifies turns nonempty, performs **additional** `consentStore.check(target)` at 185–187 before frozen return at 188–193. |
| `server/privacy/sessionContextPreview.cjs` | `072fa402f4c0d272b94d5ca8b6a5fe730b5c8ba8deb85539ef21ca7f0e4562a3` | `preview()` reads at line 129, rejects invalid/mismatched owner fields when they are present at 133–136, checks `consentStore.check(target)` again at 145–147, then returns frozen bounded preview at 149–155. No further check between line 147 and return. |

Previously accepted owner-local source review proved earlier checks: memory `load()` consent at 137 **before** `db.doc().get()` at 141; context preview consent at 119 **before** `ref.get()` at 129. Both recheck after read and fail closed for non-true/exception. The exact context-preview HTTP JSON allowlist `grantId,sourceId,scope` excludes `principal,uid`, mitigating the earlier *hypothetical* principal-overwrite risk **at source level**, not as executed negative HTTP acceptance.

**Precise conclusion:**
- `MEMORY_PREVIEW_CONSENT=BEFORE_READ_AND_AFTER_READ_SOURCE_VERIFIED`.
- `MEMORY_AUTHORIZE_CONSENT=BEFORE_READ_AFTER_READ_AND_EXTRA_PRE_RETURN_SOURCE_VERIFIED`.
- `CONTEXT_PREVIEW_CONSENT=BEFORE_READ_AND_AFTER_READ_BEFORE_RETURN_SOURCE_VERIFIED`.
- No reason to rewrite these already-present checks merely to duplicate source guards.
- **Not certified:** atomicity between last check and response/provider send; concurrent grant revocation or erasure after check; same-snapshot erasure generation invariant; runtime handler negative tests; actual Railway deployed source/flags.

## Next narrowly scoped owner-local evidence (READ ONLY)

The original pinned GitHub commit `1c4c121e` shows owner-bound Firestore templates: memory `artifacts/${NAMESPACE}/users/${target.uid}/sessions/${target.sourceId}`, context `artifacts/${NAMESPACE}/users/${principal.uid}/sessions/${sourceId}`. **These were inspected from GitHub committed bytes, not proven to match the dirty owner's local files.** Missing `ownerUid` and `uid` fields are tolerated by both adapters, so path binding must be independently checked against the SHA-pinned actual files before declaring missing owner metadata safe.

1. Verify exact local HEAD and both SHA256 values above. Without requiring/importing project modules, compare only the two **literal path templates and their immediate `db.doc` use**; output booleans, not source bodies, credential values, session data or actual UID.
2. If both checks pass, record `OWNER_BOUND_SESSION_PATHS=SOURCE_VERIFIED` and design minimal deterministic negative/race tests: foreign principal, missing owner fields with owner-scoped path, mismatched owner fields, consent denied before read / revoked during read / revoked after final check, Firestore read/check errors.
3. If a path check fails, **STOP** without patching, deploying, touching live Firestore or trusting the older GitHub source; inspect a sanitized narrow local fragment first.

**Non-goals:** production history enablement, paid provider execution, full destructive erasure, repository source merge, Rules edit, B2.3 retention approval, or replay/quota-ledger deletion.

**Overall gates:** `B2.1=PARTIAL_FINAL_RETURN_CONSENT_SOURCE_VERIFIED`; `OWNER_PATH_CURRENT_LOCAL=UNVERIFIED`; `ERASURE_TOCTOU=NOT_CERTIFIED`; `B2.3=DRAFT_NOT_APPROVED`; `PG01–08=OPEN`; `CLEAN_EVAL=NOT_CERTIFIED`; **`PRIVACY_GATE=BLOCKED`**. Previous C3C3e12 24/24 and C3C3e14 4/4 offline synthetic suites remain historical accepted evidence, **not rerun**.
