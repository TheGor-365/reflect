# R139 C3c.2b — provenance activation contract
Date: 2026-11-24. Source audit at d7dff5d01bb40a1a3b4f5a770646da5af74a90c0.
Status: design only; activation blocked.

## Entry points
- server/railway/index.cjs: ordinary reply delegates to createHostedHandler; recovery status has a separate recovery instance. Runtime verifies exact staging project/app/origin and Auth/App Check. Neither receives provenance config.
- server/ai/hostedHandler.cjs: validateRequest -> recovery.claim(message: input.message) -> adapter.invoke(input.message, settings, null, evidence) -> recovery.persistReply. Current policy trims input; xaiContract trims the same string again. Attestation can bind this normalized current message, not the entire provider prompt or external truth.
- server/hosted/functions/index.cjs: callable constructs createHostedHandler without structured/recovery flags; must not silently activate provenance on legacy callable.
- server/ai/memoryReply.cjs: independent context-reply handler constructs its own recovery. Excluded from this initial scope; R10 context reply remains off. No changes to its consent transport.
- Packaging: callable imports generated ./lib modules; package/copy manifest compatibility still requires local audit before any deployment.

## Critical privacy blocker
src/features/Sessions/sessionDeletion.js explicitly deletes only the owner session and preserves private AI receipts, linked goals and diary entries. Existing receipt retention cannot be assumed appropriate for new derived personal MACs. No active signing until server-side deletion/retention is designed and tested. Do not delete billing/attempt metadata blindly.
- Archive: retain attestation while archived, deny new acceptance, restore only matching source.
- Permanent session deletion: revoke authoritative lineage and remove provenance MACs (including acceptance-derived attestations) through authenticated owner-scoped server process. Preserve only independently justified minimal accounting/recovery metadata; no transcript copy. Must address races, retries, partial cleanup, orphan descendants, recreation of same session ID, backups and account deletion.
- Goal deletion: never silently recreate accepted goal; preserve only agreed minimal history and clear protected lineage when appropriate.
- No retrospective signing of mutable legacy documents.

## Key lifecycle
Dedicated random 32-byte secret, separate from provider credentials, server-only. Key ID is nonsecret; allowlisted versioned keyring, one active signer and retained verification-only keys subject to retention policy. Missing/invalid key must fail closed before enabling the feature. No raw keys in logs, client bundles, Git, receipts or API responses. No environment provisioning in this PR stage.

## Acceptance scope
Current owner-local transaction remains distinct from future server-verified acceptance. Do not trust client-written sourceType or verified flags. Future authenticated server transaction must verify exact receipt coordinates, canonical MAC and current source uniqueness, archived/deleted state, explicit owner review/confirmation, immutable source question/unknown/dispute gate and idempotency. A verified origin is not factual truth. Protected acceptance state must remain server-owned. Separate manual goal path remains available. No automatic provider requests.

## Release gates
1. Local integration tests and packaging inventory.
2. Synthetic server-side deletion/retention and race tests.
3. Keyring and authoritative acceptance tests; cross-owner isolation.
4. Browser E2E with fixtures; explicit approval before real staging secrets/rules/deployment.
5. No live changes, paid calls, R10 activation or merge implied by this design.
