# Railway R2 — independent R8 recovery route, R7 backward compatibility
Date: 2026-11-17
State: staging-only release candidate, no paid AI calls for verification

## Immutable facts (2026-11-17)
Existing Railway STAGING project: 2843e21f-d811-4ee5-b773-ec626142ef77
Environment: 5342ac2d-d1a5-4828-871f-164e50ff5e2d (staging)
Service: c7f089c0-af42-45d3-875d-5e5ccba68dc9
Old live source: branch release/reflect-railway-r1-staging-2026-11-17
Old live exact SHA: 81ceda1a92268317ed56c54c4912eacd8ffe57b5
Old live deployment: 0c4f77e4-3343-4f0f-a9b7-cd14449ccbee (SUCCESS)
Earlier inspection: no existing staged changes in the environment.
Variables are values-redacted by Railway OAuth (names only). The presence of REFLECT_AI_ATTEMPT_RECEIPTS_ENABLED does NOT establish its value.

## Routing contract (R2)
- POST /v1/ai/reply: ORIGINAL one-message R7 payload, original signed Auth + consumed App Check, entitlement, budget, model and client-persisted answer. Always \`attemptRecoveryEnabled: false\` for this legacy handler. Old browser tabs remain operational.
- POST /v1/ai/reply-recovery: independently gated by \`REFLECT_AI_ATTEMPT_RECEIPTS_ENABLED=yes\`, same Auth/App Check/entitlement/budget/provider restrictions, strict persisted-user-turn source, server-owned atomic answer + private receipt, no automatic retry. Validates \`sessionId\` and \`sourceTurnId\`, optional explicit \`retryConfirmed\`.
- POST /v1/ai/attempt-status: independently gated by receipts flag, owner-signed free receipt lookup, NO provider call.
- Other routes unchanged. Any query-string variants 404. Cross-origin 403; replayed App Check 401, denied account 403. Outbound off 503 on both paid paths.
- Two handlers share the SAME Firestore immutable requestId spend and quota ledger; no split billing budget or new secret.
- Legacy R7 calls remain unreceipted; do not mistake a missing receipt for proof of zero charge. New R8 calls are protected by the server transaction.
- No change to \`REFLECT_XAI_OUTBOUND_ENABLED\`, provider key, budget, account entitlement, Firestore Rules, model, AI prompt or production.

## Release sequence, owner approved 2026-11-17
1. H0: exact R2 SHA, tests for simultaneous legacy and recovery routes, owner isolation, no model egress with denied permissions, Node 22. Old R7 source/deployment ID recorded.
2. Stage ONLY the R2 pinned GitHub source + \`REFLECT_AI_ATTEMPT_RECEIPTS_ENABLED=yes\` on the existing Railway STAGING service/environment; review exact Railway staged diff and ensure no unrelated change or data destruction.
3. Commit Railway staging patch; verify new deployment SUCCESS and version exact R2 SHA. Healthcheck with safe unauthenticated GET /healthz only, signed read-only diagnostics in browser only after frontend is released; never request Grok as part of automated deploy.
4. H0/H1: deploy Firebase Hosting R8 from exact frontend SHA with unchanged locally private .env.staging.local and one process-local \`VITE_ENABLE_REFLECT_AI_RECOVERY=true\`. R7 tabs stay supported by old endpoint throughout. Hosting site strictly reflect-ai-staging.
5. Confirm browser readback and pending user message recovery status without paid request. For actual new Grok generation obtain an explicit max count AND total cost cap first.
6. If R2 fails, rollback Railway to R1 saved deployment ID with exact source and previous receipts flag value **only when known**. If R8 fails, rollback Hosting only to captured pre-release version.

## Safety stop conditions
Any pending unrelated Railway patch; ambiguity about existing receipts flag value, inability to see original Firebase Hosting rollback version; missing app attestation, permission, project URL; failing tests; production routing attempt; any unexpected interaction with user data. Stop rather than guessing.

## Source references
R8 Draft PR #133, frontend HEAD recorded separately in its PR.
R1 source baseline https://github.com/TheGor-365/reflect/tree/81ceda1a92268317ed56c54c4912eacd8ffe57b5
