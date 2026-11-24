"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {createProvenanceRetentionScheduler,SWEEP_PATH} = require("./provenanceRetentionScheduler.cjs");
const H1 = "a".repeat(64), H2 = "b".repeat(64);
function fixture() {
  const rows = new Map();
  let sequence = Promise.resolve();
  const db = {
    doc(path) { return {path}; },
    runTransaction(fn) {
      const call = sequence.then(async () => {
        const writes = [];
        const result = await fn({
          async get(ref) { return {exists: rows.has(ref.path), data: () => structuredClone(rows.get(ref.path))}; },
          set(ref, value) { writes.push(() => rows.set(ref.path,structuredClone(value))); }
        });
        writes.forEach(write => write());
        return result;
      });
      sequence = call.catch(() => {});
      return call;
    }
  };
  return {db,rows,make: (worker, clock = () => 10000) => createProvenanceRetentionScheduler({
    db,projectId:"reflect-ai-staging",worker,clock,leaseMs:1000
  })};
}
const result = cursor => ({scanned:10,completed:0,pending:10,failed:0,nextCursor:cursor});
test("durable server cursor survives scheduler recreation and wraps after exhausted page", async () => {
  const {rows,make} = fixture();
  const seen=[];
  const worker = {runBatch: async ({after}) => {seen.push(after);return seen.length===1 ? result(H1) : {scanned:0,completed:0,pending:0,failed:0,nextCursor:null};}};
  const first=make(worker);
  assert.equal((await first.runOnce()).status,"processed");
  assert.equal(rows.get(SWEEP_PATH).cursor,H1);
  await make(worker).runOnce();
  await make(worker).runOnce();
  assert.deepEqual(seen,[null,H1,null]);
  assert.equal(rows.get(SWEEP_PATH).fence,3);
  assert.equal(rows.get(SWEEP_PATH).leaseOwner,null);
});
test("concurrent run is busy; expired takeover fences stale scheduler completion", async () => {
  const {rows,make}=fixture();
  let time=10000, release;
  let started;
  const entered = new Promise(resolve => {started=resolve;});
  const blocking = {runBatch: async () => {started();await new Promise(resolve=>{release=resolve;});return result(H1);}};
  const first=make(blocking,()=>time);
  const firstRun=first.runOnce();
  await entered;
  assert.deepEqual(await make({runBatch:async()=>result(H2)},()=>time).runOnce(),{status:"busy"});
  time+=1001;
  assert.equal((await make({runBatch:async()=>result(H2)},()=>time).runOnce()).status,"processed");
  release();
  assert.deepEqual(await firstRun,{status:"stale"});
  assert.equal(rows.get(SWEEP_PATH).cursor,H2);
  assert.equal(rows.get(SWEEP_PATH).fence,2);
  assert.equal(rows.get(SWEEP_PATH).lastBatch.ok,true);
});
test("failed worker does not advance cursor or store raw exception and can retry", async () => {
  const {rows,make}=fixture();
  const first=make({runBatch:async()=>{throw Error("private user text and token");}});
  assert.deepEqual(await first.runOnce(),{status:"failed"});
  assert.equal(rows.get(SWEEP_PATH).cursor,null);
  assert.deepEqual(rows.get(SWEEP_PATH).lastBatch,{ok:false});
  assert.ok(!JSON.stringify(rows.get(SWEEP_PATH)).includes("private user text"));
  assert.equal((await make({runBatch:async()=>result(H1)}).runOnce()).status,"processed");
  assert.equal(rows.get(SWEEP_PATH).cursor,H1);
});
test("malformed persisted sweep and malformed batch fail closed without losing queue position", async () => {
  const {rows,make}=fixture();
  rows.set(SWEEP_PATH,{schemaVersion:1,cursor:"../../invalid",fence:0,leaseOwner:null,leaseUntilMs:0});
  await assert.rejects(make({runBatch:async()=>result(H1)}).runOnce(),/invalid-scheduler-state/);
  rows.delete(SWEEP_PATH);
  const bad=make({runBatch:async()=>({...result(H1),scanned:101})});
  assert.deepEqual(await bad.runOnce(),{status:"failed"});
  assert.equal(rows.get(SWEEP_PATH).cursor,null);
});
test("unknown project and invalid duration are rejected before any scheduling", () => {
  const {db}=fixture();
  assert.throws(()=>createProvenanceRetentionScheduler({db,projectId:"production",worker:{runBatch(){}}}),/unsafe-scheduler-environment/);
  assert.throws(()=>createProvenanceRetentionScheduler({db,projectId:"reflect-ai-staging",leaseMs:1,worker:{runBatch(){}}}),/unsafe-scheduler-environment/);
});

test("scheduler persists only validated aggregate health and discards private extras",async()=>{
  const {rows,make}=fixture();
  const health={backoff:1,busy:1,attention:1,stale:0,invalidOrStorageFailure:0,raw:"private fixture"};
  const batch={scanned:3,completed:0,pending:2,failed:1,nextCursor:null,health};
  const out=await make({runBatch:async args=>{assert.equal(args.diagnostics,true);return batch;}}).runOnce();
  const expected={backoff:1,busy:1,attention:1,stale:0,invalidOrStorageFailure:0};
  assert.deepEqual(out.health,expected);
  assert.deepEqual(rows.get(SWEEP_PATH).lastBatch.health,expected);
  assert.ok(!JSON.stringify(rows.get(SWEEP_PATH)).includes("private fixture"));
  const bad={...batch,health:{...health,busy:3}};
  assert.deepEqual(await make({runBatch:async()=>bad}).runOnce(),{status:"failed"});
  assert.deepEqual(rows.get(SWEEP_PATH).lastBatch,{ok:false});
});

test("scheduler advances past malformed job identity as a technical cursor",async()=>{
  const {rows,make}=fixture();
  const seen=[];
  const worker={runBatch:async({after})=>{
    seen.push(after);
    return after===null?{scanned:10,completed:0,pending:0,failed:10,nextCursor:"!bad-9"}:
      {scanned:0,completed:0,pending:0,failed:0,nextCursor:null};
  }};
  assert.equal((await make(worker).runOnce()).status,"processed");
  assert.equal(rows.get(SWEEP_PATH).cursor,"!bad-9");
  assert.equal((await make(worker).runOnce()).status,"processed");
  assert.deepEqual(seen,[null,"!bad-9"]);
  assert.equal(rows.get(SWEEP_PATH).cursor,null);
});

test("explicit cursor repair preserves fencing and rejects active lease or stale expected fence",async()=>{
  const {rows,make}=fixture();
  let time=10000;
  const scheduler=make({runBatch:async()=>result(H1)},()=>time);
  const state={schemaVersion:1,cursor:"../invalid",fence:7,leaseOwner:"a".repeat(36),leaseUntilMs:11000};
  rows.set(SWEEP_PATH,state);
  await assert.rejects(scheduler.repairCursor({confirmed:false,expectedFence:7}),/invalid-scheduler-repair-request/);
  assert.deepEqual(await scheduler.repairCursor({confirmed:true,expectedFence:6}),{status:"conflict"});
  assert.deepEqual(await scheduler.repairCursor({confirmed:true,expectedFence:7}),{status:"busy"});
  assert.deepEqual(rows.get(SWEEP_PATH),state);
  time=11000;
  assert.deepEqual(await scheduler.repairCursor({confirmed:true,expectedFence:7}),{status:"repaired"});
  assert.deepEqual(rows.get(SWEEP_PATH),{...state,cursor:null,fence:8,leaseOwner:null,leaseUntilMs:0,lastBatch:{ok:false}});
  assert.deepEqual(await scheduler.repairCursor({confirmed:true,expectedFence:8}),{status:"unchanged"});
  assert.equal((await scheduler.runOnce()).status,"processed");
  assert.equal(rows.get(SWEEP_PATH).fence,9);
});
test("cursor repair refuses malformed fencing or lease and never creates missing state",async()=>{
  const {rows,make}=fixture();
  const scheduler=make({runBatch:async()=>result(H1)});
  assert.deepEqual(await scheduler.repairCursor({confirmed:true,expectedFence:0}),{status:"missing"});
  const base={schemaVersion:1,cursor:"../invalid",fence:0,leaseOwner:null,leaseUntilMs:0};
  for(const patch of [{fence:-1},{leaseUntilMs:1},{schemaVersion:2},{leaseOwner:"invalid"},{leaseUntilMs:-1}]){
    const state={...base,...patch};
    rows.set(SWEEP_PATH,state);
    await assert.rejects(scheduler.repairCursor({confirmed:true,expectedFence:0}),/invalid-scheduler-state/);
    assert.deepEqual(rows.get(SWEEP_PATH),state);
  }
  rows.set(SWEEP_PATH,{...base,fence:Number.MAX_SAFE_INTEGER});
  await assert.rejects(scheduler.repairCursor({confirmed:true,expectedFence:Number.MAX_SAFE_INTEGER}),/scheduler-fence-exhausted/);
});
