# Reflect 2.0 — UX R6 Hosting release gate
**2026-11-16 · Draft candidate · staging ONLY**

Source stacked PRs:
- #124 — motion, no repeated questions or verbose redundant labels
- #125 — owner session work progress (0..100, per-session ring & breakdown)
- #126 — deep-session automatic **draft** goal suggestions (never silent active goal)
- #127 — visible reply focus and unchanged draft

Source tip before this release doc: `9a4daa0b4f3139f48081ce149447afedf7354374`.
**The final release HEAD printed by the release PR overrides this source tip.**

## H0 immutable checks, all non-billable

- Dedicated Firebase Hosting site: `reflect-ai-staging`; Firebase project `reflect-ai-staging`; publish only `dist` through existing `firebase.staging.json`.
- Existing R5 Hosting release active on 16 Nov: **`1333fe`**; previous `8174f7`. Record the current release again before deployment, and verify explicit **Rollback** exists on `1333fe`. Do not click rollback before QA.
- Existing Railway staging backend remains on `5bce3da02c08f1d5b78ed173302ee9c1957baadd`; this release **never deploys Railway** or modifies provider limits, secrets, evidence-v2 flags or xAI billing.
- Do not modify Firebase Auth, App Check, Firestore/Storage Rules, Functions, API tokens, domains, user account data or production.
- Release workflow `reflect-staging-candidate.yml` must check out the **actual PR head** and print `Checked exact release HEAD`. It uses fake non-deployable public web values, runs synthetic regression/typecheck/build/pre/post guard, and **never deploys**.
- No Grok calls during Hosting smoke. No synthetic edits to existing Eric or Jack records. Do not assume an empty pre-existing synthetic QA record can be deleted.
- For owner-run real Hosting build only, copy existing Git-ignored `.env.staging.local` from the verified isolated `~/reflect-r5-staging` to a **new**, separate, clean worktree. Never print keys or paste environment content into chat.
- Set Node.js via asdf current terminal `ASDF_NODEJS_VERSION=22.23.4`.
- Do not infer new model privileges from UI work progress or AI consent panels.

## H1 owner local commands — no effect on existing R5 worktree

From `~/reflect-r5-staging`, verify clean status. If any local modifications, stop, don't clean or reset. Then:

```bash
cd ~/reflect-r5-staging
git status --short
git fetch origin release/reflect-ux-r6-hosting-staging-2026-11-16
test ! -e ~/reflect-r6-staging || { echo 'STOP: R6 worktree path already exists'; exit 1; }
git worktree add --detach ~/reflect-r6-staging <EXACT_R6_CANDIDATE_HEAD>
cd ~/reflect-r6-staging
install -m 600 ~/reflect-r5-staging/.env.staging.local .env.staging.local
export ASDF_NODEJS_VERSION=22.23.4
node --version
npm ci --no-audit --no-fund
export REFLECT_STAGING_EXPECTED_SHA="$(git rev-parse HEAD)"
npm run qa:staging:preflight
npm run build -- --mode staging
npm run qa:staging:postbuild
git status --short
```

Expected Node 22.23.4, guard PASS twice, correct SHA and clean Git. On any mismatch stop. Production/staging secrets never printed. Check real staging Auth, App Check and Railway origin through the **safe guard status only**.

Before actual Hosting deploy, Firebase Console `reflect-ai-staging → Hosting → Releases` must show old/current release and an available Rollback. Read-only `firebase hosting:sites:list --project reflect-ai-staging` must list the exact site. With explicit owner release decision, run **only**:

```bash
firebase deploy --config firebase.staging.json --project reflect-ai-staging --only hosting
```

No Firestore Rules, Storage, Functions or production deploy. If unexpected prompt, STOP. Record returned Hosting URL and updated release hash.

## H1 browser acceptance — existing user, read-only first

1. Reload current Eric session with Ctrl+Shift+R, ensure existing title/messages/AI account settings persisted. No chat sending.
2. Saved hypothesis: grade chip, comment closed by default, click and see smooth expanding comment with no underline, close smoothly; edit button visually balanced, five rating options equal width. Do not save new data until explicitly choosing one benign correction.
3. Historical user replies beginning with `Мой ответ на вопрос ...` should render answer prominently and duplicate question as small **collapsed citation**; exact original stored text unchanged.
4. Reply action focuses and visually highlights composer without copying question, losing draft or triggering API call. **Do not press Send**.
5. New graphical **single** progress ring in session bar. Expand source table, verify 8 rows, 100 max, percentage changes only upon owner-scoped saved event. No per-response duplicate readiness boxes.
6. Dashboard has only one page title; no verbose extra context disclaimer. Recommendation cards have distinct icon hierarchy, no duplicate paragraph.
7. Goals board still allows manual goals; an automatically prepared **draft** appears only if deep, source-verified review+dialogue threshold is met. No new active goal record created without owner confirmation.
8. Journey ratings and Mindspace axes from R5 still load. Test at 320 / 390 / 1440 widths, keyboard focus, dark/light and reduced-motion preference where possible.
9. Pending QA for Jack: only his own authorized account in owner-supplied browser; do not attempt forced cross-UID reads. The only valid source-isolation claim here is from isolated synthetic Auth/Firestore tests.

## STOP / rollback

STOP on blank page, wrong namespace, lost session, unhandled permission error, focus trapping, editor that saves invisibly, incorrect progress source, model call on UI click, or broken mobile. Roll back **Hosting** in Firebase Console to captured R5 release **`1333fe`**. Don't delete/clear the users' browser storage, deploy rules, or touch Railway.

## Explicit scope not yet implemented

- The 0..100 score is transparent weighted **product effort metadata**, not objective emotional recovery or predictive success.
- Confirmed indirect cross-topic semantic link is NOT inferred; future M8 memory must use verified owner association and consent.
- Auto goal creation in this candidate means a read-only **deep-session draft** sourced from a validated AI recommendation; background persistence of an active goal and calendar schedule require a separate scoped opt-in, auditable provider response and acceptance rules.
- Deep session progress alone never unlocks cross-session AI memory.
- Full reply quality fix of Grok in PR #122 has not been promoted on Railway and is NOT fixed merely by Hosting.

Status evidence: `release SHA | GitHub CI | local guard pre/post | old & new Hosting release IDs | Eric QA | Jack QA | progress source table | deep draft | rollback presence | blockers | Railway unchanged`.
