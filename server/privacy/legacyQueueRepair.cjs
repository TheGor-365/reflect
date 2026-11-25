"use strict";
// Internal candidate only. No runtime registration or automatic migration.
// Existing trusted marker required; never creates markers or deletes sessions.
const {assessLegacyRevocation}=require("./legacyRevocationEvidence.cjs");
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
const ID=/^[A-Za-z0-9_-]{1,128}$/;
function createLegacyQueueRepair({db,projectId,locallyEnabled=false}={}){
 if(typeof locallyEnabled!=="boolean")throw Error("unsafe-legacy-repair");
 if(!locallyEnabled)return null;
 if(projectId!=="reflect-ai-staging"||db?.projectId!==projectId||
    typeof db.doc!=="function"||typeof db.runTransaction!=="function")
   throw Error("unsafe-legacy-repair");
 async function repair({uid,sessionId,confirmed=false}={}){
   if(confirmed!==true||typeof uid!=="string"||!ID.test(uid)||
      typeof sessionId!=="string"||!ID.test(sessionId))
     throw Error("invalid-legacy-repair-target");
   try{
     return await db.runTransaction(async tx=>{
       const status=await assessLegacyRevocation({db,tx,projectId,uid,sessionId});
       if(status!=="eligibleExistingMarker")return Object.freeze({status,created:false});
       // Create-only precondition and transaction read protect against races.
       tx.create(db.doc(JOB_ROOT+"/"+jobId(uid,sessionId)),{
         schemaVersion:1,uid,sessionId,status:"pending"
       });
       return Object.freeze({status:"queued",created:true});
     });
   }catch{throw Error("legacy-repair-unavailable");}
 }
 return Object.freeze({repair});
}
module.exports={createLegacyQueueRepair};
