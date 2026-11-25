"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
if(process.env.GCLOUD_PROJECT!=="demo-reflect-r139"||
 process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:19381"||
 process.env.REFLECT_R139_EMULATOR!=="1"||process.env.GOOGLE_APPLICATION_CREDENTIALS)
 throw Error("unsafe emulator environment");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
const {createLegacyQueueRepair}=require("./legacyQueueRepair.cjs");
const {createProvenanceRetentionWorker}=require("./provenanceRetentionWorker.cjs");
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
test("repaired legacy job resumes bounded cleanup and preserves accounting and unrelated data",async()=>{
 const app=initializeApp({projectId:"demo-reflect-r139"},"legacy-retention-worker");
 const db=getFirestore(app),uid="worker-"+randomUUID(),foreign="worker-"+randomUUID();
 const projectId="reflect-ai-staging",sessionId="legacy";
 const root=owner=>"_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+owner+"/sessions/"+sessionId;
 const live=owner=>"artifacts/reflect-8fdc8/users/"+owner+"/sessions/"+sessionId;
 const marker=db.doc(root(uid)),job=db.doc(JOB_ROOT+"/"+jobId(uid,sessionId));
 const turns=Array.from({length:101},(_,i)=>db.doc(root(uid)+"/turns/t"+String(i).padStart(3,"0")));
 const events=Array.from({length:101},(_,i)=>db.doc(root(uid)+"/acceptances/a"+String(i).padStart(3,"0")));
 const receipt={status:"persisted_reply",billedPossible:true,syntheticAccounting:17};
 const protectedEntries=[
   [db.doc(root(foreign)+"/turns/t000"),{...receipt,provenance:{synthetic:true}}],
   [db.doc(root(foreign)+"/acceptances/a000"),{synthetic:true}],
   [db.doc(live(foreign)),{synthetic:true}],
   [db.doc("artifacts/reflect-8fdc8/users/"+uid+"/goals/g1"),{synthetic:true}],
   [db.doc(root(uid)+"/turns-extra/t000"),{synthetic:true}]
 ];
 const refs=[marker,job,...turns,...events,...protectedEntries.map(([ref])=>ref),db.doc(live(uid))];
 try{
   assert.equal(db.projectId,"demo-reflect-r139");
   // Worker scans the whole demo queue: refuse any pre-existing jobs.
   assert.equal((await db.collection(JOB_ROOT).limit(1).get()).empty,true);
   const seed=db.batch();seed.set(marker,{provenanceRevoked:true,synthetic:true});
   for(const ref of turns)seed.set(ref,{...receipt,provenance:{synthetic:true}});
   for(const ref of events)seed.set(ref,{synthetic:true});
   for(const [ref,data] of protectedEntries)seed.set(ref,data);
   await seed.commit();
   const capture=async()=>Promise.all(protectedEntries.map(async([ref])=>{
     const snap=await ref.get();return {data:snap.data(),updateTime:snap.updateTime?.toMillis()};
   }));
   const before=await capture();
   const facade={projectId,doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:db.runTransaction.bind(db)};
   const repair=createLegacyQueueRepair({db:facade,projectId,locallyEnabled:true});
   const worker=createProvenanceRetentionWorker({db:facade,projectId,deleteField:()=>FieldValue.delete()});
   const input={uid,sessionId,confirmed:true};
   assert.deepEqual(await repair.repair(input),{status:"queued",created:true});
   const first=await worker.runBatch();
   assert.deepEqual(first,{scanned:1,completed:0,pending:1,failed:0,nextCursor:null});
   assert.equal((await job.get()).data().status,"pending");
   const progress=(await marker.get()).data();
   assert.deepEqual(progress.turnCleanup,{done:false,cursor:"t099"});
   assert.deepEqual(progress.acceptanceCleanup,{done:false});
   assert.deepEqual((await turns[0].get()).data(),receipt);
   assert.ok((await turns[100].get()).data().provenance);
   assert.equal((await events[0].get()).exists,false);
   assert.equal((await events[100].get()).exists,true);
   assert.deepEqual(await worker.runBatch(),{scanned:1,completed:1,pending:0,failed:0,nextCursor:null});
   const finished=(await job.get()).data();
   assert.equal(finished.status,"complete");assert.equal(finished.attempt,null);
   assert.deepEqual(finished.retry,{failures:0,notBeforeMs:0});
   assert.deepEqual((await marker.get()).data(),{provenanceRevoked:true,synthetic:true,turnCleanup:{done:true,cursor:null},acceptanceCleanup:{done:true}});
   for(const snap of await db.getAll(...turns))assert.deepEqual(snap.data(),receipt);
   for(const snap of await db.getAll(...events))assert.equal(snap.exists,false);
   assert.equal((await db.doc(live(uid)).get()).exists,false);
   assert.deepEqual(await capture(),before);
   assert.deepEqual(await repair.repair(input),{status:"alreadyQueued",created:false});
   assert.deepEqual(await worker.runBatch(),{scanned:0,completed:0,pending:0,failed:0,nextCursor:null});
   assert.deepEqual((await job.get()).data(),finished);
   console.log("R139_LEGACY_RETENTION_WORKER_EMULATOR_PASS");
 }finally{
   try{const cleanup=db.batch();for(const ref of refs)cleanup.delete(ref);await cleanup.commit();}
   finally{await db.terminate();await deleteApp(app);}
 }
});
