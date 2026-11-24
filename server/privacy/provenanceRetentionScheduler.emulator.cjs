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
