"use strict";
// Internal candidate only. One owner, bounded in-memory scan, no writes.
// Separate component transactions are not a globally consistent snapshot.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const LIMIT=25,MAX_PAGES=10;
const INVENTORY=["live","missingUnproven","revokedWithoutJob","revokedWithJob","conflict"];
const DESCENDANTS=["missingWithDescendants","missingWithoutKnownDescendants","liveWithDescendants","liveWithoutKnownDescendants","missingPrivateParentWithDescendants"];
const zero=keys=>Object.fromEntries(keys.map(key=>[key,0]));
function validateCounts(row,keys,size,partition){
 if(!row||row.scanned!==size||Object.keys(row).length!==keys.length+1||
    !keys.every(k=>Number.isSafeInteger(row[k])&&row[k]>=0&&row[k]<=size)||
    keys.slice(0,partition).reduce((n,k)=>n+row[k],0)!==size)
   throw Error("invalid-counts");
}
function createLegacyScanCoordinator({locallyEnabled=false,projectId,readPage,inspectInventory,inspectDescendants}={}){
 if(typeof locallyEnabled!=="boolean")throw Error("unsafe-legacy-scan");
 if(!locallyEnabled)return null;
 if(projectId!=="reflect-ai-staging"||[readPage,inspectInventory,inspectDescendants].some(fn=>typeof fn!=="function"))
   throw Error("unsafe-legacy-scan");
 async function scan({uid,maxPages=MAX_PAGES}={}){
   if(typeof uid!=="string"||!ID.test(uid)||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES)
     throw Error("invalid-legacy-scan-scope");
   const ids=new Set(),tokens=new Set(),inventory=zero(INVENTORY),descendants=zero(DESCENDANTS);
   let pageToken=null,pages=0;
   try{
     do{
       const page=await readPage({uid,pageToken});pages++;
       if(!page||!Array.isArray(page.targets)||page.targets.length>LIMIT)
         throw Error("invalid-page");
       const next=page.nextPageToken;
       if(next!==null&&(typeof next!=="string"||!next||next.length>4096||tokens.has(next)))
         throw Error("invalid-token");
       const batch=[];
       for(const row of page.targets){
         if(!row||Object.getPrototypeOf(row)!==Object.prototype||
            Object.keys(row).sort().join(",")!=="sessionId,uid"||row.uid!==uid||
            typeof row.sessionId!=="string"||!ID.test(row.sessionId)||ids.has(row.sessionId))
           throw Error("invalid-target");
         ids.add(row.sessionId);batch.push(Object.freeze({uid,sessionId:row.sessionId}));
       }
       Object.freeze(batch);
       if(batch.length){
         const a=await inspectInventory(batch);
         validateCounts(a,INVENTORY,batch.length,5);
         for(const k of INVENTORY)inventory[k]+=a[k];
         const b=await inspectDescendants(batch);
         validateCounts(b,DESCENDANTS,batch.length,4);
         for(const k of DESCENDANTS)descendants[k]+=b[k];
       }
       pageToken=next;
       if(next!==null)tokens.add(next);
     }while(pageToken!==null&&pages<maxPages);
     // No raw IDs or continuation tokens in report. Budget exhaustion is
     // explicitly incomplete; never use these counts as migration authority.
     return Object.freeze({pages,scanned:ids.size,complete:pageToken===null,
       inventory:Object.freeze(inventory),descendants:Object.freeze(descendants)});
   }catch{throw Error("legacy-scan-unavailable");}
 }
 return Object.freeze({scan});
}
module.exports={createLegacyScanCoordinator,LIMIT,MAX_PAGES};
