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

test("session deletion activation is blocked before credentials or provider initialization",()=>{
 const saved=process.env.REFLECT_SESSION_DELETION_ENABLED;
 try{
   process.env.REFLECT_SESSION_DELETION_ENABLED="yes";
   assert.throws(()=>createRuntime(),/session deletion activation blocked pending privacy review/);
 }finally{
   if(saved===undefined) delete process.env.REFLECT_SESSION_DELETION_ENABLED;
   else process.env.REFLECT_SESSION_DELETION_ENABLED=saved;
 }
});
test("isolated privacy dispatch is exact and independent of AI routing",async()=>{
 const {createRuntimeDispatcher,createPrivacyDeletionRoute}=require("../railway/index.cjs");
 assert.equal(createPrivacyDeletionRoute({projectId:"reflect-ai-staging"}),null);
 assert.throws(()=>createPrivacyDeletionRoute({projectId:"wrong"}),/unsafe-privacy-auth-environment/);
 const calls=[];
 const dispatch=createRuntimeDispatcher({
   aiRoute:(req)=>calls.push(["ai",req.url]),
   deletionRoute:(req)=>calls.push(["privacy",req.url])
 });
 await dispatch({url:"/v1/privacy/session-deletion"},{});
 await dispatch({url:"/v1/privacy/session-deletion?extra=1"},{});
 await dispatch({url:"/v1/ai/reply"},{});
 assert.deepEqual(calls,[["privacy","/v1/privacy/session-deletion"],
   ["ai","/v1/privacy/session-deletion?extra=1"],["ai","/v1/ai/reply"]]);
 assert.throws(()=>createRuntimeDispatcher({aiRoute(){},deletionRoute:true}),/invalid runtime routes/);
});
