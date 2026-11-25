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
const {createLegacyDescendantsDiscovery}=require("./legacyDescendantsDiscovery.cjs");
test("real demo SDK discovers orphan descendants with projected queries and no writes",async()=>{
 const app=initializeApp({projectId:"demo-reflect-r139"},"legacy-descendants");
 const db=getFirestore(app),uid="discovery-"+randomUUID(),foreign="discovery-"+randomUUID();
 const projectId="reflect-ai-staging";
 const root=(id,owner=uid)=>"_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+owner+"/sessions/"+id;
 const live=id=>"artifacts/reflect-8fdc8/users/"+uid+"/sessions/"+id;
 const paths=[root("a")+"/turns/t1",root("b"),root("b")+"/acceptances/e1",
   live("c"),root("c")+"/turns/t1",live("d"),root("e",foreign)+"/turns/t1"];
 const refs=paths.map(path=>db.doc(path));
 const targets="abcde".split("").map(sessionId=>({uid,sessionId}));
 const observed=[...new Set([...paths,...targets.flatMap(({sessionId})=>[root(sessionId),live(sessionId)])])].map(path=>db.doc(path));
 try{
   assert.equal(db.projectId,"demo-reflect-r139");
   assert.throws(()=>createLegacyDescendantsDiscovery({db,projectId,locallyEnabled:true}),/unsafe-legacy-discovery/);
   const batch=db.batch();
   for(const ref of refs)batch.set(ref,{synthetic:true});
   await batch.commit();
   assert.equal((await db.doc(root("a")).get()).exists,false);
   assert.equal((await db.doc(root("c")).get()).exists,false);
   const projected=await db.collection(root("a")+"/turns").select().limit(1).get();
   assert.equal(projected.size,1);
   assert.deepEqual(projected.docs[0].data(),{});
   const capture=async()=>Promise.all(observed.map(async ref=>{
     const snap=await ref.get();
     return {exists:snap.exists,data:snap.data(),updateTime:snap.updateTime?.toMillis()};
   }));
   const before=await capture();
   // Fixture-only project facade, all operations bound to the demo SDK.
   const facade={projectId,doc:db.doc.bind(db),collection:db.collection.bind(db),
     runTransaction:db.runTransaction.bind(db)};
   const discovery=createLegacyDescendantsDiscovery({db:facade,projectId,locallyEnabled:true});
   const expected={scanned:5,missingWithDescendants:2,missingWithoutKnownDescendants:1,
     liveWithDescendants:1,liveWithoutKnownDescendants:1,missingPrivateParentWithDescendants:2};
   assert.deepEqual(await discovery.inspect(targets),expected);
   assert.deepEqual(await discovery.inspect(targets),expected);
   assert.deepEqual(await capture(),before);
   console.log("R139_LEGACY_DESCENDANTS_EMULATOR_PASS");
 }finally{
   try{const cleanup=db.batch();for(const ref of refs)cleanup.delete(ref);await cleanup.commit();}
   finally{await db.terminate();await deleteApp(app);}
 }
});
