"use strict";
// Internal read-only candidate. Explicit owner scope, no global owner scan.
// Firestore listDocuments can return missing parents, but is unbounded in
// the Node SDK. Instead accept a bounded page of document references from
// a separately reviewed acquisition adapter. No deletion evidence inferred.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const LIMIT=25;
function createLegacyTargetAcquisition({projectId,locallyEnabled=false,readPage}={}){
 if(typeof locallyEnabled!=="boolean")throw Error("unsafe-legacy-acquisition");
 if(!locallyEnabled)return null;
 if(projectId!=="reflect-ai-staging"||typeof readPage!=="function")
   throw Error("unsafe-legacy-acquisition");
 async function acquire({uid,after=null}={}){
   if(typeof uid!=="string"||!ID.test(uid)||
      (after!==null&&(typeof after!=="string"||!ID.test(after))))
     throw Error("invalid-legacy-acquisition-scope");
   const collectionPath="_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions";
   try{
     const page=await readPage(Object.freeze({collectionPath,after,limit:LIMIT}));
     if(!Array.isArray(page)||page.length>LIMIT)throw Error("invalid-page");
     const targets=[];
     let prior=after;
     for(const path of page){
       if(typeof path!=="string"||!path.startsWith(collectionPath+"/"))throw Error("invalid-path");
       const sessionId=path.slice(collectionPath.length+1);
       if(!ID.test(sessionId)||(prior!==null&&sessionId<=prior))throw Error("invalid-order");
       targets.push(Object.freeze({uid,sessionId}));
       prior=sessionId;
     }
     return Object.freeze({targets:Object.freeze(targets),nextAfter:page.length===LIMIT?prior:null});
   }catch{throw Error("legacy-acquisition-unavailable");}
 }
 return Object.freeze({acquire});
}
module.exports={createLegacyTargetAcquisition,LIMIT};
