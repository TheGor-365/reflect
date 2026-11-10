"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { planPreflight } = require("./preflightRouter.cjs");

const base = Object.freeze({
  requestId: "request_123456789",
  message: "Мне сложно понять, с чего начать разговор.",
  authVerified: true, appCheckVerified: true,
  entitlementAllowed: true, moneyReservationAllowed: true,
  providerReady: true
});
const plan = patch => planPreflight({ ...base, ...patch });

test("eligible reflection has one model route with no implicit tool or history", () => {
  assert.deepEqual(plan({}), {
    action: "model_reply", reason: "eligible", paidCallAllowed: true
  });
  assert.equal(Object.isFrozen(plan({})), true);
});

test("Auth/App Check/entitlement and money gate never become optional", () => {
  for(const patch of [
    { authVerified: false }, { appCheckVerified: false },
    { entitlementAllowed: false }, { moneyReservationAllowed: false },
    { providerReady: false }
  ]) assert.equal(plan(patch).paidCallAllowed, false);
  assert.equal(plan({ moneyReservationAllowed: false }).action,
    "defer_provider_unavailable");
});

test("exact replay key is blocked even if the message changes", () => {
  const duplicate = plan({ message: "Другая формулировка",
    priorRequestIds: [base.requestId] });
  assert.deepEqual(duplicate, {
    action: "reject", reason: "duplicate-request-id", paidCallAllowed: false
  });
  assert.equal(plan({ priorRequestIds: ["invalid id"] }).reason,
    "invalid-idempotency-state");
});

test("invalid and machine-generated noise avoids expensive calls", () => {
  for (const message of ["", " ", "\u0000", "a".repeat(1401),
    "😀".repeat(501), "b".repeat(64)]) {
    const out = plan({ message });
    assert.equal(out.paidCallAllowed, false, message.slice(0, 20));
  }
  assert.equal(plan({ requestId: "../invalid" }).reason, "invalid-request");
});

test("no context and a bare acknowledgement suggests clarification without paid AI", () => {
  const out = plan({ message: "да", activeSessionHasHistory: false });
  assert.equal(out.action, "clarify_without_history");
  assert.equal(out.paidCallAllowed, false);
  assert.equal(plan({ message: "да", activeSessionHasHistory: true }).action,
    "model_reply");
});

test("uncertain feelings and nonstandard wording are not mistaken for spam", () => {
  for(const message of [
    "Мне страшно и трудно говорить о себе",
    "Я не понимаю, что со мной происходит",
    "Помоги мне разобраться",
    "Я чувствую тревогу!!!!",
    "Привет",
    "Мне кажется, что все против меня"
  ]) assert.equal(plan({ message }).paidCallAllowed, true, message);
});

test("a model call is not proposed after provider outage or unknown budget", () => {
  assert.equal(plan({ providerReady: false }).reason, "provider-unavailable");
  assert.equal(plan({ moneyReservationAllowed: false }).reason, "budget-unavailable");
  assert.equal(plan({ providerReady: false, priorRequestIds: [base.requestId] }).reason,
    "duplicate-request-id");
});
