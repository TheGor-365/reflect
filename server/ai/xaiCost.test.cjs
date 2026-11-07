"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PolicyError } = require("./policy.cjs");
const {
  TICKS_PER_USD, readProviderCharge, planMoneyReservation
} = require("./xaiCost.cjs");

const denied = code => error =>
  error instanceof PolicyError &&
  error.code === code &&
  error.message === "AI request rejected by server policy.";

const NOW = Date.parse("2026-11-07T15:00:00Z");
const limits = Object.freeze({
  maxPerRequestTicks: 5_000_000,
  maxOwnerDayTicks: 10_000_000,
  maxGlobalDayTicks: 30_000_000
});
const counters = Object.freeze({
  day: "2026-11-07",
  ownerCommittedAndReservedTicks: 3_000_000,
  globalCommittedAndReservedTicks: 10_000_000
});
const plan = overrides => planMoneyReservation({
  nowMs: NOW, reserveTicks: 4_000_000, limits, counters, ...overrides
});

test("provider receipt uses exact integer USD ticks, not estimated price", () => {
  assert.equal(TICKS_PER_USD, 10_000_000_000);
  const receipt = readProviderCharge({
    input_tokens: 180, output_tokens: 12,
    cost_in_usd_ticks: 1_585_000
  });
  assert.deepEqual(receipt, {
    actualUsdTicks: 1_585_000, actualUsd: 0.0001585
  });
  assert.equal(Object.isFrozen(receipt), true);
  assert.deepEqual(readProviderCharge({ cost_in_usd_ticks: 0 }), {
    actualUsdTicks: 0, actualUsd: 0
  });
});

test("missing receipt must NOT be misreported as free", () => {
  assert.deepEqual(readProviderCharge({
    input_tokens: 20, output_tokens: 2
  }), { actualUsdTicks: null, actualUsd: null });
});

test("invalid provider cost is rejected without arbitrary payload in error", () => {
  for (const value of [-1, 1.25, NaN, Infinity, "500", null,
    9007199254740992, {}, []]) {
    assert.throws(() => readProviderCharge({
      cost_in_usd_ticks: value, providerText: "PRIVATE_NOTE"
    }), error => denied("invalid-provider-response")(error) &&
      !error.message.includes("PRIVATE_NOTE"));
  }
  for (const usage of [null, [], "raw", 4]) {
    assert.throws(() => readProviderCharge(usage),
      denied("invalid-provider-response"));
  }
});

test("owner and global reservations are computed without money float rounding", () => {
  assert.deepEqual(plan(), {
    day: "2026-11-07",
    reserveTicks: 4_000_000,
    ownerCommittedAndReservedTicksAfter: 7_000_000,
    globalCommittedAndReservedTicksAfter: 14_000_000
  });
  assert.equal(Object.isFrozen(plan()), true);
  assert.deepEqual(counters, {
    day: "2026-11-07",
    ownerCommittedAndReservedTicks: 3_000_000,
    globalCommittedAndReservedTicks: 10_000_000
  });
});

test("owner/day and global/day caps reject future reservations", () => {
  for (const state of [
    { ...counters, ownerCommittedAndReservedTicks: 7_000_000 },
    { ...counters, globalCommittedAndReservedTicks: 27_000_000 }
  ]) {
    assert.throws(() => plan({ counters: state }),
      denied("resource-exhausted"));
  }
  assert.throws(() => plan({ reserveTicks: 5_000_001 }),
    denied("resource-exhausted"));
});

test("new UTC day returns reset proposal, not a replay authorization", () => {
  const day2 = plan({
    nowMs: Date.parse("2026-11-08T00:00:01Z"),
    counters: {
      day: "2026-11-07",
      ownerCommittedAndReservedTicks: 10_000_000,
      globalCommittedAndReservedTicks: 30_000_000
    }
  });
  assert.equal(day2.day, "2026-11-08");
  assert.equal(day2.ownerCommittedAndReservedTicksAfter, 4_000_000);
  assert.equal(day2.globalCommittedAndReservedTicksAfter, 4_000_000);
});

test("bad/missing server limits and counters always fail closed", () => {
  for (const overrides of [
    { reserveTicks: 0 }, { reserveTicks: 1.1 },
    { reserveTicks: -20 }, { reserveTicks: "10000" },
    { limits: undefined }, { limits: null },
    { limits: { ...limits, maxGlobalDayTicks: 0 } },
    { limits: { ...limits, maxOwnerDayTicks: Infinity } },
    { counters: undefined },
    { counters: { ...counters, day: "wrong" } },
    { counters: { ...counters, ownerCommittedAndReservedTicks: -1 } },
    { counters: { ...counters, globalCommittedAndReservedTicks: 1.5 } },
    { nowMs: NaN }, { nowMs: -1 }
  ]) {
    assert.throws(() => plan(overrides), denied("invalid-budget-state"));
  }
});

test("a reservation is never released by this pure planner on failure", () => {
  const first = plan();
  assert.throws(() => plan({
    reserveTicks: 4_000_000,
    counters: {
      day: first.day,
      ownerCommittedAndReservedTicks:
        first.ownerCommittedAndReservedTicksAfter,
      globalCommittedAndReservedTicks:
        first.globalCommittedAndReservedTicksAfter
    }
  }), denied("resource-exhausted"));
});
