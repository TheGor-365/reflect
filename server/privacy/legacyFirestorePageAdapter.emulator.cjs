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
const {createLegacyFirestorePageAdapter,LIMIT}=require("./legacyFirestorePageAdapter.cjs");
test("real demo REST discovers missing parents across bounded pages",async()=>{
 const app=initializeApp({projectId:"demo-reflect-r139"},"legacy-rest-page");
 const db=getFirestore(app),uid="page-"+randomUUID(),foreign="page-"+randomUUID();
 const root=(owner,id)=>"_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+owner+"/sessions/"+id;
 const ids=Array.from({length:LIMIT+3},(_,i)=>"s"+String(i).padStart(2,"0"));
 const refs=ids.map((id,i)=>db.doc(root(uid,id)+(i%2===0?"/turns/t1":"")));
 refs.push(db.doc(root(foreign,"foreign")+"/acceptances/e1"));
 const observed=[...new Set([...refs.map(ref=>ref.path),...ids.map(id=>root(uid,id))])].map(path=>db.doc(path));
 try{
   assert.equal(db.projectId,"demo-reflect-r139");
   const seed=db.batch();for(const ref of refs)seed.set(ref,{synthetic:true});await seed.commit();
   assert.equal((await db.doc(root(uid,ids[0])).get()).exists,false);
   assert.equal((await db.doc(root(uid,ids[1])).get()).exists,true);
   const capture=async()=>Promise.all(observed.map(async ref=>{
     const snap=await ref.get();
     return {exists:snap.exists,data:snap.data(),updateTime:snap.updateTime?.toMillis()};
   }));
   const before=await capture();
   const adapter=createLegacyFirestorePageAdapter({locallyEnabled:true});
   const seen=new Set(),tokens=new Set();let pageToken=null,pages=0;
   do{
     assert.ok(++pages<=10,"pagination must terminate within fixture budget");
     const page=await adapter.readPage({uid,pageToken});
     assert.ok(page.targets.length<=LIMIT);
     for(const target of page.targets){
       assert.equal(target.uid,uid);
       assert.ok(ids.includes(target.sessionId));
       assert.ok(!seen.has(target.sessionId),"duplicate across pages");
       seen.add(target.sessionId);
     }
     pageToken=page.nextPageToken;
     if(pageToken!==null){assert.ok(!tokens.has(pageToken),"continuation cycle");tokens.add(pageToken);}
   }while(pageToken!==null);
   assert.ok(pages>=2);
   assert.deepEqual([...seen].sort(),ids);
   assert.deepEqual(await adapter.readPage({uid:foreign}),{targets:[{uid:foreign,sessionId:"foreign"}],nextPageToken:null});
   assert.deepEqual(await capture(),before);
   console.log("R139_LEGACY_REST_PAGE_EMULATOR_PASS");
 }finally{
   try{const cleanup=db.batch();for(const ref of refs)cleanup.delete(ref);await cleanup.commit();}
   finally{await db.terminate();await deleteApp(app);}
 }
});
