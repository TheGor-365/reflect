"use strict";

/**
 * Stage04F: pure xAI billing primitives, no persistence and no provider calls.
 * The xAI billing documentation reports exact per-response charges as
 * usage.cost_in_usd_ticks, where USD 1 == 10^10 ticks.
 *
 * Neither a calculated token estimate nor a pure reservation proposal is a
 * HARD spending cap: that requires a durable, atomic server transaction and
 * independent provider-side controls. A failed/ambiguous provider request
 * must retain the reservation until reconciliation; never auto-retry.
 */
const { PolicyError } = require("./policy.cjs");

const TICKS_PER_USD = 10_000_000_000;
const fail = code => { throw new PolicyError(code); };
const nonnegativeTicks = x => Number.isSafeInteger(x) && x >= 0;
const positiveTicks = x => Number.isSafeInteger(x) && x > 0;
const plain = x => x !== null && typeof x === "object" &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const utcDay = x => new Date(x).toISOString().slice(0, 10);

/**
 * Never treat a missing receipt as a $0 charge. The response might have
 * succeeded (and billed) even if the vendor or version omits cost metadata.
 * Callers must preserve the budget reservation and reconcile via Usage.
 */
function readProviderCharge(usage) {
  if (!plain(usage)) fail("invalid-provider-response");
  if (!Object.prototype.hasOwnProperty.call(usage, "cost_in_usd_ticks")) {
    return Object.freeze({ actualUsdTicks: null, actualUsd: null });
  }
  const ticks = usage.cost_in_usd_ticks;
  if (!nonnegativeTicks(ticks)) fail("invalid-provider-response");
  return Object.freeze({
    actualUsdTicks: ticks,
    actualUsd: ticks / TICKS_PER_USD
  });
}

/**
 * Pure plan to run WITHIN ONE ATOMIC datastore transaction that reads
 * owner+global budget and a durable request-ID ledger before committing.
 * This function alone grants NO permission to spend.
 *
 * The server, never browser input, chooses limits and reserveTicks.
 * Storage must retain spend + pending reservations and be keyed by the
 * trusted server-side UTC day. All failed/unknown calls retain their reserve.
 */
function planMoneyReservation({
  nowMs, reserveTicks, limits, counters
}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      nowMs > 8640000000000000 || !positiveTicks(reserveTicks) ||
      !plain(limits) ||
      !positiveTicks(limits.maxPerRequestTicks) ||
      !positiveTicks(limits.maxOwnerDayTicks) ||
      !positiveTicks(limits.maxGlobalDayTicks) ||
      !plain(counters) || typeof counters.day !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(counters.day) ||
      !nonnegativeTicks(counters.ownerCommittedAndReservedTicks) ||
      !nonnegativeTicks(counters.globalCommittedAndReservedTicks)) {
    fail("invalid-budget-state");
  }
  const day = utcDay(nowMs);
  // A trusted transactional ledger must stop rollover/replay separately.
  const sameDay = counters.day === day;
  const owner = sameDay ? counters.ownerCommittedAndReservedTicks : 0;
  const global = sameDay ? counters.globalCommittedAndReservedTicks : 0;
  if (reserveTicks > limits.maxPerRequestTicks ||
      owner > limits.maxOwnerDayTicks - reserveTicks ||
      global > limits.maxGlobalDayTicks - reserveTicks) {
    fail("resource-exhausted");
  }
  return Object.freeze({
    day, reserveTicks,
    ownerCommittedAndReservedTicksAfter: owner + reserveTicks,
    globalCommittedAndReservedTicksAfter: global + reserveTicks
  });
}

module.exports = {
  TICKS_PER_USD, readProviderCharge, planMoneyReservation
};
