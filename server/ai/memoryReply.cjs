"use strict";

/**
 * M3d.2b — exact owner-approved history egress, STAGING ONLY.
 *
 * Dedicated to ONE saved session and a ONE-TIME new user turn. No browser
 * may supply transcript/excerpts, prompt, UID, model or provider configuration.
 * The independent Railway gate starts OFF. This module does NOT register any
 * route itself; the existing single-message endpoint remains unchanged.
 *
 * Workflow:
 *   verified signed owner request -> explicit second history approval ->
 *   persisted current user turn + scoped grant + exact preview digest ->
 *   immutable attempt claim -> budget reserve including trusted excerpt bytes ->
 *   provider-start receipt -> FINAL fresh grant + digest/session recheck ->
 *   exactly one xAI invocation -> atomic reply/receipt commit -> budget finish.
 *
 * Unknown provider outcomes are potentially billable and NEVER auto-retried.
 */
const { PolicyError, validateRequest } = require("./policy.cjs");
const { createHostedBudget, MAX_MESSAGE_BYTES } = require("./hostedBudget.cjs");
const { createAiTurnRecovery } = require("./aiTurnRecovery.cjs");
const { createSessionMemoryAdapter } = require("./sessionMemory.cjs");
const { createXaiProviderAdapter } = require("./xaiProviderAdapter.cjs");
const { readOwnerSettings, settingsForCommittedTurn } =
  require("./hostedHandler.cjs");
const { VERSION } = require("./interactionContract.cjs");
const { PROJECT_ID } = require("../privacy/contextConsent.cjs");
const { contextWindow } = require("./contextLevels.cjs");

const APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const RESOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const GRANT = /^[A-Za-z0-9_-]{16,80}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const KEYS = Object.freeze([
  "requestId", "message", "consent", "sessionId", "sourceTurnId",
  "grantId", "approvedDigest", "externalHistoryApproved"
]);
const plain = value => Boolean(value) && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const fail = code => { throw new PolicyError(code); };

function validateMemoryReplyPayload(data) {
  if (!plain(data) || !(Object.keys(data).length === KEYS.length ||
      (Object.keys(data).length === KEYS.length + 1 &&
       Object.hasOwn(data, "contextLevel"))) ||
      !KEYS.every(key => Object.hasOwn(data, key)) ||
      !REQUEST.test(data.requestId || "") ||
      !RESOURCE.test(data.sessionId || "") ||
      data.sourceTurnId !== "user-" + data.requestId ||
      !GRANT.test(data.grantId || "") ||
      !SHA256.test(data.approvedDigest || "") ||
      data.externalHistoryApproved !== true ||
      typeof data.message !== "string" ||
      data.message !== data.message.trim() ||
      !data.message.trim() ||
      Buffer.byteLength(data.message, "utf8") > MAX_MESSAGE_BYTES) {
    fail("invalid-argument");
  }
  contextWindow(data.contextLevel); // Reject missing/malformed new-level impersonation.
  // Legacy single-message consent is REQUIRED, not a substitute for separate
  // explicit history approval. validateRequest() verifies the exact schema.
  return Object.freeze({
    base: { requestId: data.requestId, message: data.message, consent: data.consent },
    sessionId: data.sessionId, sourceTurnId: data.sourceTurnId,
    grantId: data.grantId, approvedDigest: data.approvedDigest,
    ...(data.contextLevel === undefined ? {} : { contextLevel: data.contextLevel })
  });
}

/** Shared core is dependency-injected for isolated, non-billable fixtures. */
function createMemoryReplyExecutor({
  budget, recovery, memory, adapter, readSettings, clock = Date.now,
  appId = APP_ID, evidenceV2Enabled = false
}) {
  if (!budget || typeof budget.reserve !== "function" ||
      typeof budget.finish !== "function" ||
      !recovery || typeof recovery.claim !== "function" ||
      typeof recovery.providerStarted !== "function" ||
      typeof recovery.persistReply !== "function" ||
      typeof recovery.finishFailed !== "function" ||
      !memory || typeof memory.authorize !== "function" ||
      !adapter || typeof adapter.invoke !== "function" ||
      typeof readSettings !== "function" ||
      typeof clock !== "function" || appId !== APP_ID ||
      typeof evidenceV2Enabled !== "boolean") {
    fail("unsafe-environment");
  }

  return async function handleMemoryReply(request) {
    const uid = request?.auth?.uid;
    if (typeof uid !== "string" || !RESOURCE.test(uid) ||
        request?.app?.appId !== APP_ID ||
        request?.app?.alreadyConsumed !== false) fail("unauthenticated");
    const envelope = validateMemoryReplyPayload(request.data);
    const input = validateRequest(envelope.base, {
      uid, appCheckVerified: true
    });
    // The client must have saved its exact user turn before this request.
    // It cannot retry the provider automatically or reuse an old source turn.
    const target = Object.freeze({
      principal: { uid, projectId: PROJECT_ID, appCheckVerified: true },
      sourceId: envelope.sessionId, grantId: envelope.grantId,
      requestId: input.requestId, message: input.message,
      approvedDigest: envelope.approvedDigest,
      ...(envelope.contextLevel === undefined ? {} : { contextLevel: envelope.contextLevel })
    });

    // First private read: reject uncommitted/foreign/stale/revoked or modified
    // content BEFORE claiming attempt and money budget.
    let checked = await memory.authorize(target);
    let attempt = null;
    try {
      attempt = await recovery.claim({
        uid, sessionId: envelope.sessionId,
        sourceTurnId: envelope.sourceTurnId,
        requestId: input.requestId, message: input.message,
        retryConfirmed: false, collectEvidence: evidenceV2Enabled
      });
    } catch (error) {
      throw error;
    }

    let reserved = false, providerAttempted = false;
    try {
      await budget.reserve({
        uid, requestId: input.requestId, message: input.message,
        nowMs: clock(), structured: true,
        trustedContextBytes: checked.totalBytes
      });
      reserved = true;
      const settings = settingsForCommittedTurn(await readSettings(uid), attempt);

      // Reserve and receipt are owned by the server. Mark potentially billable
      // BEFORE egress, so a crash/timeout cannot authorize a silent retry.
      await recovery.providerStarted(attempt);
      // Last privileged read immediately before adapter.invoke: session
      // content, current turn, source owner and grant must still match.
      checked = await memory.authorize(target);
      providerAttempted = true;
      const reply = await adapter.invoke(input.message, settings, {
        sourceId: envelope.sessionId, requestId: input.requestId,
        authorizedContext: checked
      }, evidenceV2Enabled ? {
        sourceTurnId: attempt.sourceTurnId, evidence: attempt.evidenceSnapshot
      } : null);
      // Reply and attempt receipt commit together BEFORE a public HTTP 200.
      await recovery.persistReply(attempt, reply);
      // The previously reserved budget remains held if closeout fails.
      try {
        await budget.finish({
          uid, requestId: input.requestId, status: "completed",
          nowMs: clock(), actualUsdTicks: reply.actualUsdTicks
        });
      } catch { /* Never grant another attempt on ambiguous closeout. */ }
      return Object.freeze({
        text: reply.text,
        ...(reply.interaction ? {
          interaction: reply.interaction,
          promptVersion: reply.interaction.version
        } : {}),
        model: reply.model, actualUsdTicks: reply.actualUsdTicks,
        estimatedUsd: reply.estimatedUsdFromPublishedRates,
        persistedByServer: true, sourceTurnId: attempt.sourceTurnId,
        historyUsed: true, excerptCount: checked.turns.length
      });
    } catch (error) {
      // Even if the receipt was already marked as potentially billable,
      // pre-egress failures are marked as such when no adapter invocation
      // was attempted. A real upstream timeout remains billable/unknown.
      try {
        await recovery.finishFailed(attempt, {
          beforeProvider: !providerAttempted, error
        });
      } catch { /* Keep unknown receipt locked. */ }
      if (reserved) {
        try {
          await budget.finish({
            uid, requestId: input.requestId, status: "failed", nowMs: clock()
          });
        } catch { /* Full reservation is retained. */ }
      }
      if (error instanceof PolicyError) throw error;
      fail("unavailable");
    }
  };
}

function createMemoryReplyHandler({
  db, projectId, appId, readSecret, transport, consentStore,
  clock = Date.now, evidenceV2Enabled = false
}) {
  if (projectId !== PROJECT_ID || appId !== APP_ID ||
      typeof evidenceV2Enabled !== "boolean" ||
      !db || !consentStore || typeof consentStore.check !== "function" ||
      typeof readSecret !== "function" ||
      typeof transport !== "function") fail("unsafe-environment");
  return createMemoryReplyExecutor({
    budget: createHostedBudget(db, projectId),
    recovery: createAiTurnRecovery({ db, projectId, clock }),
    memory: createSessionMemoryAdapter({ db, consentStore, projectId }),
    adapter: createXaiProviderAdapter({
      readSecret, transport, timeoutMs: 20000, evidenceV2Enabled
    }),
    readSettings: uid => readOwnerSettings(db, uid),
    clock, appId, evidenceV2Enabled
  });
}

module.exports = {
  APP_ID, validateMemoryReplyPayload,
  createMemoryReplyExecutor, createMemoryReplyHandler
};
