"use strict";

/**
 * Durable staging budget. No plaintext user content, model output or
 * credentials are written to Firestore. Authoritative writes use one
 * transaction: owner/day, global/day, kill switch, immutable request ledger.
 * An in-flight/failed call keeps its full money/token reservation.
 */
const { createHash } = require("node:crypto");
const { PolicyError, LIMITS, planQuotaReservation } = require("./policy.cjs");
const { planMoneyReservation } = require("./xaiCost.cjs");

const ROOT = "_reflectAiPrivate";
const NAMESPACE = "reflect-8fdc8";
const MAX_MESSAGE_BYTES = 2000;
// Conservative provisional limits for signed staging only, in 10^10 ticks/$.
const LIMITS_TICKS = Object.freeze({
  maxPerRequestTicks: 100_000_000, // $0.01 reserved per request
  maxOwnerDayTicks: 500_000_000,   // $0.05 reserved / owner / UTC day
  maxGlobalDayTicks: 2_000_000_000 // $0.20 reserved / staging project / UTC day
});
const STAGING_ID = /^reflect-ai-stage-[a-z0-9-]{4,30}$/;
const fail = code => { throw new PolicyError(code); };
const hash = value => createHash("sha256").update(value).digest("hex");
const int = value => Number.isSafeInteger(value) && value >= 0;

function createHostedBudget(db, projectId) {
  if (!STAGING_ID.test(projectId || "") ||
      !db || db.projectId !== projectId ||
      typeof db.runTransaction !== "function" ||
      typeof db.collection !== "function") fail("unsafe-environment");
  const root = db.collection(ROOT).doc(NAMESPACE);
  const flag = root.collection("runtimeFlags").doc("ai");
  const ledger = (uid, requestId) => root.collection("requestLedger")
    .doc(hash("request\0" + uid + "\0" + requestId));
  const dayRefs = (uid, now) => {
    const day = new Date(now).toISOString().slice(0, 10);
    return {
      day,
      owner: root.collection("ownerDays")
        .doc(hash("owner\0" + uid + "\0" + day)),
      global: root.collection("globalDays").doc(day)
    };
  };
  async function reserve({ uid, requestId, message, nowMs }) {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
        nowMs > 8640000000000000 ||
        typeof uid !== "string" || uid.length < 1 || uid.length > 128 ||
        typeof requestId !== "string" ||
        typeof message !== "string" ||
        Buffer.byteLength(message, "utf8") > MAX_MESSAGE_BYTES) {
      fail("invalid-argument");
    }
    const keys = dayRefs(uid, nowMs);
    const req = ledger(uid, requestId);
    const estimated = Math.min(LIMITS.maxInputTokens,
      Math.ceil(Buffer.byteLength(message, "utf8") / 2) + 100);
    return db.runTransaction(async tx => {
      const [flagSnap, ledgerSnap, ownerSnap, globalSnap] = await Promise.all([
        tx.get(flag), tx.get(req), tx.get(keys.owner), tx.get(keys.global)
      ]);
      if (!flagSnap.exists || flagSnap.data()?.enabled !== true) {
        fail("unavailable");
      }
      // Immutable, cross-day ledger, no TTL. Prevents double provider charge
      // for a requestId even when a response was lost or the process crashed.
      if (ledgerSnap.exists) fail("already-exists");
      const owner = ownerSnap.exists ? ownerSnap.data() : null;
      const global = globalSnap.exists ? globalSnap.data() : null;
      const globalTokens = global?.reservedTokens ?? 0;
      if (!int(globalTokens)) fail("invalid-quota-state");
      const tokens = planQuotaReservation(owner && {
        day: owner.day, count: owner.count,
        reservedTokens: owner.reservedTokens,
        recent: owner.recent, ids: []
      }, {
        nowMs, requestId, estimatedInputTokens: estimated,
        projectReservedTokens: globalTokens
      });
      const spend = planMoneyReservation({
        nowMs, reserveTicks: LIMITS_TICKS.maxPerRequestTicks,
        limits: LIMITS_TICKS,
        counters: {
          day: keys.day,
          ownerCommittedAndReservedTicks: owner?.moneyTicks ?? 0,
          globalCommittedAndReservedTicks: global?.moneyTicks ?? 0
        }
      });
      tx.set(keys.owner, {
        day: keys.day, count: tokens.count,
        reservedTokens: tokens.reservedTokens,
        recent: tokens.recent, ids: [],
        moneyTicks: spend.ownerCommittedAndReservedTicksAfter
      });
      tx.set(keys.global, {
        day: keys.day,
        reservedTokens: tokens.projectReservedTokensAfter,
        moneyTicks: spend.globalCommittedAndReservedTicksAfter
      });
      tx.create(req, {
        status: "reserved", day: keys.day,
        reservedUsdTicks: spend.reserveTicks,
        reservedTokens: tokens.reservationTokens,
        createdAt: new Date(nowMs)
      });
      return Object.freeze({ reservedUsdTicks: spend.reserveTicks });
    });
  }

  async function finish({ uid, requestId, status, nowMs, actualUsdTicks = null }) {
    if (!["completed", "failed"].includes(status) ||
        (actualUsdTicks !== null && !int(actualUsdTicks)) ||
        !Number.isSafeInteger(nowMs) || nowMs < 0) fail("invalid-argument");
    const ref = ledger(uid, requestId);
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) fail("missing-reservation");
      const state = snap.data();
      if (state.status === status) return;
      if (state.status !== "reserved") fail("already-exists");
      tx.update(ref, {
        status, actualUsdTicks,
        overReserved: actualUsdTicks !== null &&
          actualUsdTicks > state.reservedUsdTicks,
        finishedAt: new Date(nowMs)
      });
      // Unknown/failed outcome never releases the reservation. A charge
      // exceeding the provisional reserve shuts off new reservations.
      if (actualUsdTicks !== null &&
          actualUsdTicks > state.reservedUsdTicks) {
        tx.set(flag, { enabled: false, reason: "over-reservation" }, { merge: true });
      }
    });
  }
  return Object.freeze({ reserve, finish });
}

module.exports = {
  createHostedBudget, STAGING_ID, LIMITS_TICKS, MAX_MESSAGE_BYTES,
  ROOT, NAMESPACE
};
