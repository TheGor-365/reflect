"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGoalAcceptanceRuntime, LIMIT, HOUR_MS } = require("./goalAcceptanceRuntime.cjs");
const ROOT = "_reflectAiPrivate/reflect-8fdc8";
const FLAG = ROOT + "/runtimeFlags/goalAcceptance";
function fixture(locallyEnabled = true) {
  const docs = new Map();
  let now = HOUR_MS * 100, tail = Promise.resolve(), reads = 0;
  const db = { doc: path => ({ path, async get() {
    reads++; return { exists: docs.has(path), data: () => structuredClone(docs.get(path)) };
  }}), runTransaction(work) {
    const execute = async () => {
      const writes = [];
      const result = await work({ get: ref => ref.get(),
        set: (ref, data) => writes.push([ref.path, structuredClone(data)]) });
      for (const [path,data] of writes) docs.set(path,data);
      return result;
    };
    const next = tail.then(execute); tail = next.catch(() => {}); return next;
  }};
  const runtime = createGoalAcceptanceRuntime({db, projectId:"reflect-ai-staging",
    locallyEnabled, clock: () => now});
  return { docs, runtime, reads: () => reads, advance: ms => { now += ms; } };
}
const denied = (call, code) => assert.rejects(call, e => e.code === code);
test("local gate defaults off and requires explicit private flag", async () => {
  const off = fixture(false);
  off.docs.set(FLAG,{enabled:true});
  assert.equal(await off.runtime.checkEnabled(),false);
  await denied(() => off.runtime.rateLimit("alice"),"unavailable");
  assert.equal(off.reads(),0);
  const f = fixture();
  assert.equal(await f.runtime.checkEnabled(),false);
  f.docs.set(FLAG,{enabled:"true"});
  assert.equal(await f.runtime.checkEnabled(),false);
  f.docs.set(FLAG,{enabled:true});
  assert.equal(await f.runtime.checkEnabled(),true);
});
test("concurrent quota attempts admit exactly the fixed hourly limit", async () => {
  const f = fixture(); f.docs.set(FLAG,{enabled:true});
  const results = await Promise.allSettled(Array.from({length:LIMIT+2},()=>f.runtime.rateLimit("alice")));
  assert.equal(results.filter(x=>x.status==="fulfilled").length,LIMIT);
  assert.equal(results.filter(x=>x.status==="rejected" && x.reason.code==="resource-exhausted").length,2);
  assert.equal(f.docs.get(ROOT+"/goalAcceptanceQuotas/alice").count,LIMIT);
  await f.runtime.rateLimit("bob");
  assert.equal(f.docs.get(ROOT+"/goalAcceptanceQuotas/bob").count,1);
});
test("UTC window resets and clock rollback fails closed", async () => {
  const f = fixture(); f.docs.set(FLAG,{enabled:true});
  await f.runtime.rateLimit("alice"); f.advance(HOUR_MS);
  await f.runtime.rateLimit("alice");
  assert.equal(f.docs.get(ROOT+"/goalAcceptanceQuotas/alice").count,1);
  f.advance(-HOUR_MS);
  await denied(()=>f.runtime.rateLimit("alice"),"unavailable");
});
test("disabled or malformed storage and invalid UID do not consume quota", async () => {
  const f = fixture(); f.docs.set(FLAG,{enabled:true});
  assert.equal(await f.runtime.checkEnabled(),true);
  f.docs.set(FLAG,{enabled:false});
  await denied(()=>f.runtime.rateLimit("alice"),"unavailable");
  assert.equal(f.docs.has(ROOT+"/goalAcceptanceQuotas/alice"),false);
  f.docs.set(FLAG,{enabled:true});
  f.docs.set(ROOT+"/goalAcceptanceQuotas/alice",{uid:"bob",hour:100,count:1});
  await denied(()=>f.runtime.rateLimit("alice"),"unavailable");
  await denied(()=>f.runtime.rateLimit("../bob"),"invalid-argument");
  assert.equal(f.docs.get(ROOT+"/goalAcceptanceQuotas/alice").uid,"bob");
});
