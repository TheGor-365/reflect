# Reflect 2.0 — B2.1 owner-scoped session path source proof and negative-test boundary

**Verified date:** 2026-11-23. **Scope:** owner-local source-only proof, no runtime acceptance or deployment.  
**Owner workspace:** `~/reflect-r10-railway-review`, dirty detached HEAD `1c4c121e0e449f1a9360e4fb4588dcf58352e699`.  
**Owner terminal marker:** `B2_1_OWNER_PATH_REVIEW` → `HEAD_OK` → two `SHA256_OK` → `MEMORY_OWNER_PATH: true` → `CONTEXT_OWNER_PATH: true` → `B2_1_OWNER_PATH_READY` → `SOURCE_FILES_UNCHANGED`, `FIRESTORE_OPERATIONS=0`.  
**Input evidence:** user's pasted stdout in continuation chat 2026-11-23. No file contents, private data, Firestore client, provider or application modules were executed by this proof.

## Verified exact local file identities and path-use patterns

| Owner-local file | SHA-256 | Structural assertion | Observed |
| --- | --- | --- | --- |
| `server/ai/sessionMemory.cjs` | `4fa4e61a0d8fc898395eba30fc61e7e3cd31a6491eafc87ab84489ce09c7870a` | `const path = \`artifacts/${NAMESPACE}/users/${target.uid}/sessions/${target.sourceId}\`;` immediately used in `await db.doc(path).get()` | exactly one match, **true** |
| `server/privacy/sessionContextPreview.cjs` | `072fa402f4c0d272b94d5ca8b6a5fe730b5c8ba8deb85539ef21ca7f0e4562a3` | `db.doc(\`artifacts/${NAMESPACE}/users/${principal.uid}/sessions/${sourceId}\`)` | exactly one match, **true** |

These results establish that this particular owner-local source constructs a **single selected session document path under the trusted principal's UID**, rather than an enumerable cross-owner collection or a request-selected owner UID. Earlier checked source validates `principal.uid` through server-derived Auth/AppCheck callbacks and checks consent before/after reading; memory `authorize()` also has a separate final check. Explicit `session.ownerUid`/`session.uid` mismatches are rejected if the fields exist. Missing metadata is not by itself an owner-isolation leak given this confirmed path composition, but **runtime behavior still needs a focused negative test**.

## Existing test inventory, not rerun

Pinned GitHub commit `1c4c121e` already contains relevant local-only suites:
- `server/ai/sessionMemory.test.cjs`: foreign owner metadata, revoked grant before preview, revocation during read, revoked final authorize check, changed digest, no other-session reads and context bounds.
- `server/privacy/sessionContextPreview.test.cjs`: invalid server principal/scope/source, first and second consent refusal, consent exception, wrong owner metadata, missing document and failed read.
- `server/privacy/contextPreviewHttp.test.cjs`: forged/extra user JSON keys, Origin/Auth/AppCheck/replay/account/quota denials and read-stage revoke.
- `server/ai/sessionMemoryPreviewHttp.test.cjs`: signed preview Auth/AppCheck constraints and output validation.

This inventory is taken from **pinned GitHub code**, not a fresh run against the owner's dirty worktree. Do not present any of the above as newly passed test cases or run a generic redundant suite for its own sake.

## Next incremental acceptance (one synthetic offline in-memory test batch)

Run against **SHA-pinned actual local adapters** with injected fake `db.doc` and `consentStore.check` only:
1. A document missing BOTH `ownerUid` and `uid` succeeds **only** at the exact owner+source path and returns bounded untrusted preview, never reads another UID.
2. Document with explicit foreign `ownerUid` or `uid` rejects, even when at the selected owner path.
3. Revoke consent between pre-read and post-read checks: no preview result. Check errors reject; no hidden provider call.
4. For memory `authorize()`, revoke at the third/pre-return check: no authorized value.

Require exact `HEAD` and two file SHA-256 values, no cloud/Emulator/real data and no source modification. Distinguish a green **fake-only module test** from real Firestore Admin Emulator or true HTTP acceptance.

## Race/erasure policy remains explicitly OPEN

Two/three separate read-then-check operations do **not** create a single Firestore transaction with the erasure-generation lease, nor an atomic boundary around irreversible provider egress. The user-local C3C1 real-core fake diagnostics already exposed a **late-send-after-fence** scenario and budget closeout mismatch. Do not relabel that as repaired by this B2.1 path check. Real provider history dispatch, old replicas, R9.2 client Rules, source revision, billing/attempt state and B2.3 retention still require separately evidenced release gates.

**Status:** `B2.1=PARTIAL_OWNER_PATH_SOURCE_VERIFIED`, `OWNER_PATH_CURRENT_LOCAL=SOURCE_VERIFIED`, `MISSING_OWNER_METADATA_RUNTIME=UNTESTED`, `ERASURE_TOCTOU=NOT_CERTIFIED`, `PG01–08=OPEN`, `B2.3=DRAFT_NOT_APPROVED`, `CLEAN_EVAL=NOT_CERTIFIED`, **`PRIVACY_GATE=BLOCKED`**. No source/Firestore/Rules/Railway/provider change.
