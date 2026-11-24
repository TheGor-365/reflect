"use strict";
// Isolated worker: no timer, public endpoint or live runtime registration.
const { JOB_ROOT, jobId, createProvenanceRetention } = require("./provenanceRetention.cjs");
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const valid = x => typeof x === "string" && ID.test(x);
const LIMIT = 10;
function createProvenanceRetentionWorker({db,projectId,deleteField}) {
  const retention = createProvenanceRetention({db,projectId,deleteField});
  function target(snapshot) {
    const row = snapshot.data();
    if (!row || row.schemaVersion !== 1 || !valid(row.uid) ||
        !valid(row.sessionId) || snapshot.id !== jobId(row.uid,row.sessionId) ||
        row.status !== "pending") throw Error("invalid-retention-job");
    return row;
  }
  async function runBatch({after = null} = {}) {
    // Cursor is trusted scheduler state, never a browser argument.
    if (after !== null && (typeof after !== "string" || !HASH.test(after))) {
      throw Error("invalid-worker-cursor");
    }
    let query = db.collection(JOB_ROOT).where("status","==","pending")
      .orderBy("__name__").limit(LIMIT);
    if (after !== null) query = query.startAfter(after);
    const page = await query.get();
    let completed=0, pending=0, failed=0;
    for (const snapshot of page.docs) {
      try {
        const {uid,sessionId} = target(snapshot);
        const turns = await retention.scrubDeletedSession({sessionId},{uid});
        const events = await retention.scrubDeletedSessionAcceptances({sessionId},{uid});
        if (!turns.done || !events.done) { pending++; continue; }
        const guard = db.doc(`_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`);
        const ref = db.doc(JOB_ROOT+"/"+snapshot.id);
        const done = await db.runTransaction(async tx => {
          const [job, marker] = await Promise.all([tx.get(ref),tx.get(guard)]);
          if (!job.exists || !marker.exists) throw Error("invalid-retention-job");
          const row=job.data(), state=marker.data();
          if (row.uid!==uid || row.sessionId!==sessionId || row.schemaVersion!==1 ||
              !["pending","complete"].includes(row.status) || state.provenanceRevoked!==true ||
              state.turnCleanup?.done!==true || state.turnCleanup?.cursor!==null ||
              state.acceptanceCleanup?.done!==true) throw Error("invalid-retention-progress");
          if (row.status==="complete") return true;
          tx.update(ref,{status:"complete"});
          return true;
        });
        if (done) completed++;
      } catch {
        // No UID, text or raw exceptions in returned diagnostics.
        // Failed jobs stay pending for a later sweep; scheduler alert/backoff
        // must be defined before activation.
        failed++;
      }
    }
    return { scanned:page.docs.length,completed,pending,failed,
      nextCursor:page.docs.length===LIMIT ? page.docs[page.docs.length-1].id : null };
  }
  return Object.freeze({runBatch});
}
module.exports = {createProvenanceRetentionWorker,LIMIT};
