# Reflect 2.0 — Stage 05A: branded email action handler (isolated Draft)

**Checkpoint:** 2026-11-11. **Delivery:** Draft PR stacked on #61. **Not deployed / not configured in Firebase.** This is not evidence of delivery, verification, or account recovery.

## Current verified gap

Stage05A already has email/password registration, anonymous UID-preserving linking, `verifyBeforeUpdateEmail` plus recent-login reauthentication, verification resend/readback, and password recovery email APIs. The signed-in owner's staging account previously had an unreachable demonstration mailbox and a recent-login error. The current email-template configuration screen said updates were unavailable for this Firebase project. **Do not claim this new handler fixes the unreachable old inbox, an unknown password, or a Firebase configuration restriction.**

Firebase's default email-action handler remains the active destination until the owner explicitly changes the template action URL in an eligible isolated staging Firebase project. Existing emailed links must not be rewritten manually or pasted into chat.

## New code (pre-activation)

- `/auth/action` is a passive branded Midnight Aurora route within the existing Hosting SPA rewrite. It supports `verifyEmail`, `verifyAndChangeEmail`, `resetPassword` and `recoverEmail` via the existing Firebase client SDK. No new backend endpoint or paid provider.
- The action link must contain exactly one each of `mode`, `oobCode` and `apiKey`; `apiKey` must match the currently configured client Firebase project, preventing application of a different project's action code.
- The code stays in temporary JS memory. History query/hash are stripped **before React mounts**; if this fails, the action fails closed. The base HTML sets `referrer=no-referrer` to reduce leakage to subsequent asset requests. No logging, persisted codes, URLs, UID, passwords or Firebase error bodies.
- `continueUrl` is intentionally ignored; **never** redirect to the untrusted URL. The only return link is the local root `/`.
- No automatic one-time-code application on page load, no new Auth sign-in, no anonymous UID creation, no Firestore reads/writes. A human explicitly submits verification, recovery or password reset. Resetting requires a matching new password of at least 10 characters and clears inputs on failure/completion.
- The action page currently ships in **Russian only**; user-approved three-language UI and email-body localization remain separate work.

## Source references

- Firebase official guidance: https://firebase.google.com/docs/auth/custom-email-handler/
- Firebase SDK `verifyBeforeUpdateEmail` + `applyActionCode`: https://firebase.google.com/docs/reference/js/auth
- Official ActionCodeInfo types include `VERIFY_AND_CHANGE_EMAIL`: https://firebase.google.com/docs/reference/js/auth.actioncodeinfo.md

## Evidence and acceptance gates

1. **Code review / CI:** exact-head unit and browser-component tests pass; confirm no changes to normal root route and no accidental Auth listener/guest creation on `/auth/action`; check no code in rendered DOM, error messages, logs, history or document referrer.
2. **Separate owner staging Hosting GO:** build in an isolated verified `reflect-ai-staging` environment, check direct `/auth/action` shows safe invalid state without an action link. Do not update Firebase Console yet.
3. **Separate owner Firebase template/action URL GO only if platform allows it:** configure custom handler for isolated staging project with a supported verified mailbox. If Firebase Console remains restricted, record blocked and keep the built-in handler. Do not attempt to bypass template restrictions.
4. **Actual signed/account acceptance with controlled mailbox:** action emails received, valid and expired/single-use links tested; verify UID continuity, email verify/readback, password reset and login in a separate account, wrong-project API key denial, same-origin navigation, account documents unchanged and no guest creation. No passwords or action URLs in screenshots/chat.
5. **Production:** remains untouched until independent release approval and full account recovery/security acceptance.

## Relationship to Gate 5

Gate 5 AI-01K live replay/revoke tests still depend on independent approval for Firebase Hosting staging QA build and temporary Railway Preview ON. This Stage05A code makes no changes to those settings and never enables Grok/history dispatch.

**Do not call either stage production-ready based solely on Draft source or Vercel status.**
