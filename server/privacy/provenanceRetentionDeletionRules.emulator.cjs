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

test("real Admin SDK privacy quota concurrent boundary and durable window reset",async()=>{
 const {randomUUID}=require("node:crypto");
 const {DELETION_FLAG}=require("./provenanceRetention.cjs");
 const {createSessionDeletionRuntime,QUOTA_ROOT,LIMIT,WINDOW_MS}=require("./provenanceRetentionDeletionRuntime.cjs");
 const app=admin.initializeApp({projectId:"demo-reflect-r139"},"privacy-quota");
 const db=getFirestore(app),uid="quota-"+randomUUID(),other="quota-"+randomUUID();
 const flag=db.doc(DELETION_FLAG),ref=db.doc(QUOTA_ROOT+"/"+uid),foreign=db.doc(QUOTA_ROOT+"/"+other);
 let time=1000;
 const make=()=>createSessionDeletionRuntime({db,projectId:"reflect-ai-staging",locallyEnabled:true,clock:()=>time});
 let original;
 try{
   original=await flag.get();
   await flag.set({enabled:false});
   await assert.rejects(make().rateLimit(uid),{code:"unavailable"});
   assert.equal((await ref.get()).exists,false);
   await flag.set({enabled:true});
   await ref.set({schemaVersion:1,window:0,count:LIMIT-1});
   const outcomes=await Promise.allSettled([make().rateLimit(uid),make().rateLimit(uid)]);
   assert.equal(outcomes.filter(r=>r.status==="fulfilled"&&r.value===true).length,1);
   assert.equal(outcomes.filter(r=>r.status==="rejected"&&r.reason.code==="resource-exhausted").length,1);
   assert.deepEqual((await ref.get()).data(),{schemaVersion:1,window:0,count:LIMIT});
   assert.equal(await make().rateLimit(other),true);
   assert.deepEqual((await foreign.get()).data(),{schemaVersion:1,window:0,count:1});
   time=WINDOW_MS;
   assert.equal(await make().rateLimit(uid),true);
   assert.deepEqual((await ref.get()).data(),{schemaVersion:1,window:1,count:1});
   await flag.set({enabled:false});
   await assert.rejects(make().rateLimit(uid),{code:"unavailable"});
   assert.deepEqual((await ref.get()).data(),{schemaVersion:1,window:1,count:1});
   console.log("R139_PRIVACY_QUOTA_CONCURRENCY_PASS");
 }finally{
   try{
     const cleanup=db.batch();
     cleanup.delete(ref);cleanup.delete(foreign);
     if(original?.exists) cleanup.set(flag,original.data());else if(original) cleanup.delete(flag);
     await cleanup.commit();
   }finally{await db.terminate();await admin.deleteApp(app);}
 }
});

test("trusted deletion composition with real demo Auth and Firestore, synthetic App Check",async()=>{
 const {getAuth}=require("firebase-admin/auth");
 const {getAppCheck}=require("firebase-admin/app-check");
 const {randomUUID,createHash}=require("node:crypto");
 const {Readable}=require("node:stream");
 const {DELETION_FLAG}=require("./provenanceRetention.cjs");
 const {QUOTA_ROOT}=require("./provenanceRetentionDeletionRuntime.cjs");
 const {createTrustedSessionDeletion}=require("./provenanceRetentionDeletionAuth.cjs");
 const {PATH,ORIGIN,APP_ID}=require("./provenanceRetentionDeletionHttp.cjs");
 const app=admin.initializeApp({projectId:"demo-reflect-r139"},"trusted-deletion");
 const db=getFirestore(app),realAuth=getAuth(app);
 const client=web.initializeApp({projectId:"demo-reflect-r139",apiKey:"synthetic-only"},"trusted-deletion-web");
 const a=auth.getAuth(client);
 auth.connectAuthEmulator(a,"http://127.0.0.1:19399",{disableWarnings:true});
 const flag=db.doc(DELETION_FLAG);
 let original,uid;
 const replayRefs=[];
 try{
   assert.equal(realAuth.app.options.projectId,"demo-reflect-r139");
   assert.equal(getAppCheck(app).app.options.projectId,"demo-reflect-r139");
   assert.equal(db.projectId,"demo-reflect-r139");
   // Explicit fixture facade: all actual I/O remains bound to demo SDKs.
   // Production constructors still reject demo or mismatched project metadata.
   const projectId="reflect-ai-staging",metadata={options:{projectId}};
   const facade={projectId,doc:db.doc.bind(db),collection:db.collection.bind(db),
     batch:db.batch.bind(db),runTransaction:db.runTransaction.bind(db)};
   const authAdapter={app:metadata,verifyIdToken:realAuth.verifyIdToken.bind(realAuth),getUser:realAuth.getUser.bind(realAuth)};
   const now=Date.now();
   const syntheticAppCheck={app:metadata,async verifyToken(_token,options){
     assert.deepEqual(options,{consume:true});
     return {appId:APP_ID,alreadyConsumed:false,token:{exp:Math.floor(now/1000)+600}};
   }};
   assert.throws(()=>createTrustedSessionDeletion({db,projectId,auth:realAuth,appCheck:getAppCheck(app),
     deleteField:()=>FieldValue.delete(),locallyEnabled:true}),/unsafe-privacy-auth-environment/);
   const user=(await auth.signInAnonymously(a)).user;
   uid=user.uid;
   const idToken=await user.getIdToken();
   const session=db.doc("artifacts/reflect-8fdc8/users/"+uid+"/sessions/s1");
   const marker=db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/s1");
   const job=db.doc(JOB_ROOT+"/"+jobId(uid,"s1"));
   original=await flag.get();
   await session.set({chatHistory:[]});
   await flag.set({enabled:false});
   const listener=createTrustedSessionDeletion({db:facade,projectId,auth:authAdapter,appCheck:syntheticAppCheck,
     deleteField:()=>FieldValue.delete(),locallyEnabled:true,clock:()=>now});
   const fresh=()=>{
     const token="synthetic-app-check-"+randomUUID();
     replayRefs.push(db.doc("_reflectAiPrivate/reflect-8fdc8/appCheckReplayTokens/"+createHash("sha256").update(token).digest("hex")));
     return token;
   };
   async function invoke(token,body={confirmed:true,sessionId:"s1"},bearer=idToken){
     const req=Readable.from([JSON.stringify(body)]);
     Object.assign(req,{url:PATH,method:"POST",headers:{origin:ORIGIN,authorization:"Bearer "+bearer,
       "x-firebase-appcheck":token,"content-type":"application/json"}});
     let status,output;
     await listener(req,{writeHead(code){status=code;},end(raw){output=JSON.parse(raw);}});
     return {status,output};
   }
   assert.equal((await invoke(fresh())).status,503);
   assert.equal((await session.get()).exists,true);
   await flag.set({enabled:true});
   const token=fresh();
   assert.deepEqual(await invoke(token),{status:200,output:{status:"revoked"}});
   assert.equal((await invoke(token)).status,401);
   assert.equal((await session.get()).exists,false);
   assert.equal((await marker.get()).data().provenanceRevoked,true);
   assert.equal((await job.get()).data().status,"pending");
   assert.deepEqual(await invoke(fresh()),{status:200,output:{status:"revoked"}});
   assert.equal((await db.doc(QUOTA_ROOT+"/"+uid).get()).data().count,2);
   await realAuth.updateUser(uid,{disabled:true});
   assert.equal((await invoke(fresh())).status,401);
   console.log("R139_TRUSTED_DELETION_COMPOSITION_PASS");
 }finally{
   try{
     const batch=db.batch();
     for(const ref of replayRefs) batch.delete(ref);
     if(uid){
       batch.delete(db.doc("artifacts/reflect-8fdc8/users/"+uid+"/sessions/s1"));
       batch.delete(db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/s1"));
       batch.delete(db.doc(JOB_ROOT+"/"+jobId(uid,"s1")));
       batch.delete(db.doc(QUOTA_ROOT+"/"+uid));
     }
     if(original?.exists) batch.set(flag,original.data());else if(original) batch.delete(flag);
     await batch.commit();
     if(uid) await realAuth.deleteUser(uid);
   }finally{
     await web.deleteApp(client);await db.terminate();await admin.deleteApp(app);
   }
 }
});
