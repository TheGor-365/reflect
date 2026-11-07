"use strict";

/**
 * Stage 04B demo-only Firestore transaction adapter.
 * Never deploy this module: it hard-fails unless the isolated Firebase
 * emulator project/port is active. Does not use real provider credentials.
 */
const { createHash } = require("node:crypto");
const { PolicyError, planQuotaReservation } = require("./policy.cjs");

const DEMO_PROJECT = "demo-reflect-stage04b";
const FIRESTORE_HOST = "127.0.0.1:19082";
const APP_NAMESPACE = "reflect-8fdc8";
const LEDGER_RETENTION_MS = 48 * 60 * 60 * 1000;
const MAX_TIME = 8640000000000000;
const validTime = t => Number.isSafeInteger(t) && t >= 0 && t <= MAX_TIME;
const fail = code => { throw new PolicyError(code); };
const hash = value => createHash("sha256").update(value).digest("hex");
const utcDay = time => new Date(time).toISOString().slice(0, 10);

function assertIsolatedDemo() {
  if (process.env.GCLOUD_PROJECT !== DEMO_PROJECT ||
      process.env.FIRESTORE_EMULATOR_HOST !== FIRESTORE_HOST ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    fail("unsafe-environment");
  }
}
function createDemoFirestoreQuota(db) {
  assertIsolatedDemo();
  if (!db || typeof db.runTransaction !== "function" ||
      typeof db.collection !== "function") fail("invalid-storage");
  const root = db.collection("_reflectStage04B").doc(APP_NAMESPACE);
  const ownerKey = uid => hash("reflect-user\0" + uid);
  const ledgerKey = (uid, requestId) =>
    hash("reflect-ledger\0" + uid + "\0" + requestId);
  const refs = (uid, requestId, nowMs) => {
    if (!validTime(nowMs) || typeof uid !== "string" ||
        uid.length < 1 || uid.length > 128 ||
        typeof requestId !== "string") fail("invalid-argument");
    return {
      user: root.collection("userBudgets").doc(ownerKey(uid)),
      project: root.collection("globalBudgets").doc(utcDay(nowMs)),
      ledger: root.collection("idempotency").doc(ledgerKey(uid, requestId))
    };
  };

  async function reserve({ uid, requestId, nowMs, estimatedInputTokens }) {
    assertIsolatedDemo();
    const { user, project, ledger } = refs(uid, requestId, nowMs);
    return db.runTransaction(async tx => {
      // Firestore reads ALL three documents before any write. A contention
      // retry repeats this pure callback; provider is never called here.
      const [ownerSnap, globalSnap, ledgerSnap] = await Promise.all([
        tx.get(user), tx.get(project), tx.get(ledger)
      ]);
      if (ledgerSnap.exists) fail("already-exists");
      const projectState = globalSnap.exists ? globalSnap.data() : null;
      const projectReservedTokens = projectState
        ? projectState.reservedTokens : 0;
      if (!Number.isSafeInteger(projectReservedTokens) ||
          projectReservedTokens < 0) fail("invalid-quota-state");
      const planned = planQuotaReservation(
        ownerSnap.exists ? ownerSnap.data() : null,
        { nowMs, requestId, estimatedInputTokens, projectReservedTokens }
      );
      // Request IDs are kept in an independently persisted SHA-256 ledger;
      // avoid putting IDs (or owner UIDs) into quota counters.
      tx.set(user, {
        day: planned.day,
        count: planned.count,
        reservedTokens: planned.reservedTokens,
        recent: planned.recent,
        ids: []
      });
      tx.set(project, {
        day: planned.day,
        reservedTokens: planned.projectReservedTokensAfter
      });
      tx.create(ledger, {
        status: "reserved",
        day: planned.day,
        reservationTokens: planned.reservationTokens,
        createdAt: new Date(nowMs),
        expiresAt: new Date(nowMs + LEDGER_RETENTION_MS)
      });
      return Object.freeze({
        reservationTokens: planned.reservationTokens,
        day: planned.day
      });
    });
  }

  async function finish({ uid, requestId, nowMs, outcome }) {
    assertIsolatedDemo();
    if (!["completed", "failed"].includes(outcome)) fail("invalid-argument");
    const { ledger } = refs(uid, requestId, nowMs);
    return db.runTransaction(async tx => {
      const snap = await tx.get(ledger);
      if (!snap.exists) fail("missing-reservation");
      const current = snap.data();
      if (current.status === outcome) return;
      if (current.status !== "reserved") fail("invalid-reservation-state");
      tx.update(ledger, { status: outcome, finishedAt: new Date(nowMs) });
    });
  }

  // Read-only diagnostics for the isolated synthetic tests only.
  const testRefs = (uid, requestId, nowMs) => refs(uid, requestId, nowMs);
  return Object.freeze({ reserve, finish, testRefs });
}

module.exports = {
  createDemoFirestoreQuota, DEMO_PROJECT, FIRESTORE_HOST,
  LEDGER_RETENTION_MS
};
