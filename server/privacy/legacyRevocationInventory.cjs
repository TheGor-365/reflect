"use strict";
// Isolated dry-run only. No discovery scan, write, migration or runtime route.
// Explicit targets must originate from a separately reviewed inventory.
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const LIMIT=25;
function createLegacyRevocationInventory({db,projectId,locallyEnabled=false}={}){
  if(typeof locallyEnabled!=="boolean")throw Error("unsafe-legacy-inventory");
  if(!locallyEnabled)return null;
  if(projectId!=="reflect-ai-staging"||db?.projectId!==projectId||
     typeof db.doc!=="function"||typeof db.runTransaction!=="function")
    throw Error("unsafe-legacy-inventory");
  async function inspect(targets){
    if(!Array.isArray(targets)||targets.length<1||targets.length>LIMIT)
      throw Error("invalid-legacy-targets");
    const seen=new Set();
    for(const row of targets){
      if(!row||Object.getPrototypeOf(row)!==Object.prototype||
         Object.keys(row).sort().join(",")!=="sessionId,uid"||
         typeof row.uid!=="string"||!ID.test(row.uid)||
         typeof row.sessionId!=="string"||!ID.test(row.sessionId))
        throw Error("invalid-legacy-targets");
      const key=jobId(row.uid,row.sessionId);
      if(seen.has(key))throw Error("invalid-legacy-targets");
      seen.add(key);
    }
    // Copy the validated identifiers before any asynchronous reads.
    const batch=targets.map(({uid,sessionId})=>({uid,sessionId}));
    const counts={live:0,missingUnproven:0,revokedWithoutJob:0,revokedWithJob:0,conflict:0};
    try{
      return await db.runTransaction(async tx=>{
        const result={...counts};
        for(const {uid,sessionId} of batch){
          const root="_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/"+sessionId;
          const [live,marker,job]=await Promise.all([
            tx.get(db.doc("artifacts/reflect-8fdc8/users/"+uid+"/sessions/"+sessionId)),
            tx.get(db.doc(root)),tx.get(db.doc(JOB_ROOT+"/"+jobId(uid,sessionId)))
          ]);
          const state=marker.exists?marker.data():null;
          const queued=job.exists?job.data():null;
          const revoked=state?.provenanceRevoked===true;
          const malformed=marker.exists&&(!state||
            (Object.hasOwn(state,"provenanceRevoked")&&typeof state.provenanceRevoked!=="boolean"));
          const validJob=queued?.schemaVersion===1&&queued.uid===uid&&queued.sessionId===sessionId&&
            ["pending","complete","attention"].includes(queued.status);
          if(malformed||(job.exists&&(!validJob||!revoked))||(live.exists&&revoked))result.conflict++;
          else if(live.exists)result.live++;
          else if(!revoked)result.missingUnproven++;
          else if(job.exists)result.revokedWithJob++;
          else result.revokedWithoutJob++;
        }
        // Aggregate only: no identifiers, document contents or deletion proof.
        return Object.freeze({scanned:batch.length,...result});
      },{readOnly:true});
    }catch{throw Error("legacy-inventory-unavailable");}
  }
  return Object.freeze({inspect});
}
module.exports={createLegacyRevocationInventory,LIMIT};
