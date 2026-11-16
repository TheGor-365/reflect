# Reflect 2.0 — UX R7 Hosting release gate
Date: 2026-11-16 · Status: H0 draft candidate, **not deployed**

## Evidence and scope

Source stacked on published R6 Hosting source SHA `3b7d5d632bd441ef128aae2e1a826c4ea5c34283`; UX changes in Draft PR #129, source SHA `53ac1e1d91bb87f4ce3e2837f6a807671fc427c6`. The **release SHA** is the final HEAD of the R7 release Draft PR, and must be re-read immediately before the worktree is created.

The user verified on 2026-11-16 that R6 Hosting deployed through owner CLI to Firebase project and site **`reflect-ai-staging`**, 4 files in `dist`, and existing Eric's Dashboard, Goals, Journey and Mindspace screens loaded. **The Firebase release hash assigned to R6 has not been supplied**. Do not guess that `1333fe` is current: that was the R5 release and is a fallback version.

R7 scope only:
- Session progress R6 regression: `SessionWorkProgress` was a flex child with `overflow:hidden` but no `flex-shrink:0`. On shorter conversation viewports it collapsed to a thin unreadable sliver; expanding the internal table made most rows inaccessible. New R7 fix: non-shrinking conspicuous 56–60px toggle with ring + visible “Подробнее/Свернуть” label, bounded keyboard-scrollable details area (8 rows plus totals), native chat history keeps its own independent scroll. Calculations and persisted data unchanged. Captured from the owner's screenshots (16 Nov ~00:14 local display).
- Dashboard activity: collapse historical date/step caveats into `SmoothDisclosure` with a structured definition list, default closed. Keep accurate numbers, date filters and nothing about mental-health scoring.
- Goals: one recommendation bulb in the section heading, not duplicated next to every goal draft.
- Session Schema/Journey: remove 3 repeated microcopy phrases; add subtle gaps between controls and content.
- Mindspace: remove the second, **incorrect** hover transform that replaced `translate(-50%,-50%)` with `translateY(-3px)`, causing nodes anchored at their centers to jump to the right/down. Keep subtle anchored hover scale.
- Regression tests for all above. No Firestore data migration, writes-on-render, user-specific semantic linking, Grok/AI call, security policy or backend change.

## H0 guard

1. Exact-HEAD GitHub Actions `reflect-staging-candidate.yml` checkout must print the PR's actual SHA and PASS preflight/test/typecheck/synthetic build/postbuild on **that same SHA**. CI uses fake Web Firebase config, never deploy.
2. PR #129's non-deploy Vite/Auth/hosted/mock-AI CI must PASS on its exact head. No code released based only on source PR CI.
3. User's installed Node.js through asdf `22.23.4` (Node 25 is unsupported). Owner's existing `~/reflect-r6-staging/.env.staging.local` is Git-ignored/private; carry it into a fresh R7 worktree with `install -m 600`, NEVER print values.
4. No Git reset/clean or edits to the original R6 worktree. Git's `?? .firebase/` after deploy is a known untracked CLI directory; do not delete it.
5. Before any deploy, open Firebase Console → `reflect-ai-staging` → Hosting → Releases. **Capture the currently active R6 release hash** and verify that rollback of the current live version would be possible after R7 publish. If missing, STOP.
6. Verify `firebase hosting:sites:list --project reflect-ai-staging` shows exact `reflect-ai-staging`. A fallback to R5 `1333fe` is not the same as rollback to R6 and should not be silently substituted.

## H1 only with explicit owner release decision

From the existing clean R6 worktree:
```bash
cd ~/reflect-r6-staging
git status --short
git fetch origin release/reflect-ux-r7-hosting-staging-2026-11-16
test ! -e ~/reflect-r7-staging || { echo "STOP: R7 path exists"; exit 1; }
git worktree add --detach ~/reflect-r7-staging <EXACT_R7_RELEASE_SHA>
cd ~/reflect-r7-staging
install -m 600 ~/reflect-r6-staging/.env.staging.local .env.staging.local
export ASDF_NODEJS_VERSION=22.23.4
export REFLECT_STAGING_EXPECTED_SHA="$(git rev-parse HEAD)"
npm ci --no-audit --no-fund
npm run qa:staging:preflight
npm run build -- --mode staging
npm run qa:staging:postbuild
git status --short
```
STOP on guard failure or unexpected dirty tracked file. Keep real public Firebase App Check and Railway origin untouched. No `firebase init` or `--only firestore`.

Once H0/H1 pass and the live R6 rollback hash is recorded, owner may publish **only Hosting** with:
```bash
firebase deploy --config firebase.staging.json --project reflect-ai-staging --only hosting
```
Record CLI output and new Firebase release hash from Console. No Railway/API, Auth, App Check, Firestore/Storage Rules, Functions, provider keys or production modifications.

## Browser QA after Hosting only — no paid AI

- Eric: reload page with Ctrl+Shift+R, verify account state/sessions and no blank screen.
- Sessions: compact session progress visible even collapsed; expand and verify ALL 8 factor rows + totals + disclaimer reachable by scrolling inside the details panel; no text clipped by history/composer; close again; keyboard focus and 320/390 px.
- Dashboard: visible `Подтверждённая активность` and period controls; `Как считается активность` collapsed initially; open/close smoothly; table shows period/empty/undated-step methodology, correct 7/30-day text, no false 0% success.
- Goals: one bulb icon in `Можно превратить в цель` card header; existing `QA-D1` and saved goal steps unchanged.
- Journey: no 3 deleted microcopy phrases, visible separation between switcher/filters/stats/canvas, the map remains pannable/zoomable, source cards still open, hypothesis review count is source-correct.
- Mindspace: hover over 4 distinct nodes — only *subtle centered* scaling, **no jump to right/down**. Verify mouse-out restoration, clicking a node does not auto-create a link, manual source navigation still works.
- Mobile 390px, 320px; dark/light; keyboard focus; reduced motion. No fresh account or fake records.
- Jack separate owner-authorized session only; synthetic cross-UID isolated Auth tests are not an actual production authorization audit.
- Roll back **Hosting only** to recorded R6 hash immediately if broken auth, missing saves, disconnected owner view, blank page or motion makes navigation unusable. Do not clear user data/browser storage.

## Still separate

R6 single 0..100% session-work indicator and deep goal draft model require live UX acceptance, not reimplementation here. Railway prompt-finish mitigation Draft #122 remains **not promoted**, and must go through separate server rollout with owner-controlled paid AI budget. Long-term cross-session memory needs explicit permission and trusted scoped backend access.

Checkpoint format: `confirmed H0 SHA + CI | H1 local guard | R6 rollback hash | R7 Hosting release | Eric/Jack QA | blockers | next 1-3 actions`.
