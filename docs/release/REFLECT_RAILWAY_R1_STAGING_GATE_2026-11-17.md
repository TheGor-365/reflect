# Reflect 2.0 — Railway R1 staging release gate
Date: 2026-11-17 · Status: isolated H0 candidate; **NOT deployed**

## Scope and exact baselines
- User verified R7 Hosting-only deployment from Git commit \`d67fb7e2570315c3127a247e5ca5c1462ad98b69\`. The Hosting release ID assigned to R7 is **not yet recorded**. R6 last-known rollback hash \`c8eb15\`; never confuse frontend release with this backend release.
- Railway read-only inventory: project \`2843e21f-d811-4ee5-b773-ec626142ef77\`, environment \`5342ac2d-d1a5-4828-871f-164e50ff5e2d\`, service \`c7f089c0-af42-45d3-875d-5e5ccba68dc9\` (\`reflect-ai-api\`), staging domain \`reflect-ai-api-staging.up.railway.app\`, port 8080, healthcheck \`/healthz\`.
- **Last verified live Railway**: branch \`feat/reflect-m5c-evidence-v2-ui-2026-11-15\`, commit \`5bce3da02c08f1d5b78ed173302ee9c1957baadd\`, SUCCESS deployment \`f574aa2b-af72-491d-89c5-fed97e5dc4ae\`, rollback eligible, no staged changes at audit. Reverify at time of publish.
- Backend-only source Draft #131 (six of six CI PASS) commit \`6f8474ec19438d8ec7b07de4800bd55e0ad577cc\` based on the exact live M5c commit. The final R1 release SHA is the **head of the dedicated release branch**; do not deploy the mutable source branch or PR merge commit.

## What changes and what does NOT
Exactly three source code paths modified from live baseline:
1. \`server/ai/interactionContract.cjs\`: the owner’s \`ty/vy\` address form gets explicit natural second-person guidance, more human conversation without claiming therapeutic credentials, and preference for complete sentences (hypothesis soft length 180; answer soft length 850).
2. \`server/ai/interactionContract.test.cjs\`: five modes, ty/vy + fallback, no inadvertent history grant, unchanged v1 caps.
3. \`server/ai/interactionEvidenceV2.test.cjs\`: verifies v2 inherits policy without changing provider budget.
R1 adds this non-executable release plan and an offline-only GitHub Actions gate; **nothing else should appear in diff against live M5c**. Original hard limits remain \`max_output_tokens=1024\`, \`insights.maxLength=240\`, \`answer.maxLength=1150\`. No schema, endpoint, provider model, retry, charging, auth, App Check, Firestore or network policy change. New system text may marginally increase billed **input** tokens.

This is a **prompt-quality mitigation**, not proof that the paid model never cuts off text. Do not advertise an unverified bug fix.

## H0 — before even contemplating Railway switch
1. Verify GitHub release head exact SHA. Isolated workflow checks out \`pull_request.head.sha\`, verifies M5c ancestry, validates only those three AI files + this release plan + its workflow changed, runs v1/v2/hosted/adapter unit fixtures, typecheck and local Vite build with demo config. CI must be all green on exact **release** SHA. Never use PR synthetic merge commits as the release target.
2. Reconfirm Railway \`reflect-ai-api\` environment and source: **do not deploy anything** if live commit, service/environment, staged changes, domain or healthcheck differ from the baseline without investigation.
3. Record the previously SUCCESS deployed M5c deployment ID and eligibility to roll back. Rollback is a platform operation, not \`git reset\`; preserve old source branch and original Git worktrees.
4. Confirm /healthz response and recent 5xx/latency by read-only monitoring; do not call paid xAI endpoints, \`/v1/ai/interaction\`, \`/responses\`, provider diagnostics requiring a key, or submit a personal message in this gate.
5. **Require a separate explicit owner GO** to stage/switch source, because changing a Railway service source can redeploy immediately. Deploy only to the specified staging environment, not every environment. Prefer **environment-scoped staged source attachment** pinned to the final immutable release SHA, inspect the Railway staged diff, then ask for separate approval before committing with \`accept-deploy\`. Never call \`connect_service_source\` without \`staged:true\` and an \`environmentId\` in preparation, and even staging a config mutation needs prior approval. Do not use the unscoped live source connector; it applies to all environments.
6. Do not modify \`REFLECT_XAI_KEY\`, service account, Firebase Rules, App Check, account/owner data, shared variables, provider flags, \`main\`, production, or another Railway service.

## H1 — after explicit owner approval for staged-only R1 source change
- Pin \`TheGor-365/reflect\` / \`release/reflect-railway-r1-staging-2026-11-17\` to the **exact final H0 SHA**, with \`staged:true\` and environment ID \`5342ac2d-d1a5-4828-871f-164e50ff5e2d\`. Inspect resulting staged changes and confirm there are **no other pending changes** before suggesting application.
- Ask for a **distinct owner approval** to apply deployment; only then call \`accept-deploy\`. Confirm the service’s new deployment reports SUCCESS and source commit matches the pinned release SHA.
- Without provider traffic, check Railway runtime \`/healthz\`, request error rate, deployment logs for start/health/error conditions, CORS/staging origin. Avoid printing secrets or sensitive payloads. Verify Firebase frontend R7 remains reachable and owner sessions untouched.
- If failure: roll back **only staging Railway** to M5c deployment \`f574aa2b...\` (recheck eligibility), or restore the previous source pin after approval. Do not roll back Hosting, delete user data, or retry paid requests.

## H2 — real AI semantic QA, separately budgeted
- No automatic paid Grok test. Owner must explicitly approve **number of requests and total USD cap**.
- Natural interaction: user opens a normal Reflect session on a plausible concern; never tell the model “this is a test”. Ask 2–3 natural turns only after an agreed cap. Evaluate direct \`ты\` address, sentence completeness, nonrepeating clarification, empathy, respect for uncertainty, no invented long-term memory or facts, response usefulness and retry/receipt behavior. Provider 200 response alone cannot certify completeness.
- Observe actual provider token/cost receipts and compare approximate R1 vs earlier M5c; document any spending and fall back if quality degrades.
- Do not claim full diary indexing, cross-session memory, automatic active goals, calendar scheduling or semantic links from a server-only prompt update.

## User R7 browser QA recorded
The user reports Mindspace hover now stable and Dashboard activity accordion OK. R7 50% progress ring and expanded lower rows / 50-of-100 were visually verified. Still unverified: fully scrolled top progress rows on mobile/keyboard, Eric/Jack separation, source-authentic cross-session links, persistence across account/logout/reload. These are independent from Railway R1.

## Report format
\`H0 exact SHA + CI | current live Railway ID/source | staged? | approved? | H1 new deployment + health | fallback ID | H2 paid budget/actual cost | outstanding UX/security | next 1–3 actions\`.
