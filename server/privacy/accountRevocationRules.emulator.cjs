"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
if(process.env.GCLOUD_PROJECT!=="demo-reflect-r139"||
 process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:19381"||
 process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:19399"||
 process.env.REFLECT_R139_EMULATOR!=="1"||process.env.GOOGLE_APPLICATION_CREDENTIALS)
 throw Error("unsafe emulator environment");
const admin=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getAuth}=require("firebase-admin/auth");
const web=require("firebase/app"),auth=require("firebase/auth"),fs=require("firebase/firestore");
const {ROOT}=require("./accountRevocationFence.cjs");
test("account fence blocks revoked owner and preserves active owner session boundaries",async()=>{
 const app=admin.initializeApp({projectId:"demo-reflect-r139"},"ad3-rules");
 const db=getFirestore(app),clients=[],refs=[];
 async function client(name){
   const app=web.initializeApp({projectId:"demo-reflect-r139",apiKey:"synthetic-only"},name);
   const a=auth.getAuth(app),store=fs.getFirestore(app);
   auth.connectAuthEmulator(a,"http://127.0.0.1:19399",{disableWarnings:true});
   fs.connectFirestoreEmulator(store,"127.0.0.1",19381);
   const item={app,store,uid:null};clients.push(item);
   item.uid=(await auth.signInAnonymously(a)).user.uid;return item;
 }
 const denied=e=>e.code==="permission-denied";
 const root=uid=>"artifacts/reflect-8fdc8/users/"+uid;
 const track=path=>{refs.push(db.doc(path));return path;};
 try{
   assert.equal(db.projectId,"demo-reflect-r139");
   const alice=await client("ad3-alice"),bob=await client("ad3-bob");
   const paths=["","/sessions/s1","/goals/g1","/moods/m1","/diaryNotes/n1","/profiles/userProfile","/goals/g1/nested/n1"];
   for(const suffix of paths){
     const path=track(root(alice.uid)+suffix);
     await fs.setDoc(fs.doc(alice.store,path),{synthetic:true});
     assert.equal((await fs.getDocFromServer(fs.doc(alice.store,path))).exists(),true);
     await assert.rejects(fs.getDocFromServer(fs.doc(bob.store,path)),denied);
   }
   const nested=track(root(alice.uid)+"/sessions/s1/nested/n1");
   await db.doc(nested).set({synthetic:true});
   const marker=track(ROOT+"/"+alice.uid);
   await assert.rejects(fs.setDoc(fs.doc(alice.store,marker),{}),denied);
   await assert.rejects(fs.getDocFromServer(fs.doc(alice.store,marker)),denied);
   await assert.rejects(fs.deleteDoc(fs.doc(alice.store,root(alice.uid)+"/sessions/s1")),denied);
   // Even a malformed marker must close every owner access path.
   await db.doc(marker).set({revoked:false});
   for(const path of [...paths.map(s=>root(alice.uid)+s),nested]){
     const ref=fs.doc(alice.store,path);
     await assert.rejects(fs.getDocFromServer(ref),denied);
     await assert.rejects(fs.setDoc(ref,{changed:true}),denied);
     await assert.rejects(fs.deleteDoc(ref),denied);
     assert.deepEqual((await db.doc(path).get()).data(),{synthetic:true});
   }
   await assert.rejects(fs.getDocsFromServer(fs.collection(alice.store,root(alice.uid)+"/goals")),denied);
   await assert.rejects(fs.setDoc(fs.doc(alice.store,root(alice.uid)+"/sessions/new"),{}),denied);
   await assert.rejects(fs.deleteDoc(fs.doc(alice.store,marker)),denied);
   const active=track(root(bob.uid)+"/sessions/s1");
   const activeGoal=track(root(bob.uid)+"/goals/g1");
   await fs.setDoc(fs.doc(bob.store,active),{synthetic:true});
   await fs.setDoc(fs.doc(bob.store,activeGoal),{synthetic:true});
   await fs.updateDoc(fs.doc(bob.store,activeGoal),{edited:true});
   await assert.rejects(fs.deleteDoc(fs.doc(bob.store,active)),denied);
   const sessionMarker=track("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+bob.uid+"/sessions/s1");
   await db.doc(sessionMarker).set({provenanceRevoked:true});
   await assert.rejects(fs.updateDoc(fs.doc(bob.store,active),{edited:true}),denied);
   assert.equal((await fs.getDocFromServer(fs.doc(bob.store,activeGoal))).data().edited,true);
   console.log("AD3B_ACCOUNT_RULES_EMULATOR_PASS");
 }finally{
   try{const batch=db.batch();for(const ref of refs)batch.delete(ref);await batch.commit();
     for(const c of clients)if(c.uid)await getAuth(app).deleteUser(c.uid);
   }finally{
     await Promise.all(clients.map(async c=>{await fs.terminate(c.store);await web.deleteApp(c.app);}));
     await db.terminate();await admin.deleteApp(app);
   }
 }
});
