"use strict";

/**
 * Stage 04A: server-only, provider-neutral policy primitives.
 * NOT a deployed Cloud Function; NOT imported into src/ or a browser bundle.
 * No provider calls, logging, persistence, secrets or personal data retrieval.
 */
const CONSENT_VERSION = "2026-11-07";
const LIMITS = Object.freeze({
  maxMessageChars: 4000,
  maxMessageBytes: 12000,
  maxReplyChars: 2400,
  maxInputTokens: 1200,
  maxOutputTokens: 512,
  maxPerMinute: 2,
  maxPerUtcDay: 10,
  maxUserTokensPerUtcDay: 18000,
  maxGlobalTokensPerUtcDay: 120000
});
const ALLOWED_INPUT_KEYS = Object.freeze(["requestId", "message", "consent"]);
const ALLOWED_CONSENT_KEYS = Object.freeze(["granted", "version", "scope"]);
const ID = /^[a-zA-Z0-9_-]{12,80}$/;
const REDACTED_ERROR = "AI request rejected by server policy.";
const plain = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const only = (value, keys) => Object.keys(value).every(k => keys.includes(k));
const validTime = time => Number.isSafeInteger(time) && time >= 0;
const dayUTC = time => new Date(time).toISOString().slice(0, 10);
const bytes = message => Buffer.byteLength(message, "utf8");
const cleanMessage = value => typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= LIMITS.maxMessageChars &&
  bytes(value) <= LIMITS.maxMessageBytes &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

class PolicyError extends Error {
  constructor(code) {
    super(REDACTED_ERROR);
    this.name = "PolicyError";
    this.code = code;
  }
}
const fail = code => { throw new PolicyError(code); };

function validateRequest(body, server) {
  if (!plain(server) || typeof server.uid !== "string" ||
      server.uid.length < 1 || server.uid.length > 128 ||
      server.appCheckVerified !== true) fail("unauthenticated");
  if (!plain(body) || !only(body, ALLOWED_INPUT_KEYS) ||
      Object.keys(body).length !== ALLOWED_INPUT_KEYS.length ||
      typeof body.requestId !== "string" || !ID.test(body.requestId)) {
    fail("invalid-argument");
  }
  if (!plain(body.consent) ||
      !only(body.consent, ALLOWED_CONSENT_KEYS) ||
      Object.keys(body.consent).length !== ALLOWED_CONSENT_KEYS.length ||
      body.consent.granted !== true ||
      body.consent.version !== CONSENT_VERSION ||
      body.consent.scope !== "one-message") {
    fail("permission-denied");
  }
  if (!cleanMessage(body.message)) fail("invalid-argument");

  // Never accept user-selected provider, model, system prompt, UID, existing
  // archive, profile, chatHistory or arbitrary context via request body.
  // Only the deliberately chosen single message crosses this trust boundary.
  return Object.freeze({
    uid: server.uid,
    requestId: body.requestId,
    message: body.message.trim()
  });
}

function validateAssistantReply(value) {
  if (!plain(value) || !only(value, ["text"]) ||
      typeof value.text !== "string" || !value.text.trim() ||
      value.text.length > LIMITS.maxReplyChars ||
      bytes(value.text) > LIMITS.maxReplyChars * 4) {
    fail("invalid-provider-response");
  }
  return Object.freeze({ text: value.text.trim() });
}

function safeState(input, nowMs) {
  if (!validTime(nowMs)) fail("invalid-server-time");
  const day = dayUTC(nowMs);
  if (input == null) {
    return { day, count: 0, reservedTokens: 0, recent: [], ids: [] };
  }
  if (!plain(input) || typeof input.day !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.day) ||
      !Number.isSafeInteger(input.count) || input.count < 0 ||
      !Number.isSafeInteger(input.reservedTokens) || input.reservedTokens < 0 ||
      !Array.isArray(input.recent) || !Array.isArray(input.ids) ||
      input.recent.length > 100 || input.ids.length > 100 ||
      input.recent.some(t => !validTime(t)) ||
      input.ids.some(id => typeof id !== "string" || !ID.test(id))) {
    fail("invalid-quota-state");
  }
  if (input.day !== day) {
    // A real adapter MUST also keep a separate durable request-ID ledger
    // across UTC-day boundaries to prevent idempotency bypass.
    return { day, count: 0, reservedTokens: 0, recent: [], ids: [] };
  }
  return {
    day, count: input.count, reservedTokens: input.reservedTokens,
    recent: input.recent, ids: input.ids
  };
}

/**
 * Synchronous deterministic *proposal*, NOT a concurrency-safe quota.
 * The future backend must read/write BOTH owner + project-wide quota
 * documents and idempotency ledger in one Firestore server transaction.
 * When the provider fails, retain reservations (no free spam retries).
 */
function planQuotaReservation(state, {
  nowMs, requestId, estimatedInputTokens, projectReservedTokens = 0
}) {
  const prior = safeState(state, nowMs);
  if (typeof requestId !== "string" || !ID.test(requestId) ||
      !Number.isSafeInteger(estimatedInputTokens) ||
      estimatedInputTokens < 1 ||
      estimatedInputTokens > LIMITS.maxInputTokens ||
      !Number.isSafeInteger(projectReservedTokens) ||
      projectReservedTokens < 0) fail("invalid-argument");
  if (prior.ids.includes(requestId)) fail("already-exists");
  const recent = prior.recent.filter(timestamp => timestamp > nowMs - 60000);
  if (recent.length >= LIMITS.maxPerMinute) fail("resource-exhausted");
  if (prior.count >= LIMITS.maxPerUtcDay) fail("resource-exhausted");
  const tokens = estimatedInputTokens + LIMITS.maxOutputTokens;
  if (prior.reservedTokens + tokens > LIMITS.maxUserTokensPerUtcDay ||
      projectReservedTokens + tokens > LIMITS.maxGlobalTokensPerUtcDay) {
    fail("resource-exhausted");
  }
  return Object.freeze({
    day: prior.day,
    count: prior.count + 1,
    reservedTokens: prior.reservedTokens + tokens,
    recent: [...recent, nowMs],
    ids: [...prior.ids, requestId],
    projectReservedTokensAfter: projectReservedTokens + tokens,
    reservationTokens: tokens
  });
}

module.exports = {
  CONSENT_VERSION, LIMITS, PolicyError, validateRequest,
  validateAssistantReply, planQuotaReservation
};
