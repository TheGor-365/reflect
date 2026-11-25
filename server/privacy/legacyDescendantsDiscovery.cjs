"use strict";
// Read-only candidate, not a migration or proof of deletion.
// Explicit owner/session scope; no global collection-group scan.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const LIMIT=25;
const ROOT="_reflectAiPrivate/reflect-8fdc8/attemptOwners/";
function createLegacyDescendantsDiscovery({db,projectId,locallyEnabled=false}={}){
  if(typeof locallyEnabled!=="boolean")throw Error("unsafe-legacy-discovery");
  if(!locallyEnabled)return null;
  if(projectId!=="reflect-ai-staging"||db?.projectId!==projectId||
     typeof db.doc!=="function"||typeof db.collection!=="function"||
     typeof db.runTransaction!=="function")throw Error("unsafe-legacy-discovery");
  async function inspect(targets){
    if(!Array.isArray(targets)||targets.length<1||targets.length>LIMIT)
      throw Error("invalid-legacy-targets");
    const batch=[],seen=new Set();
    for(const row of targets){
      if(!row||Object.getPrototypeOf(row)!==Object.prototype||
         Object.keys(row).sort().join(",")!=="sessionId,uid")
        throw Error("invalid-legacy-targets");
      const {uid,sessionId}=row;
      if(typeof uid!=="string"||!ID.test(uid)||typeof sessionId!=="string"||!ID.test(sessionId))
        throw Error("invalid-legacy-targets");
      const key=uid+"/"+sessionId;
      if(seen.has(key))throw Error("invalid-legacy-targets");
      seen.add(key);batch.push({uid,sessionId});
    }
    try{
      return await db.runTransaction(async tx=>{
        const result={scanned:batch.length,missingWithDescendants:0,missingWithoutKnownDescendants:0,
          liveWithDescendants:0,liveWithoutKnownDescendants:0,missingPrivateParentWithDescendants:0};
        for(const {uid,sessionId} of batch){
          const root=ROOT+uid+"/sessions/"+sessionId;
          // Existence probes only: project fields out of child documents.
          const [live,parent,turns,acceptances]=await Promise.all([
            tx.get(db.doc("artifacts/reflect-8fdc8/users/"+uid+"/sessions/"+sessionId)),
            tx.get(db.doc(root)),
            tx.get(db.collection(root+"/turns").select().limit(1)),
            tx.get(db.collection(root+"/acceptances").select().limit(1))
          ]);
          const found=!turns.empty||!acceptances.empty;
          if(live.exists)result[found?"liveWithDescendants":"liveWithoutKnownDescendants"]++;
          else result[found?"missingWithDescendants":"missingWithoutKnownDescendants"]++;
          if(!parent.exists&&found)result.missingPrivateParentWithDescendants++;
        }
        return Object.freeze(result);
      },{readOnly:true});
    }catch{throw Error("legacy-discovery-unavailable");}
  }
  return Object.freeze({inspect});
}
module.exports={createLegacyDescendantsDiscovery,LIMIT};
