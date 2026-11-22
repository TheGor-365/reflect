# Reflect 2.0 — PG04D4B3C3C1: genuine client Firestore Rules EXPECTED-RED gate (patch prepared)

2026-11-22 • DOCS-ONLY HANDOFF • USER EXECUTION PENDING • PRIVACY_GATE=BLOCKED.

## Input provenance
Owner's exact Linux scoped `git hash-object -- server/hosted/firestore.rules` output **`2cc47d40020e349edc6617a2f9e03578efe39799`**, matching GitHub pinned original rule file. Scoped status shows ` M server/railway/index.cjs`, no local change to `server/hosted/firestore.rules`. Existing dirty Railway source MUST NOT be reset, staged, committed or modified.

Prior `C3B` owner genuine Firebase Admin Emulator 10/10 PASS + exact cleanup/exit0 is accepted. Admin SDK bypasses Firestore Rules: those tests are **not** client DENY evidence. Source audit C3C0 established original `memoryReply` and restored erasure/budget/recovery differences; C3C0 source checkpoint stored in docs branch.

## Real vulnerability class (not yet reproduced in a client Emulator)
Pinned `server/hosted/firestore.rules`: all `/_reflectAiPrivate/{document=**}` browser access DENY; broad recursive `artifacts/{appNamespace}/users/{uid}/{document=**}` owner read/write ALLOW. Its owner ALLOW also matches PUBLIC `memoryControl/erasure` create/update/delete and owner write to `memoryEvents`, `memoryProjections`, `memoryTopics` after a server-created public erasure fence. Firestore Rules combine overlapping matching ALLOW conditions with **OR**, so an additional narrower DENY cannot cancel this broad owner ALLOW. An actual Rules client SDK test is the next gate. Independent official Firebase docs: https://firebase.google.com/docs/firestore/security/rules-structure and https://firebase.google.com/docs/firestore/security/test-rules-emulator.

## New local-only additive patch
`REFLECT_PG04D4B3C3C1_CLIENT_RULES_EXPECTED_RED_2026-11-22.patch` SHA256 **`2fe63d14d5bc0c19dfa78f7e05c313d5b76aa33eebb23eb839aa4063254ac8da`**, exactly 3 NEW paths, does NOT alter any existing file or push backend code:
1. `firebase.pg04d4b3c3c1.rules.json` at repository root — explicitly loads original `server/hosted/firestore.rules`, isolated `127.0.0.1:19089`, UI disabled.
2. `server/privacy/pg04d4b3c3c1ClientRules.emulator.cjs` — strict immutable source Git blob pin, `GCLOUD_PROJECT=demo-reflect-c3c1-rules`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:19089`, `REFLECT_PG04D4B3C3C1_RULES_ONLY=YES_SYNTHETIC`, no Firebase/Google credentials, client SDK mock owner/foreign/anonymous plus Admin-only fixtures and exact-scoped cleanup.
3. This technical runbook.

**Author validations:** original Rules Git blob exactly matches user's local `2cc47...`; new JS `node --check` PASS, Firebase JSON parse PASS, generated 3-file patch fresh `git apply --check` + `git apply --whitespace=error` PASS on clean simulated repo, `git diff --check` PASS and original rules file unchanged. **No genuine Emulator or client SDK test run in author environment (deps/CLI unavailable).**

## Owner run (safe isolated demo, no real provider)
Download patch in local Downloads and checksum-gated apply it to dirty detached backend only if all 3 destination paths are absent; no reset/clean, no blanket git add. Confirm `19089` free; DO NOT stop existing `18081` or `19087`. Root `firebase`, server `firebase-admin` and local Firebase CLI required.

After patch apply:
```bash
cd ~/reflect-r10-railway-review
export ASDF_NODEJS_VERSION=22.23.4
node --check server/privacy/pg04d4b3c3c1ClientRules.emulator.cjs
python3 -m json.tool firebase.pg04d4b3c3c1.rules.json >/dev/null
[[ "$(git hash-object -- server/hosted/firestore.rules)" == "2cc47d40020e349edc6617a2f9e03578efe39799" ]] || { echo 'STOP: RULES_SOURCE_MISMATCH'; exit 1; }
if ss -H -ltn '( sport = :19089 )' | grep -q .; then echo 'STOP: 19089 occupied'; exit 1; fi
firebase emulators:exec --only firestore --project demo-reflect-c3c1-rules --config firebase.pg04d4b3c3c1.rules.json \
  'env -u FIREBASE_CONFIG -u GOOGLE_APPLICATION_CREDENTIALS REFLECT_PG04D4B3C3C1_RULES_ONLY=YES_SYNTHETIC GCLOUD_PROJECT=demo-reflect-c3c1-rules FIRESTORE_EMULATOR_HOST=127.0.0.1:19089 node server/privacy/pg04d4b3c3c1ClientRules.emulator.cjs'
```

## Exact expected result — still **security BLOCKED**
- 20 total real client SDK observations; 13 safe controls (private DENY, owner original session ALLOW, foreign/anonymous DENY, owner before-fence memory event ALLOW, owner public fence READ-only concept) and **7 EXPECTED_RED unsafe owner ALLOW**: public erasure CREATE/UPDATE/DELETE, post-fence new memoryEvents/Projections/Topics, and nested memoryEvent note.
- If the current broad owner rule is actually active, expected terminal: `PASS: C3C1 20/20 genuine client Firestore Rules baseline observations` + `EXPECTED_RED: C3C1 7/7 unsafe owner writes demonstrated; THIS RULESET FAILS PRIVACY POLICY` + exact per-run synthetic cleanup PASS (no recursiveDelete), `GATE_BLOCKED`, child exit0 and emulator shutdown. Baseline reproduction PASS is **NOT** corrected Rules PASS.
- No client Rules result should be inferred until user posts actual CLI output. User should STOP on Rules source hash mismatch, unexpected Firebase SDK error, permission behavior mismatch, cleanup fail or port conflict; do not bypass guards.

## Next C3C1-GREEN gate
Collect full client-owned collection inventory before replacing broad recursive owner write. Prepare separate candidate Rules file **without overwriting original Rules**, run real isolated client Rules tests that DENY all 7 harmful owner writes and ALLOW legitimate operations; verify private grant ledger deny, cross-owner isolation, nested writes and mixed worker behavior. Original demo-only erasure writer's port18081 source cannot certify production; proceed to one-time server-attested owner action and original handler transactional migration only after independent Rules/Auth/Admin tests and B2.1/B2.3/PG01–08. No provider or paid xAI; Railway original local `index.cjs` stays dirty and untouched.

Status: **`C3C1=EXPECTED_RED_3FILE_PATCH_AUTHOR_VALIDATED/USER_EMULATOR_PENDING`**, `C3B=REAL_ADMIN_10/10_PASS`, `PRIVACY_GATE=BLOCKED`.

**Final patch SHA correction:** Earlier initial test fixture had only a public erasure marker and used SHA `500d7e...` (obsolete). The final patch seeded both canonical private/public fence documents before post-fence checks and was rerun through author syntax/JSON/clean git apply+diff QA: SHA256 **`2fe63d14d5bc0c19dfa78f7e05c313d5b76aa33eebb23eb839aa4063254ac8da`**. Only use FINAL SHA; user genuine emulator not run.
