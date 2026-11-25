"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
if(process.env.GCLOUD_PROJECT!=="demo-reflect-r139"||
 process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:19381"||
 process.env.REFLECT_R139_EMULATOR!=="1"||process.env.GOOGLE_APPLICATION_CREDENTIALS)
 throw Error("unsafe emulator environment");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
const {createLegacyFirestorePageAdapter}=require("./legacyFirestorePageAdapter.cjs");
const {createLegacyRevocationInventory}=require("./legacyRevocationInventory.cjs");
const {createLegacyDescendantsDiscovery}=require("./legacyDescendantsDiscovery.cjs");
const {createLegacyScanCoordinator}=require("./legacyScanCoordinator.cjs");
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
test("composed demo scan aggregates multiple pages without mutating data",async()=>{
 const app=initializeApp({projectId:"demo-reflect-r139"},"legacy-composed-scan");
 const db=getFirestore(app),uid="scan-"+randomUUID(),foreign="scan-"+randomUUID();
 const projectId="reflect-ai-staging";
 const root=(id,owner=uid)=>"_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+owner+"/sessions/"+id;
 const live=id=>"artifacts/reflect-8fdc8/users/"+uid+"/sessions/"+id;
 const job=id=>JOB_ROOT+"/"+jobId(uid,id);
 const ids=Array.from({length:28},(_,i)=>"s"+String(i).padStart(2,"0"));
 const entries=[];
 for(const [i,id] of ids.entries()){
   switch(i%4){
     case 0: entries.push([root(id)+"/turns/t1",{synthetic:true}]);break;
     case 1: entries.push([root(id),{provenanceRevoked:true}]);break;
     case 2: entries.push([root(id),{provenanceRevoked:true}],[job(id),{schemaVersion:1,uid,sessionId:id,status:"pending"}]);break;
     case 3: entries.push([root(id),{}],[live(id),{}],[root(id)+"/acceptances/a1",{synthetic:true}]);break;
   }
 }
 entries.push([root("foreign",foreign)+"/turns/t1",{synthetic:true}]);
 const observed=[...new Set([...entries.map(([path])=>path),...ids.flatMap(id=>[root(id),live(id),job(id)])])].map(path=>db.doc(path));
 try{
   assert.equal(db.projectId,"demo-reflect-r139");
   const seed=db.batch();for(const [path,data] of entries)seed.set(db.doc(path),data);await seed.commit();
   const capture=async()=>Promise.all(observed.map(async ref=>{
     const snap=await ref.get();return {exists:snap.exists,data:snap.data(),updateTime:snap.updateTime?.toMillis()};
   }));
   const before=await capture();
   // Test-only metadata facade; all reads bound to demo SDK.
   const facade={projectId,doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:db.runTransaction.bind(db)};
   const inventory=createLegacyRevocationInventory({db:facade,projectId,locallyEnabled:true});
   const discovery=createLegacyDescendantsDiscovery({db:facade,projectId,locallyEnabled:true});
   const adapter=createLegacyFirestorePageAdapter({locallyEnabled:true});
   const scanner=createLegacyScanCoordinator({projectId,locallyEnabled:true,readPage:adapter.readPage,inspectInventory:inventory.inspect,inspectDescendants:discovery.inspect});
   const partial=await scanner.scan({uid,maxPages:1});
   assert.equal(partial.complete,false);assert.equal(partial.pages,1);assert.ok(partial.scanned<=25);
   const result=await scanner.scan({uid});
   assert.ok(result.pages>=2);assert.equal(result.complete,true);assert.equal(result.scanned,28);
   assert.deepEqual(result.inventory,{live:7,missingUnproven:7,revokedWithoutJob:7,revokedWithJob:7,conflict:0});
   assert.deepEqual(result.descendants,{missingWithDescendants:7,missingWithoutKnownDescendants:14,liveWithDescendants:7,liveWithoutKnownDescendants:0,missingPrivateParentWithDescendants:7});
   assert.deepEqual(Object.keys(result).sort(),["complete","descendants","inventory","pages","scanned"]);
   assert.deepEqual(await scanner.scan({uid}),result);
   assert.deepEqual(await capture(),before);
   console.log("R139_LEGACY_COMPOSED_SCAN_EMULATOR_PASS");
 }finally{
   try{const cleanup=db.batch();for(const [path] of entries)cleanup.delete(db.doc(path));await cleanup.commit();}
   finally{await db.terminate();await deleteApp(app);}
 }
});
