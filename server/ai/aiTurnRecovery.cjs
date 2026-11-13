"use strict";

/**
 * P0.1 opt-in STAGING-only server owned AI turn receipts.
 * The existing immutable quota/money ledger remains separate; no prompt,
 * reply, token, profile or diary data is ever written to a receipt.
 * Successful replies are stored only in the authenticated owner's existing
 * session, atomically with the metadata receipt BEFORE HTTP success.
 */
const { PolicyError } = require("./policy.cjs");
const PROJECT = "reflect-ai-staging";
const NAMESPACE = "reflect-8fdc8";
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const RESOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const SOURCE = /^user-[A-Za-z0-9_-]{12,80}$/;
const LEASE_MS = 120000; // > Railway request deadline + provider timeout
const MAX_ATTEMPTS = 6;
const SAFE_ERRORS = new Set([
  "invalid-argument", "permission-denied", "unauthenticated",
  "already-exists", "resource-exhausted", "unavailable",
  "invalid-provider-response", "xai-invalid-request",
  "xai-unauthorized", "xai-forbidden", "xai-endpoint-not-found",
  "xai-rate-limited", "xai-upstream-timeout", "xai-upstream-error",
  "xai-request-too-large", "xai-unavailable",
  "xai-response-incomplete", "xai-envelope-invalid",
  "xai-interaction-invalid", "xai-transport-invalid"
]);
const fail = code => { throw new PolicyError(code); };
const plain = value => Boolean(value) && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const valid = (pattern, value) => typeof value === "string" && pattern.test(value);
// The provider adapter strips upstream bodies and exposes only a numeric HTTP
// code as non-enumerable trusted server metadata. Match the Railway gateway's
// redacted categories on receipt; never store response content or headers.
function codeOf(e) {
  if (e?.code === "invalid-provider-response") {
    const trustedStages = Object.freeze({
      incomplete: "xai-response-incomplete",
      envelope: "xai-envelope-invalid",
      "interaction-contract": "xai-interaction-invalid",
      "transport-shape": "xai-transport-invalid"
    });
    if (Object.hasOwn(trustedStages, e.providerFailureStage)) {
      return trustedStages[e.providerFailureStage];
    }
  }
  if (e?.code === "unavailable" &&
      Number.isInteger(e.upstreamHttpStatus)) {
    const safe = Object.freeze({
      400: "xai-invalid-request", 401: "xai-unauthorized",
      403: "xai-forbidden", 404: "xai-endpoint-not-found",
      408: "xai-upstream-timeout", 413: "xai-request-too-large",
      422: "xai-invalid-request", 429: "xai-rate-limited"
    });
    return safe[e.upstreamHttpStatus] ||
      (e.upstreamHttpStatus >= 500 ? "xai-upstream-error" : "xai-unavailable");
  }
  return SAFE_ERRORS.has(e?.code) ? e.code : "unavailable";
}
const nowOk = value => Number.isSafeInteger(value) && value > 0;

function validateTurnTarget({ uid, sessionId, sourceTurnId }) {
  if (!valid(RESOURCE, uid) || !valid(RESOURCE, sessionId) ||
      !valid(SOURCE, sourceTurnId)) fail("invalid-argument");
  return Object.freeze({ uid, sessionId, sourceTurnId });
}
function sessionPath(target) {
  return `artifacts/${NAMESPACE}/users/${target.uid}/sessions/${target.sessionId}`;
}
function receiptPath(target) {
  // Existing Firestore Rules deny ALL browser access to _reflectAiPrivate.
  // The authenticated user session remains the only content storage.
  return `_reflectAiPrivate/${NAMESPACE}/attemptOwners/${target.uid}` +
    `/sessions/${target.sessionId}/turns/${target.sourceTurnId}`;
}
function sourceEvidence(data, sourceTurnId, expectedMessage) {
  const history = data?.chatHistory;
  if (!Array.isArray(history) || history.length > 1000) fail("invalid-session-history");
  const index = history.findIndex(t => t?.role === "user" && t?.id === sourceTurnId);
  if (index === -1 ||
      history.slice(index + 1).some(t => t?.id === sourceTurnId) ||
      (data.ownerUid && data.ownerUid !== undefined && typeof data.ownerUid !== "string")) {
    fail("permission-denied");
  }
  if ((data.ownerUid != null && data.ownerUid !== data.__expectedUid) ||
      (data.uid != null && data.uid !== data.__expectedUid)) fail("permission-denied");
  if (expectedMessage !== undefined && history[index]?.content !== expectedMessage) {
    fail("permission-denied");
  }
  let hasReply = false;
  for (let i = index + 1; i < history.length; i++) {
    if (history[i]?.role === "user") break;
    if (history[i]?.role === "assistant") hasReply = true;
  }
  return { history, index, hasReply };
}
function checkSession(snapshot, target, expectedMessage) {
  if (!snapshot?.exists) fail("not-found");
  const data = snapshot.data();
  if (!plain(data)) fail("permission-denied");
  const scoped = { ...data, __expectedUid: target.uid };
  const result = sourceEvidence(scoped, target.sourceTurnId, expectedMessage);
  return { data, ...result };
}
function publicState(receipt, hasReply, nowMs) {
  if (!receipt) {
    return { status: hasReply ? "reply_exists" : "not_tracked",
      billedPossible: !hasReply, canRetry: !hasReply, errorCode: null,
      requestId: null, assistantTurnId: null };
  }
  if (!plain(receipt) || !valid(REQUEST, receipt.requestId)) fail("unavailable");
  const expired = receipt.status === "provider_pending" &&
    (!nowOk(receipt.leaseUntilMs) || receipt.leaseUntilMs <= nowMs);
  const status = expired ? "outcome_unknown" : receipt.status;
  const possible = Boolean(receipt.billedPossible) ||
    ["provider_pending","outcome_unknown","failed_after_provider","persisted_reply"].includes(status);
  const canRetry = !hasReply && (
    status === "failed_before_provider" ||
    status === "failed_after_provider" || status === "outcome_unknown"
  ) && receipt.status !== "persisted_reply" &&
    Number.isInteger(receipt.attemptsCount) &&
    receipt.attemptsCount < MAX_ATTEMPTS;
  return {
    status: hasReply && status !== "persisted_reply" ? "reply_exists" : status,
    billedPossible: possible, canRetry: canRetry && !hasReply,
    errorCode: SAFE_ERRORS.has(receipt.errorCode) ? receipt.errorCode : null,
    requestId: receipt.requestId,
    assistantTurnId: status === "persisted_reply" && hasReply
      ? receipt.assistantTurnId : null
  };
}

function validateAttemptPayload(body) {
  if (!plain(body) ||
      !["requestId","message","consent","sessionId","sourceTurnId","retryConfirmed"]
        .every(k => k in body || k === "retryConfirmed") ||
      Object.keys(body).some(k => ![
        "requestId","message","consent","sessionId","sourceTurnId","retryConfirmed"
      ].includes(k)) ||
      !valid(RESOURCE, body.sessionId) || !valid(SOURCE, body.sourceTurnId) ||
      (body.retryConfirmed !== undefined && body.retryConfirmed !== true)) {
    fail("invalid-argument");
  }
  return Object.freeze({
    base: { requestId: body.requestId, message: body.message, consent: body.consent },
    sessionId: body.sessionId, sourceTurnId: body.sourceTurnId,
    retryConfirmed: body.retryConfirmed === true
  });
}
function validateStatusBody(body) {
  if (!plain(body) || Object.keys(body).length !== 2 ||
      !valid(RESOURCE, body.sessionId) || !valid(SOURCE, body.sourceTurnId)) {
    fail("invalid-argument");
  }
  return body;
}

function createAiTurnRecovery({ db, projectId, clock = Date.now }) {
  if (projectId !== PROJECT || !db || typeof db.doc !== "function" ||
      typeof db.runTransaction !== "function" || typeof clock !== "function") {
    fail("unsafe-environment");
  }
  const refs = target => ({ session: db.doc(sessionPath(target)),
    receipt: db.doc(receiptPath(target)) });

  async function claim({ uid, sessionId, sourceTurnId, requestId, message, retryConfirmed }) {
    const target = validateTurnTarget({ uid, sessionId, sourceTurnId });
    if (!valid(REQUEST, requestId) || typeof message !== "string" ||
        !message.trim() || typeof retryConfirmed !== "boolean") fail("invalid-argument");
    const first = sourceTurnId === "user-" + requestId;
    if (!first && !retryConfirmed) fail("permission-denied");
    const nowMs = clock();
    if (!nowOk(nowMs)) fail("unavailable");
    const { session, receipt } = refs(target);
    return db.runTransaction(async tx => {
      const [stored, prior] = await Promise.all([tx.get(session), tx.get(receipt)]);
      const { hasReply } = checkSession(stored, target, message);
      if (hasReply) fail("already-exists");
      const previous = prior.exists ? prior.data() : null;
      if (!previous && !first && !retryConfirmed) fail("permission-denied");
      if (previous) {
        const state = publicState(previous, false, nowMs);
        if (!retryConfirmed || !state.canRetry ||
            previous.requestId === requestId ||
            !Number.isInteger(previous.attemptsCount) ||
            previous.attemptsCount >= MAX_ATTEMPTS) fail("already-exists");
      }
      tx.set(receipt, {
        schemaVersion: 1, uid, sessionId, sourceTurnId, requestId,
        status: "provider_pending", billedPossible: false, errorCode: null,
        attemptsCount: previous ? previous.attemptsCount + 1 : 1,
        leaseUntilMs: nowMs + LEASE_MS, updatedAt: new Date(nowMs),
        createdAt: previous?.createdAt ?? new Date(nowMs), assistantTurnId: null
      });
      return Object.freeze({ ...target, requestId });
    });
  }

  async function providerStarted(attempt) {
    const target = validateTurnTarget(attempt);
    const nowMs = clock();
    const { receipt } = refs(target);
    await db.runTransaction(async tx => {
      const snap = await tx.get(receipt);
      const data = snap.exists && snap.data();
      if (!data || data.requestId !== attempt.requestId ||
          data.status !== "provider_pending") fail("already-exists");
      tx.update(receipt, { billedPossible: true, updatedAt: new Date(nowMs) });
    });
  }

  async function finishFailed(attempt, { beforeProvider, error } = {}) {
    const target = validateTurnTarget(attempt);
    const nowMs = clock();
    const { receipt } = refs(target);
    await db.runTransaction(async tx => {
      const snap = await tx.get(receipt);
      const data = snap.exists && snap.data();
      if (!data || data.requestId !== attempt.requestId ||
          data.status !== "provider_pending") return;
      tx.update(receipt, {
        status: beforeProvider ? "failed_before_provider" : "failed_after_provider",
        billedPossible: !beforeProvider, errorCode: codeOf(error),
        updatedAt: new Date(nowMs)
      });
    });
  }

  async function persistReply(attempt, reply) {
    const target = validateTurnTarget(attempt);
    if (!reply || typeof reply.text !== "string" || !reply.text.trim() ||
        reply.text.length > 2400) fail("invalid-provider-response");
    const nowMs = clock(), { session, receipt } = refs(target);
    const answerId = "assistant-" + attempt.requestId;
    await db.runTransaction(async tx => {
      const [stored, snap] = await Promise.all([tx.get(session), tx.get(receipt)]);
      const { history, hasReply } = checkSession(stored, target);
      const data = snap.exists && snap.data();
      if (!data || data.requestId !== attempt.requestId ||
          data.status !== "provider_pending") fail("already-exists");
      if (hasReply || history.some(x => x?.id === answerId)) fail("already-exists");
      const assistantTurn = {
        id: answerId, role: "assistant", sourceTurnId: target.sourceTurnId,
        content: reply.text.trim(), timestamp: new Date(nowMs),
        ...(reply.interaction?.version === "reflect.interaction.v1"
          ? { interaction: reply.interaction } : {})
      };
      // Both writes commit together. Concurrent arrayUnion writes to session
      // cause a transaction retry rather than erasing a second browser's turn.
      tx.update(session, { chatHistory: [...history, assistantTurn],
        updatedAt: new Date(nowMs) });
      tx.update(receipt, {
        status: "persisted_reply", billedPossible: true,
        assistantTurnId: answerId, errorCode: null, updatedAt: new Date(nowMs)
      });
    });
    return answerId;
  }

  async function status({ uid, sessionId, sourceTurnId }) {
    const target = validateTurnTarget({ uid, sessionId, sourceTurnId });
    const { session, receipt } = refs(target);
    const [stored, snap] = await Promise.all([session.get(), receipt.get()]);
    const { hasReply } = checkSession(stored, target);
    const data = snap.exists ? snap.data() : null;
    const state = publicState(data, hasReply, clock());
    return Object.freeze({ ...state, sessionId, sourceTurnId });
  }

  return Object.freeze({ claim, providerStarted, finishFailed, persistReply, status });
}
module.exports = {
  createAiTurnRecovery, validateAttemptPayload, validateStatusBody,
  validateTurnTarget, publicState, LEASE_MS
};
