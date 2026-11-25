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
const {createLegacyRevocationInventory}=require("./legacyRevocationInventory.cjs");
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
test("real demo read-only transaction classifies targets without mutation",async()=>{
 const app=initializeApp({projectId:"demo-reflect-r139"},"legacy-inventory");
 const db=getFirestore(app),uid="inventory-"+randomUUID();
 const projectId="reflect-ai-staging";
 const targets="abcdef".split("").map(sessionId=>({uid,sessionId}));
 const live=id=>db.doc("artifacts/reflect-8fdc8/users/"+uid+"/sessions/"+id);
 const marker=id=>db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/"+id);
 const job=id=>db.doc(JOB_ROOT+"/"+jobId(uid,id));
 const refs=targets.flatMap(({sessionId:id})=>[live(id),marker(id),job(id)]);
 try{
   assert.equal(db.projectId,"demo-reflect-r139");
   assert.throws(()=>createLegacyRevocationInventory({db,projectId,locallyEnabled:true}),/unsafe-legacy-inventory/);
   const seed=db.batch();
   seed.set(live("a"),{archivedAt:1});
   seed.set(marker("c"),{provenanceRevoked:true});
   seed.set(marker("d"),{provenanceRevoked:true});
   seed.set(job("d"),{schemaVersion:1,uid,sessionId:"d",status:"pending"});
   seed.set(live("e"),{chatHistory:[]});
   seed.set(marker("e"),{provenanceRevoked:true});
   seed.set(marker("f"),{provenanceRevoked:"invalid"});
   await seed.commit();
   const capture=async()=>Promise.all(refs.map(async ref=>{
     const snap=await ref.get();
     return {exists:snap.exists,data:snap.data(),updateTime:snap.updateTime?.toMillis()};
   }));
   const before=await capture();
   // Test-only metadata facade; all reads remain bound to demo SDK.
   const facade={projectId,doc:db.doc.bind(db),runTransaction:db.runTransaction.bind(db)};
   const inventory=createLegacyRevocationInventory({db:facade,projectId,locallyEnabled:true});
   const expected={scanned:6,live:1,missingUnproven:1,revokedWithoutJob:1,revokedWithJob:1,conflict:2};
   assert.deepEqual(await inventory.inspect(targets),expected);
   assert.deepEqual(await inventory.inspect(targets),expected);
   assert.deepEqual(await capture(),before);
   console.log("R139_LEGACY_INVENTORY_EMULATOR_PASS");
 }finally{
   try{const batch=db.batch();for(const ref of refs)batch.delete(ref);await batch.commit();}
   finally{await db.terminate();await deleteApp(app);}
 }
});
