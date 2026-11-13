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
  interactionEnabled = false
}) {
  if (!appId || typeof appId !== "string" ||
      !/^1:[0-9]+:web:[A-Za-z0-9]+$/.test(appId) ||
      typeof readSecret !== "function" ||
      typeof transport !== "function" ||
      typeof clock !== "function") fail("unsafe-environment");
  const budget = createHostedBudget(db, projectId);
  const adapter = createXaiProviderAdapter({
    readSecret, transport, timeoutMs: 20000
  });
  return async function handle(request) {
    if (!request?.auth?.uid ||
        request.app?.appId !== appId ||
        request.app?.alreadyConsumed === true) {
      fail("unauthenticated");
    }
    const input = validateRequest(request.data, {
      uid: request.auth.uid, appCheckVerified: true
    });
    if (Buffer.byteLength(input.message, "utf8") > MAX_MESSAGE_BYTES) {
      fail("invalid-argument");
    }
    const nowMs = clock();
    await budget.reserve({
      uid: input.uid, requestId: input.requestId,
      message: input.message, nowMs, structured: interactionEnabled
    });
    try {
      const settings = interactionEnabled
        ? await readOwnerSettings(db, input.uid) : null;
      const value = await adapter.invoke(input.message, settings);
      // Charge receipt is kept internal. No diary/profile is read or written.
      await budget.finish({
        uid: input.uid, requestId: input.requestId,
        status: "completed", nowMs: clock(),
        actualUsdTicks: value.actualUsdTicks
      });
      return Object.freeze({
        text: value.text,
        ...(interactionEnabled && value.interaction
          ? { interaction: value.interaction, promptVersion: VERSION } : {}),
        model: value.model,
        actualUsdTicks: value.actualUsdTicks,
        estimatedUsd: value.estimatedUsdFromPublishedRates
      });
    } catch (error) {
      // Failure is ambiguous and may still be billed: keep the reservation
      // and immutable ID. The same request is never automatically retried.
      try {
        await budget.finish({
          uid: input.uid, requestId: input.requestId,
          status: "failed", nowMs: clock()
        });
      } catch { /* never expose storage/provider internals */ }
      if (error instanceof PolicyError) throw error;
      fail("unavailable");
    }
  };
}
module.exports = { createHostedHandler, readOwnerSettings, CONSENT_VERSION };
