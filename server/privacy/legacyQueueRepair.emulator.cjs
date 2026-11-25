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
const {createLegacyQueueRepair}=require("./legacyQueueRepair.cjs");
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
test("real demo concurrent repair creates exactly one job and preserves blocked targets",async()=>{
 const app=initializeApp({projectId:"demo-reflect-r139"},"legacy-queue-repair");
 const db=getFirestore(app),uid="repair-"+randomUUID(),foreign="repair-"+randomUUID();
 const projectId="reflect-ai-staging";
 const marker=(id,owner=uid)=>db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+owner+"/sessions/"+id);
 const live=id=>db.doc("artifacts/reflect-8fdc8/users/"+uid+"/sessions/"+id);
 const job=(id,owner=uid)=>db.doc(JOB_ROOT+"/"+jobId(owner,id));
 const row=(id,status="pending")=>({schemaVersion:1,uid,sessionId:id,status});
 const ids=["eligible","missing","live","conflict","progress","pending","complete","attention","badjob","stale"];
 const entries=[
   [marker("eligible"),{provenanceRevoked:true}],
   [db.doc(marker("eligible").path+"/turns/t1"),{provenance:{synthetic:true},billedPossible:true}],
   [db.doc(marker("missing").path+"/turns/t1"),{synthetic:true}],
   [live("live"),{archivedAt:1}],
   [marker("conflict"),{provenanceRevoked:true}],[live("conflict"),{}],
   [marker("progress"),{provenanceRevoked:true,turnCleanup:{done:true,cursor:null}}],
   ...["pending","complete","attention"].flatMap(id=>[[marker(id),{provenanceRevoked:true}],[job(id),row(id,id)]]),
   [marker("badjob"),{provenanceRevoked:true}],[job("badjob"),{...row("badjob"),uid:foreign}],
   [marker("stale"),{provenanceRevoked:true}],
   [marker("eligible",foreign),{provenanceRevoked:true}]
 ];
 const refs=[...new Set([...entries.map(([r])=>r.path),...ids.flatMap(id=>[marker(id).path,live(id).path,job(id).path]),job("eligible",foreign).path])].map(path=>db.doc(path));
 try{
   assert.equal(db.projectId,"demo-reflect-r139");
   assert.throws(()=>createLegacyQueueRepair({db,projectId,locallyEnabled:true}),/unsafe-legacy-repair/);
   const seed=db.batch();for(const [ref,data] of entries)seed.set(ref,data);await seed.commit();
   const capture=async()=>Promise.all(refs.map(async ref=>{
     const snap=await ref.get();
     return {path:ref.path,exists:snap.exists,data:snap.data(),updateTime:snap.updateTime?.toMillis()};
   }));
   const before=await capture();
   // Test-only staging metadata; all IO stays bound to demo SDK.
   const facade={projectId,doc:db.doc.bind(db),runTransaction:db.runTransaction.bind(db)};
   const repair=createLegacyQueueRepair({db:facade,projectId,locallyEnabled:true});
   const run=sessionId=>repair.repair({uid,sessionId,confirmed:true});
   const outcomes=await Promise.all(Array.from({length:5},()=>run("eligible")));
   assert.equal(outcomes.filter(r=>r.created&&r.status==="queued").length,1);
   assert.equal(outcomes.filter(r=>!r.created&&r.status==="alreadyQueued").length,4);
   assert.deepEqual((await job("eligible").get()).data(),row("eligible"));
   assert.deepEqual(await run("eligible"),{status:"alreadyQueued",created:false});
   for(const [id,status] of [["missing","unproven"],["live","live"],["conflict","conflict"],["progress","reviewProgress"],["pending","alreadyQueued"],["complete","alreadyQueued"],["attention","alreadyQueued"],["badjob","conflict"]])
     assert.deepEqual(await run(id),{status,created:false});
   // A stale external observation is not authority: re-read live state inside repair.
   assert.equal((await live("stale").get()).exists,false);
   await live("stale").set({synthetic:true});
   assert.deepEqual(await run("stale"),{status:"conflict",created:false});
   const except=new Set([job("eligible").path,live("stale").path]);
   assert.deepEqual((await capture()).filter(r=>!except.has(r.path)),before.filter(r=>!except.has(r.path)));
   assert.equal((await job("stale").get()).exists,false);
   assert.equal((await job("eligible",foreign).get()).exists,false);
   console.log("R139_LEGACY_QUEUE_REPAIR_EMULATOR_PASS");
 }finally{
   try{const cleanup=db.batch();for(const ref of refs)cleanup.delete(ref);await cleanup.commit();}
   finally{await db.terminate();await deleteApp(app);}
 }
});
