"use strict";
// Internal candidate: existing server revocation marker is the only accepted
// evidence. No invented historical audit source and no inference from absence.
// Must be evaluated again in the same transaction as any future queue repair.
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
const ID=/^[A-Za-z0-9_-]{1,128}$/;
async function assessLegacyRevocation({db,tx,projectId,uid,sessionId}={}){
 if(projectId!=="reflect-ai-staging"||db?.projectId!==projectId||
    typeof db.doc!=="function"||typeof tx?.get!=="function"||
    typeof uid!=="string"||!ID.test(uid)||typeof sessionId!=="string"||!ID.test(sessionId))
   throw Error("unsafe-legacy-evidence");
 try{
   const root="_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/"+sessionId;
   const [live,marker,job]=await Promise.all([
     tx.get(db.doc("artifacts/reflect-8fdc8/users/"+uid+"/sessions/"+sessionId)),
     tx.get(db.doc(root)),tx.get(db.doc(JOB_ROOT+"/"+jobId(uid,sessionId)))
   ]);
   const state=marker.exists?marker.data():null;
   const queued=job.exists?job.data():null;
   const revoked=state?.provenanceRevoked===true;
   if(live.exists)return revoked||job.exists?"conflict":"live";
   if(marker.exists&&(!state||typeof state!=="object"||
     (Object.hasOwn(state,"provenanceRevoked")&&typeof state.provenanceRevoked!=="boolean")))return "conflict";
   if(!revoked)return job.exists?"conflict":"unproven";
   if(job.exists)return queued?.schemaVersion===1&&queued.uid===uid&&queued.sessionId===sessionId&&
     ["pending","complete","attention"].includes(queued.status)?"alreadyQueued":"conflict";
   // Never reset or reinterpret previous cleanup progress automatically.
   if(Object.hasOwn(state,"turnCleanup")||Object.hasOwn(state,"acceptanceCleanup"))return "reviewProgress";
   return "eligibleExistingMarker";
 }catch{throw Error("legacy-evidence-unavailable");}
}
module.exports={assessLegacyRevocation};
