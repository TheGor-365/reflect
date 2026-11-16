# Reflect 2.0 — UX R5 staging Hosting release candidate

**Date:** 2026-11-16  
**State:** Owner-controlled staging H0/H1 only; no deploy made by this PR.  
**Source:** UX R5 stacked Draft PR #119 → #120 → #121 → #122. Source tip before this document: `3c23dc8acadc2c31ac82fef28b3f66e9b3c339e6`. **The actual release SHA is the final HEAD of this PR, not the source tip.**

## Invariant scope

1. **Firebase Hosting only**, existing site `reflect-ai-staging`, Firebase project `reflect-ai-staging`, existing `dist` build.
2. No `main` or production change; no merge of any stacked Draft PR as a prerequisite for staging.
3. Do not change Firebase Auth, Firestore/Storage Rules, Firebase Functions, reCAPTCHA Enterprise App Check, user accounts, user AI settings, provider budget, Railway environment values, or production DNS.
4. No live Grok request at this gate. Existing Railway staging remains on `5bce3da02c08f1d5b78ed173302ee9c1957baadd`; therefore server prompt fix in PR #122 is **not live** after the frontend-only release.
5. Owner's existing, **ignored** `.env.staging.local` is the ONLY source for correct public Firebase Web App config, public App Check site key and Railway client endpoint. Never paste its contents into GitHub, chat, CLI logs or screenshots. Do not substitute CI synthetic placeholders in live Hosting.
6. Owner consent to testing a UI does not grant cross-session Grok memory, impersonated QA or broad profile access.
7. If current candidate cannot boot using unchanged Firestore Rules, **STOP** and roll back Hosting; do not weaken Rules.

## Gate H0 — exact-HEAD, no network-to-model tests

- Confirm PR is Draft and candidate HEAD hash is the immutable commit selected in a clean release worktree.
- Check `firebase.staging.json`: site `reflect-ai-staging`, Hosting-only scope, `dist` directory.
- The `reflect-staging-candidate.yml` GitHub Actions workflow uses **fake non-deployable public keys**. It runs release guard, pinned npm ci, regression tests, typecheck, synthetic staging build and postbuild scan. **No Firebase deploy**.
- The specific source SHA must also pass the applicable frontend and hosted-bridge synthetic CI; CI isn't visual QA, owner Auth QA, or a test of Grok.
- Before deployment capture the existing Hosting release/version in Firebase Console, plus rollback method. If not visible, STOP.
- From a *clean existing isolated worktree* (do not reset a dirty directory), select the candidate by its full HEAD SHA and privately verify ignored staging env:

```bash
git status --short
git fetch origin release/reflect-ux-r5-hosting-staging-2026-11-16
git switch --detach <EXACT_CANDIDATE_HEAD_SHA>
npm ci --no-audit --no-fund
export REFLECT_STAGING_EXPECTED_SHA="$(git rev-parse HEAD)"
npm run qa:staging:preflight
npm run build -- --mode staging
npm run qa:staging:postbuild
```

Only continue if **both** guard commands PASS, no emulator/prod markers and real staging App Check enabled. Do not print secrets or share the env. If head changes or working tree becomes dirty, STOP.

## Gate H1 — explicitly scoped owner-operated Hosting deploy

Prerequisites: H0 passed, old Firebase Hosting release accessible for rollback, owner approves this exact SHA and verified target. Then and only then:

```bash
firebase hosting:sites:list --project reflect-ai-staging
firebase deploy --config firebase.staging.json --project reflect-ai-staging --only hosting
```

Stop on an unexpected project/site, IAM error, billing/Rules/Functions prompt, missing App Check or failed guard. Do **not** `firebase init`, use default project, deploy Firestore Rules or deploy a GitHub Actions dummy bundle.

### H1 smoke matrix — **no AI send**

1. Existing Eric login session after refresh; ensure Auth persists, header/session history and existing saves remain unchanged. Use **no new paid message**.
2. Previously saved hypothesis: edit a 0–4 grade and owner comment, Save, confirm editor collapses and the chip appears, refresh and new tab, reopen comment and check exact saved grade/comment; revert edit if owner wants original rating preserved.
3. Reply action: confirm focus on composer without duplicated question or losing a prewritten draft; **do not click Send**.
4. Verify compact readiness summary can be expanded, muted borders and equal-size red→green rating controls; test light/dark, keyboard focus, 320/390/1440 width.
5. Journey: five-grade user **agreement** distribution, comments never in aggregate; source-specific user vs Reflect icons; selected-session vs whole-account scope explicitly differs.
6. Mindspace: eight thematic axes around neutral centre, existing manually confirmed zone unchanged, links only when owner confirmed; position is **not** numerical growth.
7. With no owner reviews, the chart accurately has no data; don't seed fake personal scores.
8. Cross-UID Rules: use **synthetic emulator** (not Eric vs Jack production account probing); no claims based on UI readouts alone.
9. Record two redacted screenshots only: one saved compact rating and one Journey/Mindspace geometry. Include browser console error text *without private IDs* when failure occurs.

**Gate H1 STOP/rollback:** any wrong project, missing login after reload, missing current user data, Firestore permission regression, blank app, broken session composer or unreadable mobile controls. Roll back to captured prior Hosting release in Firebase Console; no data deletion or browser storage clearing.

## Gate R1 — SEPARATE Railway server release (NOT part of this Hosting step)

Railway live staging service ID `c7f089c0-af42-45d3-875d-5e5ccba68dc9`, project `2843e21f-d811-4ee5-b773-ec626142ef77`, env `5342ac2d-d1a5-4828-871f-164e50ff5e2d`. Last verified deployment `f574aa2b-af72-491d-89c5-fed97e5dc4ae` on `5bce3da...` SUCCESS, rollback target.

Review the server-only source diff `#122` and existing Railway service root/deploy binding before proposing a promotion. Do not flip `REFLECT_AI_EVIDENCE_V2_ENABLED`, provider enable/disable, budget, or any AI memory flag without separate review. A real natural Grok QA call requires owner-chosen count and explicit USD cap; never auto-retry ambiguous paid requests.

## Signed acceptance/status template

`Release SHA | H0 CI counts | Git clean | guard pre/post PASS | old Hosting version | H1 deployed version | Eric/Jack authentication | rating readback | Journey source/status | Mindspace zones | mobile light/dark | provider call count=0 | billing delta=0 (unverified until usage) | blocker | rollback tested`.

No claims of accepted QA, deployed code or recovered private data from GitHub-only results.
