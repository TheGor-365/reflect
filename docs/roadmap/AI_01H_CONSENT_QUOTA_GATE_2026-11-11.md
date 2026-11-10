# Reflect 2.0 — AI-01H/C consent issuance safety before staging activation
**2026-11-11 | Draft hardening | Not deployed | No provider history access**

## Verified owner acceptance
The owner ran a Hosting-only staging build/deploy pinned to `1b12474cdf99ff5a4356853d34b33d1fee9d97b7`, receiving `STAGING SECURITY CONFIG VERIFIED` and `Deploy complete!`. In the current authenticated staging browser, the new diagnostics panel reported **PASS 3/3**, readiness `ready`: anonymous request denied, genuine Firebase Auth + limited-use App Check accepted, exact token replay denied.

**Scope of this PASS:** existing `/v1/ai/diagnostics` only. The NEW `/v1/privacy/context-consent` is still OFF in Railway (`REFLECT_CONTEXT_CONSENT_API_ENABLED=no`) and frontend (`VITE_ENABLE_REFLECT_CONTEXT_CONSENT=false`). Neither grants nor history access have been activated.

## Security hardening in this PR
1. **Mandatory first-use marker:** consent API accepts the signed Firebase App Check response only if `alreadyConsumed === false`. Missing, undefined, null, malformed or `true` are denied. Prevents accidental removal of the `{consume:true}` verification setting from silently disabling replay protection.
2. **Account-owned daily issuance quota:** max **12 new grant records per UTC day per UID**. Each allowed issuance atomically reads/updates one **server-private** quota document `/_reflectAiPrivate/reflect-8fdc8/contextConsentQuotas/{uid}` within the *same Firestore transaction* that verifies the own-session document and creates the private 15-minute grant. This is shared across Railway instances, not in-memory. Same-ID idempotency does not charge twice; revocation does not refund issuance. Revocation and listing are never quota-gated.
3. **Privacy:** no new browser-readable path or Firestore Rules changes. Private quota only stores UID, day key and issued count. No history, session text, AI request payloads or provider calls.
4. **Tests:** ordinary Node tests verify limit and rollover, cross-owner isolation, corrupt state denial and App Check missing-marker denial. Synthetic Auth/Firestore emulator tests verify server-side limit and that Firestore Rules reject browser access to quota.

## Gates before ANY server activation
- CI must be green on exact HEAD: Node contract, synthetic Firebase Auth + Firestore Emulator/real Rules, Vite, TypeScript, Railway bridge/isolated browser.
- **No direct main/prod changes.** Build/deploy reviewed exact hardening SHA to `reflect-ai-railway-staging` while **explicit flag remains `no`**; verify `/healthz=200`, `/v1/privacy/context-consent=404`.
- Only after a separate owner-approved staging go/no-go, switch the **server flag alone** to `yes`. The frontend flag remains OFF. Probe strict anonymous, wrong Origin, forged Auth/AppCheck, wrong verb and path denial. Do NOT use provider requests or private user content.
- Signed grant/list/revoke/replay can be verified only with owner action using the real authenticated staging app and a separate consent-specific diagnostic. Before enabling the UI to issue any real record, confirm the server route is active and signed denial tests pass.
- No historical content can be read by Grok until a separate source-specific, opt-in, bounded provider integration is designed, reviewed and explicitly approved.

## Current status
Implementation and test changes in Draft only; no new Railway deploy, Firebase Hosting deploy, Firestore Rules publish, AI provider call or production/main mutation from this PR.
