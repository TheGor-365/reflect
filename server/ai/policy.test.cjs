"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONSENT_VERSION, LIMITS, PolicyError, validateRequest,
  validateAssistantReply, planQuotaReservation
} = require("./policy.cjs");

const NOW = Date.parse("2026-11-07T12:00:00.000Z");
const ID = "request_1234567890";
const CONTEXT = Object.freeze({ uid: "synthetic-owner", appCheckVerified: true });
const request = (options = {}) => ({
  requestId: ID, message: "Synthetic user-selected reflection",
  consent: { granted: true, version: CONSENT_VERSION, scope: "one-message" },
  ...options
});
const reason = code => error => error instanceof PolicyError &&
  error.code === code && error.message === "AI request rejected by server policy.";
const reserve = (options = {}, state = null) => planQuotaReservation(state, {
  nowMs: NOW, requestId: ID, estimatedInputTokens: 300, ...options
});

test("accepts only authenticated App Checked user-approved single-message text", () => {
  const result = validateRequest(request(), CONTEXT);
  assert.deepEqual(result, {
    uid: CONTEXT.uid, requestId: ID,
    message: "Synthetic user-selected reflection"
  });
  assert.equal(Object.isFrozen(result), true);
});

test("Auth and App Check both mandatory, cannot derive identity from body", () => {
  assert.throws(() => validateRequest(request(), {}), reason("unauthenticated"));
  assert.throws(() => validateRequest(request(), { uid: "synthetic-owner" }),
    reason("unauthenticated"));
  assert.throws(() => validateRequest({ ...request(), uid: "foreign-user" },
    CONTEXT), reason("invalid-argument"));
});

test("no valid consent, old consent, broad scope or extra consent keys reject", () => {
  const base = request();
  for (const consent of [
    undefined, false, {}, { granted: false, version: CONSENT_VERSION, scope: "one-message" },
    { granted: true, version: "2025", scope: "one-message" },
    { granted: true, version: CONSENT_VERSION, scope: "entire-account" },
    { ...base.consent, rememberAllHistory: true }
  ]) {
    assert.throws(() => validateRequest(request({ consent }), CONTEXT),
      reason("permission-denied"));
  }
});

test("disallows profile, old chat history, provider selection, systemPrompt or secret in payload", () => {
  for (const key of ["profile", "chatHistory", "systemPrompt", "provider",
    "model", "apiKey", "history", "uid", "attachment", "context"]) {
    assert.throws(() => validateRequest(request({ [key]: "not-allowed" }), CONTEXT),
      reason("invalid-argument"));
  }
});

test("refuses empty, overlong, forbidden control characters and oversized multibyte text", () => {
  for (const message of ["  ", "x".repeat(LIMITS.maxMessageChars + 1),
    "hello\u0000world", "😀".repeat(4000), "", null, 17]) {
    assert.throws(() => validateRequest(request({ message }), CONTEXT),
      reason("invalid-argument"));
  }
});

test("rejects malformed or short replay IDs", () => {
  for (const requestId of ["", "q", "a b c", "x".repeat(81), null, "../sensitive"]) {
    assert.throws(() => validateRequest(request({ requestId }), CONTEXT),
      reason("invalid-argument"));
  }
});

test("validates provider response before it reaches browser or Firestore", () => {
  assert.deepEqual(validateAssistantReply({ text: "  Synthetic help  " }),
    { text: "Synthetic help" });
  for (const value of [null, {}, { text: "" },
    { text: "x".repeat(LIMITS.maxReplyChars + 1) },
    { text: "Response", toolCalls: [{ code: "unsafe" }] },
    { text: "ok", uid: "not-allowed" }]) {
    assert.throws(() => validateAssistantReply(value),
      reason("invalid-provider-response"));
  }
});

test("first quota reservation charges request and maximum output budget", () => {
  const planned = reserve();
  assert.equal(planned.count, 1);
  assert.equal(planned.reservationTokens, 300 + LIMITS.maxOutputTokens);
  assert.equal(planned.reservedTokens, planned.reservationTokens);
  assert.equal(planned.projectReservedTokensAfter, planned.reservationTokens);
  assert.deepEqual(planned.ids, [ID]);
  assert.equal(Object.isFrozen(planned), true);
});

test("same request id cannot reserve a second call", () => {
  const state = reserve();
  assert.throws(() => reserve({}, state), reason("already-exists"));
});

test("two calls in rolling minute allowed, third is denied even if IDs differ", () => {
  const a = reserve();
  const b = reserve({ requestId: "request_1234567891", nowMs: NOW + 1000 }, a);
  assert.equal(b.count, 2);
  assert.throws(() => reserve({
    requestId: "request_1234567892", nowMs: NOW + 2000
  }, b), reason("resource-exhausted"));
  const later = reserve({
    requestId: "request_1234567893", nowMs: NOW + 62000
  }, b);
  assert.equal(later.count, 3);
  assert.equal(later.recent.length, 1);
});

test("daily request cap is independent of minute cap", () => {
  const state = {
    day: "2026-11-07", count: LIMITS.maxPerUtcDay,
    reservedTokens: 1000, recent: [], ids: []
  };
  assert.throws(() => reserve({}, state), reason("resource-exhausted"));
});

test("user and project-wide token caps are hard reservation bounds", () => {
  const daily = {
    day: "2026-11-07", count: 1,
    reservedTokens: LIMITS.maxUserTokensPerUtcDay - 200,
    recent: [], ids: []
  };
  assert.throws(() => reserve({}, daily), reason("resource-exhausted"));
  assert.throws(() => reserve({
    projectReservedTokens: LIMITS.maxGlobalTokensPerUtcDay - 200
  }), reason("resource-exhausted"));
});

test("untrusted client cannot choose estimated tokens outside the server-only bounds", () => {
  for (const estimatedInputTokens of [-1, 0, 1.25, NaN, 20000, "100", null]) {
    assert.throws(() => reserve({ estimatedInputTokens }),
      reason("invalid-argument"));
  }
});

test("new UTC day resets counters but adapter must keep a separate replay ledger", () => {
  const old = reserve();
  const fresh = reserve({
    nowMs: Date.parse("2026-11-08T01:00:00Z"),
    requestId: "request_newday001"
  }, old);
  assert.equal(fresh.count, 1);
  assert.equal(fresh.day, "2026-11-08");
});

test("corrupt stored quota state and untrusted clock fail closed", () => {
  for (const state of [
    { day: "2026-11-07", count: -1, reservedTokens: 0, recent: [], ids: [] },
    { day: "2026-11-07", count: 0, reservedTokens: 0,
      recent: ["bad"], ids: [] },
    { day: "2026-11-07", count: 0, reservedTokens: 0, recent: [], ids: ["bad id"] }
  ]) {
    assert.throws(() => reserve({}, state), reason("invalid-quota-state"));
  }
  assert.throws(() => reserve({ nowMs: Infinity }), reason("invalid-server-time"));
  assert.throws(() => reserve({ nowMs: 9000000000000000 }), reason("invalid-server-time"));
});

test("policy has no logging, persistence, provider calls or imported user data", () => {
  const original = request();
  const copy = structuredClone(original);
  validateRequest(original, CONTEXT);
  assert.deepEqual(original, copy);
});

test("structured mode reserves more tokens atomically, without changing legacy calls", () => {
  const legacy = reserve();
  const structured = reserve({ maxOutputTokens: 1024 });
  assert.equal(legacy.reservationTokens, 300 + LIMITS.maxOutputTokens);
  assert.equal(structured.reservationTokens, 300 + 1024);
  assert.equal(structured.projectReservedTokensAfter, 300 + 1024);
  assert.throws(() => reserve({ maxOutputTokens: 2048 }), reason("invalid-argument"));
});
