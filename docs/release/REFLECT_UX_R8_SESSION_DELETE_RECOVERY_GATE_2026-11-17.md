# Reflect UX R8 — Session Delete + Recover Unanswered Saved Turn
Date: 2026-11-17
Status: Draft implementation; NO DEPLOY; no user data change; no paid Grok requests

## UX truth and exact baselines
Owner's desktop screenshot of Firebase Hosting UX R7 at exact Git source SHA \`d67fb7e2570315c3127a247e5ca5c1462ad98b69\` shows a saved single user turn ("Меня сильно расстраивает...") and no action to retry. Session ellipsis menu has no delete action. R7 uses Railway R1 staging backend SHA \`81ceda1a92268317ed56c54c4912eacd8ffe57b5\` with live Railway deployment \`0c4f77e4-3343-4f0f-a9b7-cd14449ccbee\`. Prior 403 from expired \`expiresAt\` entitlement was fixed manually by owner in Firestore (new date displayed truncated in screenshot; exact timestamp **not yet independently verified**). No xAI test result claimed after this update.

## Scope of frontend UX R8
- A discreet "Удалить сеанс" action in saved session's \`⋯\` menu and an explicit trash control per card in the session library.
- A dark, softened "Удалить сеанс?" modal, focus containment, keyboard Escape, non-destructive Cancel, explicit "Удалить навсегда" secondary action, pending / error states. User data delete uses existing authenticated owner-scoped Firestore Rules and a single \`deleteDoc(artifacts/reflect-8fdc8/users/{uid}/sessions/{sessionId})\`.
- No cascading destruction of goals or diary notes; a linked goal warning appears. ALL private AI receipts in \`_reflectAiPrivate\` remain server-side and are not deleted by the browser; the UI openly explains this. The primary document's chat history, hypothesis grades and suggestions are removed. This is not a full GDPR/subject-erasure workflow.
- Delete is disabled while any draft, active AI request or unsaved paid response is present; failed storage writes never optimistically erase UI data. Cross-owner account switch clears the confirmation state.
- The pre-existing \`ReplyRecoveryPanel\` was not actually visible on R7 because \`railwayAiRecoveryEnabled\` requires independent \`VITE_ENABLE_REFLECT_AI_RECOVERY=true\`. R8 makes the existing safeguarded user-turn recovery compact, clear and style-consistent: subtle hierarchy and border, a visible "Проверить и восстановить" entry, **free server receipt check first**, and a separate explicit confirmation before a possible paid new attempt. Saved user turn is not re-appended. Status and provider error codes are not dumped raw to UI.
- Existing server \`aiTurnRecovery.cjs\` is authoritative on owner/turn ownership, recent paid attempt receipt, retry count, and atomic assistant response write. Normal client "send" is NEVER used as the fallback for a missing reply.

## Activation and safety stop
**Frontend R8 code by itself does not enable retries.** The following is a coordinated, separately authorized staging-only release gate; do not silently flip flags in production or existing live Railway:
1. Verify the *actual Railway staging* \`REFLECT_AI_ATTEMPT_RECEIPTS_ENABLED\` server flag. It may be OFF, not assumed ON based on a variable name; do not read secret values.
2. Verify the *actual Firebase staging bundle* \`VITE_ENABLE_REFLECT_AI_RECOVERY\` is OFF on R7. The UI screenshot and source gate explain why recovery was not shown.
3. The new frontend MUST be built for staging with \`VITE_ENABLE_REFLECT_AI_RECOVERY=true\` only after staging backend receipt path has been isolated, CI-tested, health checked and owner-approved. R8 expects server to create/inspect attempt receipts and atomically persist assistant turns. Deploying frontend R8 with recovery=true while server receipts are OFF can break sending.
4. Conversely, when server receipts are ON, legacy R7 clients without owner source-turn IDs may be rejected by \`validateAttemptPayload\`. Plan a **controlled staging-only maintenance switch** or a separately security-reviewed backward-compatible bridge, and **check no active paid requests**. Do not assume a zero-downtime toggle.
5. Requires **separate explicit owner approval before modifying Railway config or Firebase Hosting**, and a recorded backend rollback/source SHA and current Firebase Hosting active release hash before any deployment. Use exact immutable Git SHAs with local Node 22, npm ci, tests, preflight and postbuild guard. Build in a new worktree; do not overwrite R7. Zero production, Git main, secrets or Firestore Rules modifications.
6. For the owner's **old** missing answer, after server + frontend are both activated, status may be \`not_tracked\` (legacy attempt, possible charge), not automatically "failed_before_provider" even though the historical server 403 was confirmed. Only owner explicit confirmation can initiate one new billable attempt, bounded by backend rate/quota. No silent automatic retry. Preview/consented history requests remain blocked from legacy retry.
7. A "retry" test must verify account Auth, App Check, valid entitlement and provider spend budget separately. Genuine Grok traffic requires explicit owner-approved max call count + max USD cost before sending (the earlier $0.25 proposal was not approved). Only count real xAI usage after readback. A free \`/v1/ai/diagnostics\` check is recommended prior to sending.

## Acceptance checklist
- Desktop & responsive (390px/320px) layout; delete in menu & library; Escape/Cancel/keyboard and responsive modal; reduced-motion respects system setting; delete write only after explicit confirmation.
- Active session removed from onSnapshot, selection resets to "new"; session list, Diary timeline, Mindspace projections and Journey no longer include root session. Linked goals retain accurate orphan-link handling as a separately tracked UX defect; no unintended goal deletion.
- Delete failure retains the whole source and offers cancellation/retry; draft and in-flight paid request blocks deletion.
- Old unanswered turn displays compact recovery in correct position after recovery feature gate becomes active; free check 200 with signed Auth and App Check; no paid xAI call on check; no duplicate user turn.
- Retry gated by \`canRetry\` and second confirmation; a server-side persisted answer appears exactly once after Firestore subscription; pending/unknown/consented context cannot be silently sent.
- Two accounts (Eric/Jack): owner A cannot see/delete/retry owner B's session; Firebase Rules remain immutable. Backend quota, receipt transaction and replay guard still enforced.
- Preserve R7 fixes (progress ring, Mindspace hover, Dashboard accordions). No changes to AI persona, provider model, context grants, budget, tokens or Firebase Rules.

## Reporting
\`Draft PR + exact SHA + CI | UI behavior verified only in offline tests? | recovery flags actually set? | Firebase/Railway live source | rollback | no deployment | blockers | 1–3 next actions\`.
