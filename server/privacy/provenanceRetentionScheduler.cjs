"use strict";
// R139 isolated scheduler primitive. No timer, route, Railway registration or live activation.
const { randomUUID } = require("node:crypto");
const { createProvenanceRetentionWorker, LIMIT } = require("./provenanceRetentionWorker.cjs");
const SWEEP_PATH = "_reflectAiPrivate/reflect-8fdc8/retentionScheduler/sweep";
const {validCursor}=require("./provenanceRetentionCursor.cjs");
const LEASE_MS = 300000;
const blank = () => ({schemaVersion:1,cursor:null,fence:0,leaseOwner:null,leaseUntilMs:0});
function checkState(state) {
  if (!state || state.schemaVersion !== 1 ||
      !validCursor(state.cursor) ||
      !Number.isSafeInteger(state.fence) || state.fence < 0 ||
      !(state.leaseOwner === null || (typeof state.leaseOwner === "string" &&
        /^[0-9a-f-]{36}$/.test(state.leaseOwner))) ||
      !Number.isSafeInteger(state.leaseUntilMs) || state.leaseUntilMs < 0 ||
      (state.leaseOwner === null && state.leaseUntilMs !== 0)) {
    throw Error("invalid-scheduler-state");
  }
  return state;
}
const HEALTH_KEYS = ["backoff","busy","attention","stale","invalidOrStorageFailure"];
function safeHealth(batch) {
  if (batch.health === undefined) return {};
  const h = batch.health;
  if (!h || !HEALTH_KEYS.every(key => Number.isSafeInteger(h[key]) && h[key]>=0) ||
      h.backoff+h.busy+h.stale>batch.pending ||
      h.attention+h.invalidOrStorageFailure>batch.failed) throw Error("invalid-scheduler-health");
  return {health:Object.fromEntries(HEALTH_KEYS.map(key=>[key,h[key]]))};
}
function checkBatch(batch) {
  if (!batch || !["scanned","completed","pending","failed"].every(
      key => Number.isSafeInteger(batch[key]) && batch[key] >= 0) ||
      batch.scanned > LIMIT ||
      batch.completed + batch.pending + batch.failed !== batch.scanned ||
      !validCursor(batch.nextCursor) ||
      (batch.scanned < LIMIT && batch.nextCursor !== null) ||
      (batch.scanned === LIMIT && batch.nextCursor === null)) {
    throw Error("invalid-scheduler-batch");
  }
  safeHealth(batch);
}
function createProvenanceRetentionScheduler({db,projectId,deleteField,clock = Date.now,
  worker = null,leaseMs = LEASE_MS}) {
  if (projectId !== "reflect-ai-staging" || !db || typeof db.doc !== "function" ||
      typeof db.runTransaction !== "function" || typeof clock !== "function" ||
      !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 900000 ||
      (worker && typeof worker.runBatch !== "function")) {
    throw Error("unsafe-scheduler-environment");
  }
  const jobWorker = worker || createProvenanceRetentionWorker({db,projectId,deleteField,clock});
  const ref = db.doc(SWEEP_PATH);
  function now() {
    const value = clock();
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - leaseMs) {
      throw Error("invalid-scheduler-clock");
    }
    return value;
  }
  async function runOnce() {
    // Instance identity never comes from a browser, job, or environment variable.
    const owner = randomUUID();
    const claim = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const state = checkState(snapshot.exists ? snapshot.data() : blank());
      const time = now();
      if (state.leaseOwner !== null && state.leaseUntilMs > time) return null;
      if (state.fence === Number.MAX_SAFE_INTEGER) throw Error("scheduler-fence-exhausted");
      const fence = state.fence + 1;
      tx.set(ref,{...state,fence,leaseOwner:owner,leaseUntilMs:time + leaseMs});
      return {fence,after:state.cursor};
    });
    if (!claim) return {status:"busy"};
    let batch = null;
    try {
      batch = await jobWorker.runBatch({after:claim.after,diagnostics:true});
      checkBatch(batch);
    } catch {
      // Raw provider/SDK error messages must not enter durable state or diagnostics.
      batch = null;
    }
    const finished = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const state = checkState(snapshot.exists ? snapshot.data() : null);
      const time = now();
      if (state.fence !== claim.fence || state.leaseOwner !== owner ||
          state.leaseUntilMs <= time) return false;
      tx.set(ref,{...state,cursor:batch ? batch.nextCursor : state.cursor,
        leaseOwner:null,leaseUntilMs:0,
        lastBatch:batch ? {ok:true,scanned:batch.scanned,completed:batch.completed,
          pending:batch.pending,failed:batch.failed,...safeHealth(batch)} : {ok:false}});
      return true;
    });
    if (!finished) return {status:"stale"};
    if (!batch) return {status:"failed"};
    return {status:"processed",scanned:batch.scanned,completed:batch.completed,
      pending:batch.pending,failed:batch.failed,...safeHealth(batch)};
  }
  return Object.freeze({runOnce});
}
module.exports = {createProvenanceRetentionScheduler,SWEEP_PATH,LEASE_MS};
