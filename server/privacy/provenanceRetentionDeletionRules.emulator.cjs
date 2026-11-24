"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
if(process.env.GCLOUD_PROJECT!=="demo-reflect-r139"||
 process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:19381"||
 process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:19399"||
 process.env.REFLECT_R139_EMULATOR!=="1"||process.env.GOOGLE_APPLICATION_CREDENTIALS)
 throw Error("unsafe emulator environment");
const admin=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const web=require("firebase/app"),auth=require("firebase/auth"),fs=require("firebase/firestore");
const {createProvenanceRetention,JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
test("candidate rules block direct session delete and revoked ID reuse; preserve owner operations",async()=>{
 const app=admin.initializeApp({projectId:"demo-reflect-r139"});
 const db=getFirestore(app),clients=[];
 async function client(name){
   const app=web.initializeApp({projectId:"demo-reflect-r139",apiKey:"synthetic-only"},name);
   const a=auth.getAuth(app);
   auth.connectAuthEmulator(a,"http://127.0.0.1:19399",{disableWarnings:true});
   const store=fs.getFirestore(app);
   fs.connectFirestoreEmulator(store,"127.0.0.1",19381);
   clients.push({app,store});
   return {store,uid:(await auth.signInAnonymously(a)).user.uid};
 }
 const denied=e=>e.code==="permission-denied";
 try{
   const alice=await client("deletion-alice"),bob=await client("deletion-bob");
   const root="artifacts/reflect-8fdc8/users/"+alice.uid;
   const session=fs.doc(alice.store,root,"sessions","s1");
   const goal=fs.doc(alice.store,root,"goals","g1");
   const guard=db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+alice.uid+"/sessions/s1");
   await fs.setDoc(session,{chatHistory:[]});
   await fs.setDoc(goal,{text:"synthetic",sessionId:"s1"});
   await fs.updateDoc(session,{archivedAt:fs.serverTimestamp()});
   await fs.updateDoc(session,{archivedAt:fs.deleteField()});
   await assert.rejects(fs.deleteDoc(session),denied);
   await assert.rejects(fs.runTransaction(alice.store,async tx=>{await tx.get(session);tx.delete(session);}),denied);
   await assert.rejects(fs.deleteDoc(fs.doc(bob.store,root,"sessions","s1")),denied);
   await assert.rejects(fs.getDoc(fs.doc(alice.store,guard.path)),denied);
   await assert.rejects(fs.setDoc(fs.doc(alice.store,guard.path),{provenanceRevoked:false}),denied);
   const retention=createProvenanceRetention({db,projectId:"reflect-ai-staging",deleteField:()=>FieldValue.delete()});
   assert.deepEqual(await retention.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:alice.uid}),{revoked:true});
   assert.equal((await fs.getDoc(session)).exists(),false);
   assert.equal((await guard.get()).data().provenanceRevoked,true);
   assert.equal((await db.doc(JOB_ROOT+"/"+jobId(alice.uid,"s1")).get()).data().status,"pending");
   await assert.rejects(fs.setDoc(session,{chatHistory:[]}),denied);
   assert.equal((await fs.getDoc(goal)).data().text,"synthetic");
   await fs.updateDoc(goal,{text:"edited"});
   await fs.setDoc(fs.doc(alice.store,root,"sessions","s2"),{chatHistory:[]});
   // Existing revoked legacy document must not be writable either.
   await db.doc(session.path).set({chatHistory:[]});
   await assert.rejects(fs.updateDoc(session,{title:"blocked"}),denied);
   console.log("R139_DELETION_RULES_CANDIDATE_PASS");
 }finally{
   await Promise.all(clients.map(async ({app,store})=>{await fs.terminate(store);await web.deleteApp(app);}));
   await db.terminate();await admin.deleteApp(app);
 }
});
