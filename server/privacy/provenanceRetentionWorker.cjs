"use strict";
// Isolated worker: no timer, public endpoint or live runtime registration.
const {randomUUID} = require("node:crypto");
const { JOB_ROOT, jobId, createProvenanceRetention } = require("./provenanceRetention.cjs");
const {eligible,afterFailure,afterSuccess} = require("./provenanceRetentionRetry.cjs");
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const HASH = /^[a-f0-9]{64}$/;
const valid = x => typeof x === "string" && ID.test(x);
const LIMIT = 10;
const ATTEMPT_MS = 300000;
function createProvenanceRetentionWorker({db,projectId,deleteField,clock=Date.now}) {
  const retention = createProvenanceRetention({db,projectId,deleteField});
  if(typeof clock!=="function") throw Error("invalid-retention-clock");
  function now(){
    const t=clock();
    if(!Number.isSafeInteger(t)||t<0||t>Number.MAX_SAFE_INTEGER-ATTEMPT_MS)
      throw Error("invalid-retention-clock");
    return t;
  }
  function target(row,id) {
    if (!row || row.schemaVersion !== 1 || !valid(row.uid) ||
        !valid(row.sessionId) || id !== jobId(row.uid,row.sessionId))
      throw Error("invalid-retention-job");
    return row;
  }
  function attempt(row){
    if(!Object.hasOwn(row,"attempt")||row.attempt===null) return null;
    const a=row.attempt;
    if(!a||typeof a.owner!=="string"||!/^[0-9a-f-]{36}$/.test(a.owner)||
       !Number.isSafeInteger(a.untilMs)||a.untilMs<1) throw Error("invalid-retention-attempt");
    return a;
  }
  async function runBatch({after = null} = {}) {
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
        target(snapshot.data(),snapshot.id);
        const ref=db.doc(JOB_ROOT+"/"+snapshot.id);
        const owner=randomUUID();
        const claimed=await db.runTransaction(async tx=>{
          const snap=await tx.get(ref);
          if(!snap.exists) return null;
          const row=target(snap.data(),snapshot.id);
          const t=now();
          if(row.status!=="pending"||!eligible(row,t)) return null;
          const a=attempt(row);
          if(a&&a.untilMs>t) return null;
          tx.set(ref,{attempt:{owner,untilMs:t+ATTEMPT_MS}},{merge:true});
          return {uid:row.uid,sessionId:row.sessionId};
        });
        if(!claimed){pending++;continue;}
        const {uid,sessionId}=claimed;
        let ok=false, finished=false;
        try {
          const turns=await retention.scrubDeletedSession({sessionId},{uid});
          const events=await retention.scrubDeletedSessionAcceptances({sessionId},{uid});
          finished=turns.done&&events.done;
          ok=true;
        } catch { /* Never persist raw errors. */ }
        const outcome=await db.runTransaction(async tx=>{
          const job=await tx.get(ref);
          if(!job.exists) return "pending";
          const row=target(job.data(),snapshot.id), a=attempt(row), t=now();
          if(row.status!=="pending"||row.uid!==uid||row.sessionId!==sessionId||
             !a||a.owner!==owner||a.untilMs<=t) return "pending";
          if(ok&&finished){
            const marker=await tx.get(db.doc(`_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`));
            const state=marker.exists?marker.data():null;
            if(state?.provenanceRevoked!==true||state.turnCleanup?.done!==true||
               state.turnCleanup?.cursor!==null||state.acceptanceCleanup?.done!==true)
              throw Error("invalid-retention-progress");
          }
          const patch=ok?{status:finished?"complete":"pending",retry:afterSuccess()}:
            afterFailure(row,t);
          tx.set(ref,{...patch,attempt:null},{merge:true});
          return ok?(finished?"completed":"pending"):"failed";
        });
        if(outcome==="completed") completed++;
        else if(outcome==="failed") failed++;
        else pending++;
      } catch {
        // Malformed jobs or storage faults remain visible as aggregate failures.
        failed++;
      }
    }
    return { scanned:page.docs.length,completed,pending,failed,
      nextCursor:page.docs.length===LIMIT ? page.docs[page.docs.length-1].id : null };
  }
  return Object.freeze({runBatch});
}
module.exports = {createProvenanceRetentionWorker,LIMIT,ATTEMPT_MS};
