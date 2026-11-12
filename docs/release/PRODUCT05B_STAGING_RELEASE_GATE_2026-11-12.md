# Reflect 2.0 — PRODUCT-01…05B staging release gate
**2026-11-12 · Release candidate only · Firebase Hosting only until separate Railway promotion**

## A. Observed baseline (do not reinterpret CI as live QA)

- GitHub: PRODUCT-01 #68 → PRODUCT-02 #69 → PRODUCT-03 #70 → PRODUCT-04 #73 → PRODUCT-05A #74 → PRODUCT-05B #75. All are stacked Draft PRs, not merged into protected `main`. Based on #65; #67 Gate 5 test fixture is **a separate diverged branch**, not a hidden release dependency.
- PR #75 source SHA `00f4799606b010bc5dec6acc532810b4eb918ae2`; 3/3 exact-head CI green. The staging release branch is based on exactly that commit; its own HEAD changes as guard/docs/CI are added and must be captured from the final release PR, not guessed.
- `reflect-ai-api` on Railway `reflect-ai-railway-staging` / `staging` is deployed at `71e64a5dcf5b29cfd1df6d4229eabd55378f1a56` (SUCCESS 2026-11-11). It is an **ancestor** of the candidate branch. One known deployable rollback SHA. Staged Railway changes on 2026-11-12: **none**.
- Current public staging: `https://reflect-ai-staging.web.app`, Firebase project `reflect-ai-staging`; production Vercel `reflect-three.vercel.app` and its data namespace are NOT release targets.
- Owner-provided xAI screenshot 2026-11-12: account-wide remaining credit **USD 8.64**; **multiple products/projects share the balance**, and at least two API keys exist. `Reflect-dev` key shows **2 RPM / 2000 TPM**, Grok 4.3 and Chat endpoint. These are key restrictions, not guaranteed monthly cost caps. Do not use / reveal a token or assume dedicated Reflect budget.
- Prior bounded real Grok call succeeded on staging, but structured PRODUCT-01 live response and persisted readback remain unverified. CI synthetic tests are no proof of provider output quality, app appearance or Firebase permission boundaries.

## B. Reasonable release decomposition and STOP rules

**Gate H0 — candidate source and static QA (NO environment changes):**
1. Candidate branch `release/reflect-product05b-staging-candidate-2026-11-12` from #75 exact head, with add-on guard/docs/tests only. Verify final HEAD SHA and exact-head CI success.
2. Check `firebase.staging.json`: only Hosting, exact site `reflect-ai-staging`, `dist` public. No Firestore Rules, Storage, Functions or service-account deployment.
3. In a **clean isolated staging worktree only**, validate the exact HEAD via `REFLECT_STAGING_EXPECTED_SHA`; compare staging public Firebase/Web App ID, Auth domain, App Check public site key and Railway URL **without displaying any key**. App Check remains ON, Railway client ON, callable Functions OFF, private Context Preview OFF, Gate 5 audit UI OFF. Build `--mode staging` and postbuild scan output.
4. CI's build intentionally uses fake, *non-deployable* public values; never download/deploy a CI artifact. For real hosting build use the owner's existing ignored `.env.staging.local`. No new xAI key, Firebase Admin key, or App Check debug token.

**Gate H1 — Firebase Hosting staging (owner-operated, no AI server changes):**
5. Verify old Hosting version exists in Firebase Console for rollback, current user data is untouched, source SHA and scope **Hosting only** match the candidate. Then run exact owner-reviewed `firebase deploy --config firebase.staging.json --project reflect-ai-staging --only hosting`. Never `firebase init`, `--only firestore`, `--only functions`, or production default.
6. Check Auth persistence, Firestore subscriptions and existing signed Railway AI fallback (unchanged backend); use only synthetic data in a registered QA account. Browser QA at 320/360/390/430/1280/1440, dark/light, 2 tabs and reload. Inspect Journey, Dashboard, Mindspace and original Diary/Goals/Sessions. Capture redacted screenshots, no UID/token/private text.
7. **Gate H1 does not activate PRODUCT-01**. With current Railway backend, the new structured interaction remains absent; existing chat behavior must continue, with UI treating interaction as optional. Mindspace can display existing sessions/goals; confirm/edit a synthetic semantic link, reload/second tab, verify original chat/goal content unchanged. If a fixture previously had no meaningful saved data, the honest empty state is correct, not a fake preview.

**Gate R1 — backend source upgrade (requires separate explicit action after H1):**
8. Pin Railway service source to the **candidate exact commit** using its source-connection interface, leaving ALL existing secret values, consent state, egress settings and budget ledger untouched; ensure a rollback to `71e64a5`. Keep new `REFLECT_AI_INTERACTION_V1_ENABLED` ABSENT/OFF. Deploy and confirm `/healthz` and existing signed QA. No paid smoke just because code was updated.
9. After independent review of spent credits and private budget quotas, set only `REFLECT_AI_INTERACTION_V1_ENABLED=yes` on staging. Confirm user explicitly wants synthetic Grok calls, then issue no more than three single-user calls **T1/T2/T4**; one in flight, separate time windows due to 2 RPM/2000 TPM. Never auto-retry a timeout or unacknowledged request. Preserve exact xAI model and consent boundary (only current submitted message).
10. For each call record only: release SHA, test label, outcome class, latency, prompt/output tokens, account-wide xAI Usage increase and computed USD. If schema parser fails or response quality fails T4, flip new flag OFF and verify legacy one-message path. No raw user text, credentials, session history or auth headers in logs. Keep independent provider kill switch.

**Gate D1 — persistence/UX acceptance:**
11. Synthetic T1/T2/T4 and two-visit T5 only; ensure user manually saves the generated session and explicitly accepts/rejects a recommendation. Read the exact owner-scoped Firestore document after reload and in a second signed browser. Confirm linked goal and rejected candidate status, user-authored return, the Journey provenance edges, Dashboard counts and Mindspace explicit links. Check foreign-UID read denial in isolated emulator or dedicated owner-reviewed negative test, not by creating an unrelated real account.
12. Emergency rollback: return to prior Firebase Hosting release in Console; revert Railway to deployed `71e64a5` SHA if necessary; switch only new interaction flag OFF for model regressions; do **not** turn off provider, delete Jack/Eric documents, or clear owner browser storage without a separate incident reason.
13. Only after all signed gates, update the master roadmap/status. **No** production changes, billing changes, KYC, new account or app data migration in this PR.

## C. Owner's minimal Linux staging instructions

Step 1 — from the **existing isolated worktree** (do not recreate/clean it):

```bash
cd ~/reflect-stage35-hosted
git status --short
```

If not empty, STOP and inspect rather than resetting. Step 2, substitute the release candidate exact HEAD printed in the PR (not the original #75 head):

```bash
git fetch origin release/reflect-product05b-staging-candidate-2026-11-12
git switch --detach <EXACT_RELEASE_CANDIDATE_SHA>
npm ci
```

Step 3, after reviewing the *existing, ignored* `.env.staging.local` **privately**, run:

```bash
export REFLECT_STAGING_EXPECTED_SHA="$(git rev-parse HEAD)"
npm run qa:staging:preflight
npm run build -- --mode staging
npm run qa:staging:postbuild
```

Both guard scripts print only non-sensitive metadata. The postbuild check must PASS before H1. Do not paste the .env file, Firebase Web key, App Check key or any Auth token into a chat or screenshot. If H1 is approved, confirm the site exists:

```bash
firebase hosting:sites:list --project reflect-ai-staging
firebase deploy --config firebase.staging.json --project reflect-ai-staging --only hosting
```

Stop at unexpected prompts for another project, resource, billing plan or permissions. Record only deployment ID/URL and minimal non-sensitive CLI result.

## D. Money, consent and availability checks

- Shared xAI credits: three projects may use the same account. `Reflect-dev` is one key and not a separate prepaid wallet. No top-up or credential rotation required for static Hosting acceptance.
- xAI requests follow `browser current user message → Firebase Auth + App Check → Railway entitlement + ledger → xAI Grok 4.3 → structured response → optional explicit user save`. A credit balance is not authorization to spend it; no background loops or model API calls inside synthetic CI.
- PRODUCT-01 uses `text.format:json_schema` with `strict:true` only when the **server flag** is ON. Do not claim that Grok 4.3 outputs accepted schema without live single-message QA.
- No historic session transcript is sent to Grok by this release. The independent Preview/Consent Gate 5 remains scoped to its own PR #67 and requires a separate dedicated review.
- QA with synthetic notes, not Jack/Eric private data; do not delete/migrate existing sessions or account identities.

## E. Status template

`Code SHA | CI statuses | Hosting current version ID → candidate | Railway SHA & health | Auth/App Check | T1/T2/T4 status + usage | Firestore readback | 320/390/1440 dark/light | blockers | rollback verified`

Any unknown field remains `не подтверждено`, not `PASS`.
