# Reflect 2.0 — current continuation checkpoint (2026-11-09)

> This document is a GitHub-persistent companion to the owner's detailed downloadable **REFLECT_2_MASTER_HANDOFF_2026-11-09.md**. Read the full roadmap at `docs/roadmap/REFLECT_2_PRODUCTION_MASTER_PLAN_2026-11-09.md`. Do **not** restart the project. Verify live PR HEAD/CI and owner screenshots before assuming anything changed since this checkpoint.

## Role / product direction
Continue as the engineering lead of the existing React/Vite + Firebase + Railway/Grok private-reflection app. User-facing communication is in Russian, short 1–3 actions between screenshots. Working product, trustworthy accounts, one real AI reply, saved session, data safety, and release quality are the KPIs. Owner performs browser steps, local deploys, and secret/billing entry. The assistant can write code/tests/docs in a Draft branch via GitHub. Never modify production, delete data, approve paid AI calls or merge main implicitly.

**Priority approved by owner:** finish registered Auth account/re-login → **actual Grok 4.3** answer and explicitly saved session → full product QA and Midnight Aurora finishing → private/reliable V1 and owner-approved production. Do not ask the owner to copy a UID or connect technical services for each product demonstration.

## Live sources / exact checkpoint
- Repo: https://github.com/TheGor-365/reflect
- **Active stacked Draft PR #37**: https://github.com/TheGor-365/reflect/pull/37 , branch `work/reflect-stage05a-product-readiness-2026-11-09`, base `work/reflect-stage04h-railway-ai-bridge-2026-11-08`.
- Parent Draft PR #36: https://github.com/TheGor-365/reflect/pull/36; alternative earlier Draft PR #35: https://github.com/TheGor-365/reflect/pull/35. Review stacked dependencies before merge.
- **Last tested application-code commit and owner-published Hosting build**: `dcaa1f9fcc84764c5550c37f0892170cb884e384`. GitHub Actions on this SHA **4/4 SUCCESS**. A subsequent documentation-only handoff commit may move branch HEAD without changing published JS — do not confuse Git SHA with deployment.
- Full plan: `docs/roadmap/REFLECT_2_PRODUCTION_MASTER_PLAN_2026-11-09.md` (Stage05A/B/C/D/E, Stage06).
- Stage04H server runbook: `docs/roadmap/STAGE_04H_RAILWAY_STAGING_GROK_2026-11-08.md`.
- Previous technical master: `docs/handoffs/REFLECT_2_MASTER_CONTINUATION_2026-11-07.md` on Stage04G historical branch.

## Infrastructure
- Staging UI: https://reflect-ai-staging.web.app; Firebase project `reflect-ai-staging`; Hosting site same ID.
- Railway API: https://reflect-ai-api-staging.up.railway.app; Railway project `2843e21f-d811-4ee5-b773-ec626142ef77`, env staging, service `reflect-ai-api`.
- Protected original production: Vercel `reflect-three.vercel.app`, Firebase `reflect-8fdc8`, GitHub main. **DO NOT TOUCH.**
- The `VITE_APP_ID=reflect-8fdc8` in staging is a **Firestore namespace**, not a production Firebase connection. Do not change without migration review.
- Client: React 18, Vite 7, Firebase Auth/Firestore/App Check, CSS Midnight Aurora dark/light, `src/features/Sessions/Sessions.jsx`.
- Server: `server/railway/index.cjs`, `server/ai/hostedHandler.cjs`, `hostedBudget.cjs`, provider adapter. Credentials `REFLECT_FIREBASE_SERVICE_ACCOUNT_JSON`, `REFLECT_XAI_KEY` already entered in private Railway variables by owner; do not ask for their values.
- Last signed Auth + limited-use App Check precheck passed Railway with deliberate HTTP **503 provider-disabled**, proving the security handoff but **not** a live Grok response. Earlier GET /healthz 200, unauthenticated POST 401.
- Frontend current deployed flags: `VITE_ENABLE_REFLECT_RAILWAY_AI=false`, `VITE_ENABLE_REFLECT_CLOUD_AI=false`, `VITE_ENABLE_REFLECT_RAILWAY_PRECHECK=false`.
- Server paid traffic requires distinct controls: `REFLECT_AI_ENABLED`, `REFLECT_XAI_OUTBOUND_ENABLED`, legacy single-owner `REFLECT_AI_ALLOWED_UID`, private Firestore runtime flag. Do not enable these merely to demo UI. Replace recurring manual UID gating with durable private account entitlement before broad access.
- Conservative reserved quota in code: $0.01/call, $0.05/user/day, $0.20/global/day. **Not hard provider billing caps.** No automatic retries or private diary text in the first paid test.

## Owner-confirmed result from screenshots on 2026-11-09 ~23:06
1. The owner built Stage05A `dcaa1f9` locally and manually deployed **Firebase Hosting staging only**: `STAGING: VERIFIED`, `Deploy complete!`, `DEPLOY EXIT CODE: 0`.
2. Registration previously linked the existing guest Firebase UID to email. First it was a non-receiving `example.com` demo address; recovery there was impossible. The app now exposes **Изменить email** and Firebase recent-login reauthentication `reauthenticateWithCredential` **inside the dialog** (no signout, no UID replacement).
3. Latest **real Gmail message** was delivered in Russian with action `verifyAndChangeEmail`. Owner opened Firebase's link. The hosted action page displayed **«Адрес электронной почты подтверждён и изменён»** for the new controlled email. Owner returned to Reflect: diary/profile intact, sidebar **«Email подключён»**. **Do not reproduce the user's real mailbox or OOB links from screenshots.**
4. **Not yet separately proven**: new email appears in account after Auth `reload` with verified flag, successful signout/signin using new email/password, same UID and notes from second browser, password recovery, and any real Grok 4.3 request/save. Do not claim these passed just because owner said «всё работает».
5. **Visual gap confirmed**: Firebase's default successful email-action page is **white/unbranded**; the delivered email is Russian but unstyled/from default Firebase. These must be branded, not left as-is in production.
6. Firebase Authentication staging: **Email/Password and Anonymous Enabled**. Templates language Russian; console showed red banner **«Email template updates are currently unavailable for this project»**. Do not repeatedly edit built-in templates or enable SMTP without an approved provider.

## Existing code — do not rewrite
- Auth: `src/hooks/accountAccess.js`, `accountSession.js`, `useAuth.js`; `src/components/modals/AccountAccess.jsx`. Includes anonymous→registered linking with same UID, signout without phantom anonymous login, profile-only guest explicit switch consent, verification/reset, email change via `verifyBeforeUpdateEmail` and in-place `reauthenticateWithCredential` when Firebase requires recent login. Tests cover UID preservation.
- UI technical: `public/favicon.svg`, theme-aware `index.html` first-paint splash, `Loader.jsx`, `AppFailureView.jsx`, `AppErrorBoundary.jsx`, `entryRoute.js` and tests; 404/500/503 are branded SPA states, not necessarily true HTTP status codes. Verify visually rather than duplicate.
- Auth email language: `src/i18n/authEmailLocale.js`; default RU, app setting `reflect-locale`, `auth.languageCode`. **Three-language app and transactional mail are required**, two additional locales **not decided**. App setting/account preference, not IP/geolocation, selects mail language.
- Sessions: one-message consent, no automatic provider use or auto-save, explicit Save Session, protect drafts on failed send. Real backend completion unverified.

## Immediate next steps (do these, not setup)
**05A completion:** Owner is still signed in. Ask to open **Аккаунт и вход → Проверить подтверждение**. Verify changed email and `emailVerified` on same account after reload. Create one synthetic note and confirm persistence before any signout. Only if the owner knows the current password: test **Выйти → С возвращением → Войти с новым email → same UID/note**, then second browser/device. If password unknown, **do not sign out**, do not reset browser/clear storage; identify a provider-supported recovery route that does not jeopardize the existing open account. For any screenshot, mask private email and **oobCode**.

**05B live AI:** Check exact Railway runtime, permissions, private budget ledger, actual xAI availability/pricing/usage and scoped access. Keep egress OFF while testing negative cases. A one-time owner allowlist is temporary, not recurring manual product UX. After explicit cost approval, run **one synthetic non-personal billed request**, validate actual Grok 4.3 answer through Sessions and provider Usage, and user-initiated Save Session, reload and ownership. Never use a mock response as proof. No automatic retry.

**05C polish:** finish Midnight Aurora branded `/auth/action` (verify/change/reset/recover/expired links) before switching Firebase action URL. Then approved custom email sender/HTML templates with server-side action link generation, SPF/DKIM/DMARC and delivery tests; Firebase built-in template editor currently blocked. Three languages chosen by app UI preference; do not guess missing languages. QA favicon/splash/404/500/503, responsive/light/dark and accessibility.

**05D functional QA:** diary, sessions, moods, goals, profile, export/deletion, history/reload, mobile, offline/privacy, performance/code split (~674 KB JS). Test real Firestore ownership and no cross-UID exposure.

**05E production:** privacy/consent/data lifecycle, rate limits/abuse, provider costs, logs/monitoring, test matrix, backup/rollback, staged PR merge review. Only with explicit owner go/no-go deploy to production. Stage06 product/revenue enhancements afterward; no unnecessary Rails rewrite.

## Local worktree and safe deployment contract
- Linux Mint + zsh, path **`~/reflect-stage37-account`**, detached worktree. Other preserved worktrees Stage36/Stage35, etc.
- User sometimes arrives in another project folder; always `cd ~/reflect-stage37-account` first.
- `.env.staging.local` is git-ignored, preserve and never print contents; `?? .firebase/` is Firebase CLI local cache, not a tracked conflict. Use `git status --porcelain --untracked-files=no` before detached checkout; do **not** reset/clean/delete without user agreement.
- Node `22.x` required by package.json; Node25 once gave EBADENGINE although build passed.
- Tests: `npm test` (Vitest + emulator), `npm run typecheck`, `npm run build -- --mode staging`.
- Deployment target ONLY `firebase deploy --config firebase.staging.json --project reflect-ai-staging --only hosting` after exact-head QA/flags/build review; no production and no Firestore Rules deploy by default. The owner runs deployment. Commands should not contain `exit` that closes interactive terminal; print concise result codes.
- For each stage: **verified facts | changed paths/commit | deployed status | blockers | unverified claims | next 1–3 steps**. Save checkpoints in GitHub; chats do not auto-sync.

## Credentials and privacy
Never solicit/share passwords, xAI key, Firebase Admin JSON, auth tokens, verification/reset action links (`oobCode`), real account email, private diary data, bank details. User screenshots in old conversation showed one-time Firebase action links; do not copy them into new notes, GitHub or reports. No destruction or cross-account migration by guesswork.

**Actual stop point:** **registered owner account present, Firebase email change action verified, staging `dcaa1f9` published, AI frontend OFF; next verify in-app email state and returning login, then genuine guarded Grok test**.

## 2026-11-09 — owner browser QA and next Stage05B gate (later checkpoint)

- User supplied five browser screenshots: **registered email verified** in Reflect account dialog; synthetic mood + `Test` diary records shown in the regular signed-in window; **same two records and linked account shown in Chrome incognito**. Treat synthetic diary persistence and cross-window access as user-visible PASS. UID equality by direct Firebase comparison and password-reset flow remain unverified; no user secret copied. Do not repeat registration or email change.
- Code-only Stage05B private expiring `staging_tester` entitlement now wired in Railway HTTP bridge, checking current verified Auth account, token revocation, private `entitlements/{uid}` grant, and separate xAI egress flag. Legacy environment allowlist was removed **in PR branch code only**. All **10/10 GitHub Actions passed on application commit `e72464abf392481baf0de195c424e4b144f1495e`**. Later documentation commits do not constitute another deployed application version.
- Actual Railway staging still on PR #36 commit `1f3dd2ce5f73f5b1770c0e18b491f059e80f5fb3`, deployment `SUCCESS`; isolated Hosting remains prior verified `dcaa1f9fcc84764c5550c37f0892170cb884e384`. **No Stage05B deploy, paid xAI request, provider receipt, production changes or main merge.**
- xAI official docs on Nov 9 confirm `grok-4.3` published token rates $1.25 input / $2.50 output per 1M tokens; no actual xAI account usage or billing settings examined. Next **user action**: in Firebase Console open *reflect-ai-staging → Firestore Database → Rules*, supply screenshot or non-secret active rules text. Review **all overlapping allow rules**, not merely a private-path deny. Do not modify the rules or create paid entitlements until verified. Then nonbillable server deploy review and negative authorization QA; only after user approval one synthetic paid Grok response and explicit Save Session.
- Technical runbook: `docs/roadmap/STAGE_05B_SERVER_ENTITLEMENT_2026-11-09.md`. Keep user-facing instructions limited to one page and 1–3 steps.
