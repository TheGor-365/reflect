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

test("privacy bootstrap defaults off and rejects unsafe configuration before credentials",()=>{
 const {bootstrapPrivacyDeletion}=require("../railway/privacyFirebaseBootstrap.cjs");
 let reads=0;
 const args={projectId:"reflect-ai-staging",appId:"1:599679789981:web:d4d8743dbff0fe40af1d74",
   origin:STAGE_ORIGIN,readCredential(){reads++;throw Error("private")},initializeClients(){throw Error("unexpected")}};
 assert.equal(bootstrapPrivacyDeletion(args),null);
 for(const bad of [{projectId:"other"},{appId:"other"},{origin:"https://other.invalid"},{locallyEnabled:"yes"}]){
   assert.throws(()=>bootstrapPrivacyDeletion({...args,locallyEnabled:true,...bad}),/unsafe-privacy-bootstrap/);
 }
 assert.equal(reads,0);
 assert.throws(()=>bootstrapPrivacyDeletion({...args,locallyEnabled:true}),/^Error: privacy-bootstrap-unavailable$/);
 assert.equal(reads,1);
});
test("privacy bootstrap validates credential project and composes signed route without AI",async()=>{
 const {bootstrapPrivacyDeletion}=require("../railway/privacyFirebaseBootstrap.cjs");
 const {createRuntimeDispatcher}=require("../railway/index.cjs");
 const projectId="reflect-ai-staging",appId="1:599679789981:web:d4d8743dbff0fe40af1d74";
 const credential={type:"service_account",project_id:projectId,client_email:"synthetic@example.invalid",private_key:"synthetic-only"};
 const app={options:{projectId}};
 let inits=0, aiCalls=0;
 const args={locallyEnabled:true,projectId,appId,origin:STAGE_ORIGIN,
   readCredential:()=>JSON.stringify(credential),initializeClients(c,p){
     inits++;assert.deepEqual(c,credential);assert.equal(p,projectId);
     return {db:{projectId,doc(){},collection(){},batch(){},runTransaction(){}},
       auth:{app,verifyIdToken(){throw Error("unexpected")},getUser(){}},
       appCheck:{app,verifyToken(){throw Error("unexpected")}},deleteField(){}};
   }};
 for(const raw of ["{",JSON.stringify({...credential,project_id:"other"}),JSON.stringify({...credential,private_key:""})]){
   assert.throws(()=>bootstrapPrivacyDeletion({...args,readCredential:()=>raw}),/privacy-bootstrap-unavailable/);
 }
 assert.equal(inits,0);
 const deletionRoute=bootstrapPrivacyDeletion(args);
 assert.equal(inits,1);
 const listener=createRuntimeDispatcher({deletionRoute,aiRoute(){aiCalls++}});
 const res={writeHead(status){this.status=status},end(raw){this.data=JSON.parse(raw)}};
 await listener({method:"POST",url:"/v1/privacy/session-deletion",headers:{origin:STAGE_ORIGIN}},res);
 assert.equal(res.status,401);
 assert.deepEqual(res.data,{error:"unauthenticated"});
 assert.equal(aiCalls,0);
});
