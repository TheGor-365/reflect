"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRuntime, STAGE_ORIGIN } = require("../railway/index.cjs");

test("Railway goal acceptance activation is blocked before credential loading", () => {
  const previous = process.env.REFLECT_GOAL_ACCEPTANCE_ENABLED;
  try {
    process.env.REFLECT_GOAL_ACCEPTANCE_ENABLED = "yes";
    assert.throws(() => createRuntime(), /activation blocked pending privacy review/);
  } finally {
    if (previous === undefined) delete process.env.REFLECT_GOAL_ACCEPTANCE_ENABLED;
    else process.env.REFLECT_GOAL_ACCEPTANCE_ENABLED = previous;
  }
});

test("default-off Railway runtime has no acceptance route", async () => {
  const keys = Object.keys(process.env).filter(k => k.startsWith("REFLECT_"));
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    const listener = createRuntime();
    const req = { method:"POST",url:"/v1/ai/goal-acceptance",headers:{origin:STAGE_ORIGIN} };
    const res = { writeHead(status){this.status=status}, end(raw){this.data=JSON.parse(raw)} };
    await listener(req,res);
    assert.equal(res.status,404);
    assert.deepEqual(res.data,{error:"not-found"});
  } finally {
    for (const [k,v] of Object.entries(saved)) process.env[k]=v;
  }
});
