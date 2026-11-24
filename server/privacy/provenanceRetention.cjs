"use strict";

// C3c.2c prototype. No runtime route, scheduler or live activation.
// Caller must provide an authenticated server principal and an explicit
// Firestore FieldValue.delete() factory. Never delete accounting receipts.
const {validateSweepClaim,requireSweep}=require("./provenanceRetentionSweepFence.cjs");
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const valid = x => typeof x === "string" && ID.test(x);
const MAX_BATCH = 100;
const { createHash } = require("node:crypto");
const DELETION_FLAG = "_reflectAiPrivate/reflect-8fdc8/runtimeFlags/sessionDeletion";
const JOB_ROOT = "_reflectAiPrivate/reflect-8fdc8/retentionJobs";
const jobId = (uid, sid) => createHash("sha256").update(JSON.stringify([uid,sid])).digest("hex");

function createProvenanceRetention({ db, projectId, deleteField, workerAttempt = null, clock = Date.now, sweepClaim = null, requireDeletionFlag = false }) {
  if (projectId !== "reflect-ai-staging" || !db ||
      typeof db.doc !== "function" || typeof db.collection !== "function" ||
      typeof db.runTransaction !== "function" || typeof deleteField !== "function") {
    throw Error("unsafe-retention-environment");
  }
  // Server-only construction context. Direct isolated service calls retain
  // their existing contract; the worker always supplies its attempt owner.
  if (typeof clock !== "function" || (workerAttempt !== null &&
      (typeof workerAttempt !== "string" || !/^[0-9a-f-]{36}$/.test(workerAttempt)))) {
    throw Error("invalid-retention-attempt");
  }
  if(typeof requireDeletionFlag!=="boolean") throw Error("invalid-deletion-flag");
  const sweep=sweepClaim===null?null:validateSweepClaim(sweepClaim);
  if(sweep&&workerAttempt===null) throw Error("invalid-sweep-claim");
  async function requireAttempt(tx, uid, sessionId) {
    const checkSweep=await requireSweep(tx,db,sweep,clock);
    if (workerAttempt === null) return checkSweep;
    const snap = await tx.get(db.doc(JOB_ROOT + "/" + jobId(uid,sessionId)));
    const row = snap.exists ? snap.data() : null;
    const check = () => {
      checkSweep();
      const time = clock(), a = row?.attempt;
      if (!Number.isSafeInteger(time) || time < 0 ||
          row?.schemaVersion !== 1 || row.uid !== uid || row.sessionId !== sessionId ||
          row.status !== "pending" || a?.owner !== workerAttempt ||
          !Number.isSafeInteger(a.untilMs) || a.untilMs <= time) {
        throw Error("stale-retention-attempt");
      }
    };
    check();
    return check;
  }
  async function scrubDeletedSession(body, principal) {
    if (!body || Object.keys(body).length !== 1 ||
        !valid(principal?.uid) || !valid(body.sessionId)) {
      throw Error("invalid-retention-target");
    }
    const { sessionId } = body, uid = principal.uid;
    const session = db.doc(`artifacts/reflect-8fdc8/users/${uid}/sessions/${sessionId}`);
    const privateRoot = `_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`;
    const guard = db.doc(privateRoot);
    return db.runTransaction(async tx => {
      const checkAttempt = await requireAttempt(tx, uid, sessionId);
      const [live, marker] = await Promise.all([tx.get(session), tx.get(guard)]);
      const state = marker.exists ? marker.data() : null;
      const revoked = state?.provenanceRevoked === true;
      if (live.exists && !revoked) throw Error("session-still-exists");
      // Only the server deletion transaction may initiate a cleanup job.
      if (!revoked) throw Error("revocation-required");
      const progress = state.turnCleanup;
      if (progress !== undefined && (!progress ||
          typeof progress.done !== "boolean" ||
          (progress.done ? progress.cursor !== null : !valid(progress.cursor)))) {
        throw Error("invalid-retention-progress");
      }
      if (progress?.done) return { scrubbed: 0, done: true };
      let query = db.collection(privateRoot + "/turns").orderBy("__name__").limit(MAX_BATCH);
      if (progress) query = query.startAfter(progress.cursor);
      const page = await tx.get(query);
      checkAttempt();
      let scrubbed = 0;
      for (const snapshot of page.docs) {
        if (Object.hasOwn(snapshot.data(), "provenance")) {
          tx.update(snapshot.ref, { provenance: deleteField() });
          scrubbed++;
        }
      }
      const done = page.docs.length < MAX_BATCH;
      tx.set(guard, { turnCleanup: { done,
        cursor: done ? null : page.docs[page.docs.length - 1].id } }, { merge: true });
      return { scrubbed, done };
    });
  }
  // Acceptance events are not billing records. Delete only this exact
  // revoked session's private acceptance documents, never owner goals.
  // Deleting the first bounded page repeatedly requires no cursor.
  async function scrubDeletedSessionAcceptances(body, principal) {
    if (!body || Object.getPrototypeOf(body) !== Object.prototype ||
        Object.keys(body).length !== 1 || !valid(body.sessionId) ||
        !valid(principal?.uid)) throw Error("invalid-retention-target");
    const { sessionId } = body, uid = principal.uid;
    const root = `_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`;
    const guard = db.doc(root);
    return db.runTransaction(async tx => {
      const checkAttempt = await requireAttempt(tx, uid, sessionId);
      const marker = await tx.get(guard);
      const state = marker.exists ? marker.data() : null;
      if (state?.provenanceRevoked !== true) throw Error("revocation-required");
      if (state.acceptanceCleanup !== undefined &&
          (state.acceptanceCleanup === null ||
           typeof state.acceptanceCleanup.done !== "boolean")) {
        throw Error("invalid-retention-progress");
      }
      const page = await tx.get(db.collection(root + "/acceptances")
        .orderBy("__name__").limit(MAX_BATCH));
      checkAttempt();
      for (const snapshot of page.docs) tx.delete(snapshot.ref);
      const done = page.docs.length < MAX_BATCH;
      tx.set(guard, { acceptanceCleanup: { done } }, { merge: true });
      return { deleted: page.docs.length, done };
    });
  }
  // Prototype server deletion entry: the revocation marker and removal
  // of the session must share one transaction. No public route yet.
  async function revokeAndDeleteSession(body, principal) {
    if (!body || Object.getPrototypeOf(body) !== Object.prototype ||
        Object.keys(body).sort().join(",") !== "confirmed,sessionId" ||
        !valid(principal?.uid) || !valid(body.sessionId) || body.confirmed !== true) {
      throw Error("invalid-retention-target");
    }
    const {sessionId} = body, uid = principal.uid;
    const session = db.doc(`artifacts/reflect-8fdc8/users/${uid}/sessions/${sessionId}`);
    const guard = db.doc(`_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`);
    const job = db.doc(JOB_ROOT + "/" + jobId(uid, sessionId));
    return db.runTransaction(async tx => {
      if(requireDeletionFlag){
        const flag=await tx.get(db.doc(DELETION_FLAG));
        if(!flag.exists||flag.data()?.enabled!==true) throw Error("session-deletion-disabled");
      }
      const [live, marker, queued] = await Promise.all([tx.get(session), tx.get(guard), tx.get(job)]);
      const revoked = marker.exists && marker.data()?.provenanceRevoked === true;
      if (!live.exists && !revoked) throw Error("session-not-found");
      if (live.exists && live.data()?.archivedAt != null) throw Error("archived-session-deletion-blocked");
      if (queued.exists) {
        const prior = queued.data();
        if (!revoked || prior.uid !== uid || prior.sessionId !== sessionId ||
            prior.schemaVersion !== 1 || !["pending","complete","attention"].includes(prior.status)) {
          throw Error("invalid-retention-job");
        }
      } else {
        tx.set(job, {schemaVersion:1, uid, sessionId, status:"pending"});
      }
      if (!revoked) tx.set(guard, {provenanceRevoked:true}, {merge:true});
      if (live.exists) tx.delete(session);
      return {revoked:true};
    });
  }
  return Object.freeze({ scrubDeletedSession, scrubDeletedSessionAcceptances, revokeAndDeleteSession });
}
module.exports = { createProvenanceRetention, JOB_ROOT, jobId, DELETION_FLAG };
