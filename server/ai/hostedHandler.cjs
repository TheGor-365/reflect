"use strict";

/**
 * Provider-neutral trust boundary for a Firebase v2 onCall request.
 * The Firebase SDK verifies Auth + signed App Check before reaching this
 * function; the hosted wrapper validates exact app ID and project.
 * Neither a transcript nor profile is loaded from Firestore.
 */
const { PolicyError, validateRequest, CONSENT_VERSION } = require("./policy.cjs");
const { createXaiProviderAdapter } = require("./xaiProviderAdapter.cjs");
const { createHostedBudget, MAX_MESSAGE_BYTES } = require("./hostedBudget.cjs");
const { VERSION } = require("./interactionContract.cjs");
const { createAiTurnRecovery, validateAttemptPayload } =
  require("./aiTurnRecovery.cjs");

async function readOwnerSettings(db, uid) {
  try {
    // Historical staging namespace, deliberately never reads another UID.
    const snap = await db.collection("artifacts").doc("reflect-8fdc8")
      .collection("users").doc(uid).collection("aiSettings")
      .doc("preferences").get();
    // Preserve the raw versioned document: buildRequest performs the ONE
    // fail-closed normalization immediately before constructing the prompt.
    // Normalizing here stripped schemaVersion, causing a second pass to reset
    // valid owner preferences to defaults (tone, depth and recommendations).
    return snap.exists ? (snap.data() || {}) : {};
  } catch {
    // Invalid/unavailable preferences fail closed to no recommendations.
    // A missing/unavailable document must still use structured V1 with its
    // conservative defaults; null would silently switch the adapter to legacy.
    return {};
  }
}

const fail = code => { throw new PolicyError(code); };
function createHostedHandler({
  db, projectId, appId, readSecret, transport, clock = Date.now,
  interactionEnabled = false, attemptRecoveryEnabled = false
}) {
  if (!appId || typeof appId !== "string" ||
      !/^1:[0-9]+:web:[A-Za-z0-9]+$/.test(appId) ||
      typeof readSecret !== "function" ||
      typeof transport !== "function" ||
      typeof clock !== "function") fail("unsafe-environment");
  const budget = createHostedBudget(db, projectId);
  const recovery = attemptRecoveryEnabled
    ? createAiTurnRecovery({ db, projectId, clock }) : null;
  const adapter = createXaiProviderAdapter({
    readSecret, transport, timeoutMs: 20000
  });
  return async function handle(request) {
    if (!request?.auth?.uid ||
        request.app?.appId !== appId ||
        request.app?.alreadyConsumed === true) {
      fail("unauthenticated");
    }
    const envelope = recovery ? validateAttemptPayload(request.data) : null;
    const input = validateRequest(envelope ? envelope.base : request.data, {
      uid: request.auth.uid, appCheckVerified: true
    });
    if (Buffer.byteLength(input.message, "utf8") > MAX_MESSAGE_BYTES) {
      fail("invalid-argument");
    }
    const nowMs = clock();
    const attempt = recovery ? await recovery.claim({
      uid: input.uid, sessionId: envelope.sessionId,
      sourceTurnId: envelope.sourceTurnId,
      requestId: input.requestId, message: input.message,
      retryConfirmed: envelope.retryConfirmed
    }) : null;
    try {
      await budget.reserve({
        uid: input.uid, requestId: input.requestId,
        message: input.message, nowMs, structured: interactionEnabled
      });
    } catch (error) {
      if (recovery) {
        try { await recovery.finishFailed(attempt, { beforeProvider: true, error }); }
        catch { /* provider was never invoked; remain conservatively locked */ }
      }
      throw error;
    }
    try {
      const settings = interactionEnabled
        ? await readOwnerSettings(db, input.uid) : null;
      // If the private receipt cannot be marked "potentially billable",
      // fail BEFORE contacting xAI. No silent automatic provider retry.
      if (recovery) await recovery.providerStarted(attempt);
      const value = await adapter.invoke(input.message, settings);
      if (recovery) {
        // Atomic server-owned answer + receipt BEFORE HTTP 200.
        await recovery.persistReply(attempt, value);
      }
      // Budget closeout is best effort after a durably committed response.
      // Failure leaves the full existing reserve, never grants extra credit.
      try {
        await budget.finish({
          uid: input.uid, requestId: input.requestId,
          status: "completed", nowMs: clock(),
          actualUsdTicks: value.actualUsdTicks
        });
      } catch {
        if (!recovery) throw new PolicyError("unavailable");
      }
      return Object.freeze({
        text: value.text,
        ...(interactionEnabled && value.interaction
          ? { interaction: value.interaction, promptVersion: VERSION } : {}),
        model: value.model,
        actualUsdTicks: value.actualUsdTicks,
        estimatedUsd: value.estimatedUsdFromPublishedRates,
        ...(recovery ? {
          persistedByServer: true, sourceTurnId: attempt.sourceTurnId
        } : {})
      });
    } catch (error) {
      // Any provider or Firestore failure may be billable. No automatic
      // second invocation; the owner must use the free status route first.
      if (recovery) {
        try { await recovery.finishFailed(attempt, { beforeProvider: false, error }); }
        catch { /* status endpoint reports stale/unknown without granting retries */ }
      }
      try {
        await budget.finish({
          uid: input.uid, requestId: input.requestId,
          status: "failed", nowMs: clock()
        });
      } catch { /* full reserve is retained; no retry budget is freed */ }
      if (error instanceof PolicyError) throw error;
      fail("unavailable");
    }
  };
}
module.exports = { createHostedHandler, readOwnerSettings, CONSENT_VERSION };
