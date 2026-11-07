"use strict";

/**
 * Stage 04B: non-network, non-deployable mock for the **handler logic** of a
 * future Firebase v2 callable. The request.auth/app fields are supplied by
 * the test harness, NOT verified JWT / App Check attestations. Production
 * MUST use onCall(enforceAppCheck: true) and inspect verified context.
 */
const {
  LIMITS, PolicyError, validateRequest, validateAssistantReply
} = require("./policy.cjs");

const MOCK_RESPONSE = "Тестовый ответ Reflect. Настоящий ИИ не подключён.";
const fail = code => { throw new PolicyError(code); };
const defaultResponder = async () => ({ text: MOCK_RESPONSE });
function estimateInputTokens(message) {
  // Pessimistic fixed-overhead approximation used ONLY in the demo.
  // Future provider selection requires tokenizer-specific worst-case budget.
  return Math.ceil(Buffer.byteLength(message, "utf8") / 4) + 100;
}

async function withTimeout(task, ms) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PolicyError("deadline-exceeded"));
    }, ms);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => task({
      signal: controller.signal, maxOutputTokens: LIMITS.maxOutputTokens
    })), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * No Firebase SDK / HTTP server / provider SDK is imported here.
 * The mock responder intentionally NEVER receives the user's message.
 */
function createMockCallable({
  store, responder = defaultResponder, clock = Date.now, timeoutMs = 1000
} = {}) {
  if (!store || typeof store.reserve !== "function" ||
      typeof store.finish !== "function" ||
      typeof responder !== "function" ||
      typeof clock !== "function" ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 5000) {
    fail("invalid-server-configuration");
  }

  return async function handle(request) {
    if (!request || !request.app || typeof request.app.appId !== "string" ||
        !request.app.appId || request.app.alreadyConsumed === true) {
      fail("unauthenticated");
    }
    const input = validateRequest(request.data, {
      uid: request.auth?.uid,
      appCheckVerified: true
    });
    const estimatedInputTokens = estimateInputTokens(input.message);
    if (estimatedInputTokens > LIMITS.maxInputTokens) fail("resource-exhausted");
    const nowMs = clock();
    // Reserve user AND global budgets and the ledger atomically before
    // any simulated "provider" action, even when the action later fails.
    await store.reserve({
      uid: input.uid, requestId: input.requestId, nowMs,
      estimatedInputTokens
    });
    const context = { uid: input.uid, requestId: input.requestId, nowMs };
    try {
      const value = await withTimeout(responder, timeoutMs);
      const answer = validateAssistantReply(value);
      await store.finish({ ...context, outcome: "completed" });
      return Object.freeze({ text: answer.text, mode: "mock" });
    } catch (error) {
      // Failure does NOT refund reservations or permit reusing request IDs.
      try {
        await store.finish({ ...context, outcome: "failed" });
      } catch {
        // Transaction/ledger failure must not leak message, UID or internals.
      }
      if (error instanceof PolicyError) throw error;
      throw new PolicyError("unavailable");
    }
  };
}

module.exports = {
  createMockCallable, estimateInputTokens, MOCK_RESPONSE
};
