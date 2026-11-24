"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
if (process.env.GCLOUD_PROJECT !== "demo-reflect-r139" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:19381" ||
    process.env.REFLECT_R139_EMULATOR !== "1" ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS) throw Error("unsafe emulator environment");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const {createProvenanceRetentionScheduler,SWEEP_PATH} = require("./provenanceRetentionScheduler.cjs");
const app = initializeApp({projectId:"demo-reflect-r139"});
const db = getFirestore(app);
const H1 = "a".repeat(64),H2="b".repeat(64);
const make = (worker,clock) => createProvenanceRetentionScheduler({
  db,projectId:"reflect-ai-staging",worker,clock,leaseMs:2000
});
test.after(async()=>{await db.terminate();await deleteApp(app);});
test("R139 real Admin SDK: lease takeover fences stalled scheduler and durable cursor survives restart",async()=>{
  let time=100000,enter,release;
  const entered=new Promise(resolve=>{enter=resolve;});
  const slow=make({runBatch:async()=>{enter();await new Promise(resolve=>{release=resolve;});
    return {scanned:10,completed:0,pending:10,failed:0,nextCursor:H1};}},()=>time);
  const old=slow.runOnce();
  await entered;
  assert.deepEqual(await make({runBatch:async()=>{throw Error("must not run");}},()=>time).runOnce(),{status:"busy"});
  time+=2001;
  const winner=await make({runBatch:async()=>({scanned:10,completed:0,pending:10,failed:0,nextCursor:H2})},()=>time).runOnce();
  assert.equal(winner.status,"processed");
  release();
  assert.deepEqual(await old,{status:"stale"});
  assert.equal((await db.doc(SWEEP_PATH).get()).data().cursor,H2);
  const resumed=await make({runBatch:async({after})=>{
    assert.equal(after,H2);
    return {scanned:0,completed:0,pending:0,failed:0,nextCursor:null};
  }},()=>time).runOnce();
  assert.equal(resumed.status,"processed");
  const state=(await db.doc(SWEEP_PATH).get()).data();
  assert.equal(state.cursor,null);
  assert.equal(state.fence,3);
  assert.equal(state.leaseOwner,null);
  console.log("R139_C3C3C4D3A_SCHEDULER_EMULATOR_PASS");
});

test("R139 real Admin SDK: pending queue progresses across bounded cursor pages",async()=>{
  const {randomUUID}=require("node:crypto");
  const {FieldValue}=require("firebase-admin/firestore");
  const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
  const uid="scheduler-fixture-"+randomUUID();
  const ids=[];
  const writes=db.batch();
  for(let i=0;i<11;i++){
    const sid="batch-"+String(i).padStart(2,"0");
    const id=jobId(uid,sid);
    ids.push(id);
    writes.set(db.doc(JOB_ROOT+"/"+id),{schemaVersion:1,uid,sessionId:sid,status:"pending"});
    writes.set(db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/"+sid),{provenanceRevoked:true});
  }
  await writes.commit();
  let calls=0;
  for(;calls<30;calls++){
    const output=await createProvenanceRetentionScheduler({db,projectId:"reflect-ai-staging",
      deleteField:()=>FieldValue.delete()}).runOnce();
    assert.equal(output.status,"processed");
    assert.ok(output.scanned<=10);
    const snaps=await Promise.all(ids.map(id=>db.doc(JOB_ROOT+"/"+id).get()));
    if(snaps.every(s=>s.data().status==="complete")) break;
  }
  assert.ok(calls<30);
  console.log("R139_C3C3C4D3A_QUEUE_PAGINATION_PASS");
});

test("R139 real Admin SDK: concurrent job attempts count one failure and retain backoff",async()=>{
  const {randomUUID}=require("node:crypto");
  const {FieldValue}=require("firebase-admin/firestore");
  const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
  const {createProvenanceRetentionWorker}=require("./provenanceRetentionWorker.cjs");
  const uid="retry-fixture-"+randomUUID(),sessionId="retry";
  const ref=db.doc(JOB_ROOT+"/"+jobId(uid,sessionId));
  const marker=db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/"+sessionId);
  let time=1000;
  await ref.set({schemaVersion:1,uid,sessionId,status:"pending"});
  await marker.set({provenanceRevoked:true,turnCleanup:{done:false,cursor:null}});
  const make=()=>createProvenanceRetentionWorker({db,projectId:"reflect-ai-staging",
    deleteField:()=>FieldValue.delete(),clock:()=>time});
  try{
    const results=await Promise.all([make().runBatch(),make().runBatch()]);
    assert.equal(results.reduce((n,r)=>n+r.failed,0),1);
    assert.deepEqual((await ref.get()).data().retry,{failures:1,notBeforeMs:61000});
    assert.equal((await make().runBatch()).failed,0);
    await marker.set({provenanceRevoked:true});
    time=61000;
    assert.equal((await make().runBatch()).completed,1);
    assert.equal((await ref.get()).data().status,"complete");
    assert.deepEqual((await ref.get()).data().retry,{failures:0,notBeforeMs:0});
    console.log("R139_C3C3C4D3A_RETRY_EMULATOR_PASS");
  }finally{await ref.delete();await marker.delete();}
});

test("R139 real Admin SDK: expired attempt takeover preserves data until authorized cleanup",async()=>{
  const {randomUUID}=require("node:crypto");
  const {FieldValue}=require("firebase-admin/firestore");
  const {JOB_ROOT,jobId,createProvenanceRetention}=require("./provenanceRetention.cjs");
  const {createProvenanceRetentionWorker}=require("./provenanceRetentionWorker.cjs");
  const uid="takeover-fixture-"+randomUUID(),sessionId="takeover";
  const owner=randomUUID();
  const ref=db.doc(JOB_ROOT+"/"+jobId(uid,sessionId));
  const marker=db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/"+sessionId);
  const turn=marker.collection("turns").doc("u1");
  const event=marker.collection("acceptances").doc("a1");
  let time=1000;
  const options={db,projectId:"reflect-ai-staging",deleteField:()=>FieldValue.delete(),clock:()=>time};
  const old=createProvenanceRetention({...options,workerAttempt:owner});
  const args=[{sessionId},{uid}];
  await ref.set({schemaVersion:1,uid,sessionId,status:"pending",attempt:{owner,untilMs:2000}});
  await marker.set({provenanceRevoked:true});
  await turn.set({provenance:{mac:"synthetic"},billedPossible:true});
  await event.set({status:"accepted"});
  try{
    const worker=createProvenanceRetentionWorker(options);
    const busy=await worker.runBatch();
    assert.equal(busy.completed,0);
    assert.equal((await ref.get()).data().attempt.owner,owner);
    time=2000;
    await assert.rejects(old.scrubDeletedSession(...args),/stale-retention-attempt/);
    await assert.rejects(old.scrubDeletedSessionAcceptances(...args),/stale-retention-attempt/);
    assert.ok((await turn.get()).data().provenance);
    assert.equal((await event.get()).exists,true);
    const takeover=await worker.runBatch();
    assert.equal(takeover.completed,1);
    assert.equal((await ref.get()).data().status,"complete");
    assert.equal((await ref.get()).data().attempt,null);
    assert.deepEqual((await turn.get()).data(),{billedPossible:true});
    assert.equal((await event.get()).exists,false);
    await assert.rejects(old.scrubDeletedSession(...args),/stale-retention-attempt/);
    await assert.rejects(old.scrubDeletedSessionAcceptances(...args),/stale-retention-attempt/);
    console.log("R139_C3C3C4D3A_ATTEMPT_TAKEOVER_PASS");
  }finally{
    await Promise.all([ref.delete(),turn.delete(),event.delete(),marker.delete()]);
  }
});

test("R139 real Admin SDK: malformed full page does not block valid jobs behind it",async()=>{
  const {randomUUID}=require("node:crypto");
  const {FieldValue}=require("firebase-admin/firestore");
  const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
  const uid="cursor-fixture-"+randomUUID(),sessionId="valid";
  const validRef=db.doc(JOB_ROOT+"/"+jobId(uid,sessionId));
  const marker=db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/"+sessionId);
  const bad=Array.from({length:10},(_,i)=>db.doc(JOB_ROOT+"/!malformed-"+i));
  const sweep=db.doc(SWEEP_PATH);
  const original=await sweep.get();
  const writes=db.batch();
  for(const ref of bad) writes.set(ref,{schemaVersion:1,uid,sessionId,status:"pending"});
  writes.set(validRef,{schemaVersion:1,uid,sessionId,status:"pending"});
  writes.set(marker,{provenanceRevoked:true});
  writes.set(sweep,{schemaVersion:1,cursor:null,fence:0,leaseOwner:null,leaseUntilMs:0});
  await writes.commit();
  try{
    const scheduler=createProvenanceRetentionScheduler({db,projectId:"reflect-ai-staging",deleteField:()=>FieldValue.delete()});
    const first=await scheduler.runOnce();
    assert.equal(first.status,"processed");
    assert.equal(first.scanned,10);
    assert.equal(first.failed,10);
    assert.equal(first.health.invalidOrStorageFailure,10);
    assert.equal((await sweep.get()).data().cursor,"!malformed-9");
    assert.equal((await validRef.get()).data().status,"pending");
    let done=false;
    for(let i=0;i<30;i++){
      assert.equal((await scheduler.runOnce()).status,"processed");
      if((await validRef.get()).data().status==="complete"){done=true;break;}
    }
    assert.equal(done,true);
    assert.ok((await Promise.all(bad.map(ref=>ref.get()))).every(s=>s.data().status==="pending"));
    console.log("R139_C3C3C4D3A_MALFORMED_CURSOR_PASS");
  }finally{
    const cleanup=db.batch();
    for(const ref of [...bad,validRef,marker]) cleanup.delete(ref);
    if(original.exists) cleanup.set(sweep,original.data()); else cleanup.delete(sweep);
    await cleanup.commit();
  }
});

test("R139 real Admin SDK: attention inventory is bounded and redacted",async()=>{
  const {randomUUID}=require("node:crypto");
  const {JOB_ROOT}=require("./provenanceRetention.cjs");
  const {createProvenanceRetentionInventory}=require("./provenanceRetentionInventory.cjs");
  const prefix="inventory-fixture-"+randomUUID();
  const refs=Array.from({length:101},(_,i)=>db.doc(JOB_ROOT+"/"+prefix+"-"+i));
  const inventory=createProvenanceRetentionInventory({db,projectId:"reflect-ai-staging"});
  const baseline=await inventory.readAttention();
  assert.deepEqual(baseline,{status:"ok",attentionAtLeast:0,exact:true});
  try{
    await refs[0].set({status:"attention",uid:"private-fixture"});
    assert.deepEqual(await inventory.readAttention(),{status:"ok",attentionAtLeast:1,exact:true});
    const writes=db.batch();
    for(const ref of refs.slice(1)) writes.set(ref,{status:"attention",uid:"private-fixture"});
    await writes.commit();
    assert.deepEqual(await inventory.readAttention(),{status:"ok",attentionAtLeast:100,exact:false});
    assert.equal((await refs[0].get()).data().uid,"private-fixture");
    console.log("R139_C3C3C4D3A_ATTENTION_INVENTORY_PASS");
  }finally{
    const cleanup=db.batch();
    for(const ref of refs) cleanup.delete(ref);
    await cleanup.commit();
  }
});

test("R139 real Admin SDK: scheduler takeover fences an outstanding job attempt",async()=>{
  const {randomUUID}=require("node:crypto");
  const {FieldValue}=require("firebase-admin/firestore");
  const {JOB_ROOT,jobId,createProvenanceRetention}=require("./provenanceRetention.cjs");
  const {createProvenanceRetentionWorker}=require("./provenanceRetentionWorker.cjs");
  const uid="sweep-fixture-"+randomUUID(),sessionId="sweep";
  const job=db.doc(JOB_ROOT+"/"+jobId(uid,sessionId));
  const marker=db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions/"+sessionId);
  const turn=marker.collection("turns").doc("u1"),event=marker.collection("acceptances").doc("a1");
  const sweep=db.doc(SWEEP_PATH),original=await sweep.get();
  const owner=randomUUID(),attemptOwner=randomUUID(),replacement=randomUUID();
  let time=1000;
  const options={db,projectId:"reflect-ai-staging",deleteField:()=>FieldValue.delete(),clock:()=>time};
  const oldClaim={owner,fence:1},newClaim={owner:replacement,fence:2};
  const writes=db.batch();
  writes.set(sweep,{schemaVersion:1,cursor:null,leaseOwner:owner,fence:1,leaseUntilMs:2000});
  writes.set(job,{schemaVersion:1,uid,sessionId,status:"pending",attempt:{owner:attemptOwner,untilMs:3000}});
  writes.set(marker,{provenanceRevoked:true});
  writes.set(turn,{provenance:{mac:"synthetic"},billedPossible:true});
  writes.set(event,{status:"accepted"});
  await writes.commit();
  try{
    const old=createProvenanceRetention({...options,workerAttempt:attemptOwner,sweepClaim:oldClaim});
    const args=[{sessionId},{uid}];
    time=2000;
    await assert.rejects(old.scrubDeletedSession(...args),/stale-retention-sweep/);
    await sweep.set({schemaVersion:1,cursor:null,leaseOwner:replacement,fence:2,leaseUntilMs:10000});
    await assert.rejects(old.scrubDeletedSessionAcceptances(...args),/stale-retention-sweep/);
    const worker=createProvenanceRetentionWorker(options);
    const stale=await worker.runBatch({sweepClaim:oldClaim,diagnostics:true});
    assert.ok(stale.failed>=1);
    assert.equal((await job.get()).data().attempt.owner,attemptOwner);
    assert.ok((await turn.get()).data().provenance);
    assert.equal((await event.get()).exists,true);
    const busy=await worker.runBatch({sweepClaim:newClaim,diagnostics:true});
    assert.ok(busy.health.busy>=1);
    time=3000;
    const recovered=await worker.runBatch({sweepClaim:newClaim,diagnostics:true});
    assert.ok(recovered.completed>=1);
    assert.equal((await job.get()).data().status,"complete");
    assert.deepEqual((await turn.get()).data(),{billedPossible:true});
    assert.equal((await event.get()).exists,false);
    console.log("R139_C3C3C4D3A_SWEEP_TAKEOVER_PASS");
  }finally{
    const cleanup=db.batch();
    for(const ref of [job,marker,turn,event]) cleanup.delete(ref);
    if(original.exists) cleanup.set(sweep,original.data()); else cleanup.delete(sweep);
    await cleanup.commit();
  }
});

test("R139 real Admin SDK: explicit cursor repair preserves fence and active lease",async()=>{
  const {randomUUID}=require("node:crypto");
  const sweep=db.doc(SWEEP_PATH), original=await sweep.get();
  let time=1000;
  const state={schemaVersion:1,cursor:"../invalid",fence:7,leaseOwner:randomUUID(),leaseUntilMs:2000};
  const scheduler=make({runBatch:async({after})=>{
    assert.equal(after,null);
    return {scanned:0,completed:0,pending:0,failed:0,nextCursor:null};
  }},()=>time);
  try{
    await sweep.set(state);
    await assert.rejects(scheduler.runOnce(),/invalid-scheduler-state/);
    assert.deepEqual(await scheduler.repairCursor({confirmed:true,expectedFence:6}),{status:"conflict"});
    assert.deepEqual(await scheduler.repairCursor({confirmed:true,expectedFence:7}),{status:"busy"});
    assert.deepEqual((await sweep.get()).data(),state);
    time=2000;
    const results=await Promise.all([
      scheduler.repairCursor({confirmed:true,expectedFence:7}),
      scheduler.repairCursor({confirmed:true,expectedFence:7})
    ]);
    assert.deepEqual(results.map(r=>r.status).sort(),["conflict","repaired"]);
    assert.deepEqual((await sweep.get()).data(),{...state,cursor:null,fence:8,leaseOwner:null,leaseUntilMs:0,lastBatch:{ok:false}});
    assert.equal((await scheduler.runOnce()).status,"processed");
    assert.equal((await sweep.get()).data().fence,9);
    console.log("R139_C3C3C4D3A_CURSOR_REPAIR_PASS");
  }finally{
    if(original.exists) await sweep.set(original.data()); else await sweep.delete();
  }
});
