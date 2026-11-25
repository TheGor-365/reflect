"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPrivacyDispatcherCandidate } = require("./privacyDispatcherCandidate.cjs");
const { APP_ID, ORIGIN } = require("../privacy/provenanceRetentionDeletionHttp.cjs");
const projectId = "reflect-ai-staging";
const credential = {type:"service_account",project_id:projectId,client_email:"synthetic@example.invalid",private_key:"synthetic-only"};
const config = () => ({
  locallyEnabled:true, projectId, appId:APP_ID, origin:ORIGIN,
  readCredential:async()=>JSON.stringify(credential),
  aiRoute:()=>{throw Error("unexpected-ai-route");}
});

test("default off never reads credentials or initializes clients",async()=>{
  const never=()=>{throw Error("unexpected");};
  assert.equal(await createPrivacyDispatcherCandidate({readCredential:never,initializeClients:never}),null);
});

test("rejects unsafe metadata before credential or SDK access",async()=>{
  for(const override of [{projectId:"foreign"},{appId:"foreign"},{origin:"https://example.invalid"},{locallyEnabled:"yes"}]){
    let calls=0;
    await assert.rejects(createPrivacyDispatcherCandidate({...config(),...override,readCredential:()=>{calls++;},initializeClients:()=>{calls++;}}),/privacy-dispatcher-unavailable/);
    assert.equal(calls,0);
  }
});

test("rejects malformed credential before SDK initialization",async()=>{
  let calls=0;
  await assert.rejects(createPrivacyDispatcherCandidate({...config(),readCredential:async()=>"{",initializeClients:()=>{calls++;}}),/privacy-dispatcher-unavailable/);
  assert.equal(calls,0);
});

test("awaits initialization, fails closed and disposes on foreign project",async()=>{
  let disposed=0,initialized=0;
  await assert.rejects(createPrivacyDispatcherCandidate({...config(),initializeClients:async(args)=>{
    assert.deepEqual(args,{locallyEnabled:true,projectId,credential});
    initialized++;
    return {db:{projectId:"foreign"},dispose:async()=>{disposed++;}};
  }}),/privacy-dispatcher-unavailable/);
  assert.equal(initialized,1);
  assert.equal(disposed,1);
});

test("unavailable Firestore metadata fails closed and cleans up",async()=>{
  let disposed=0;
  await assert.rejects(createPrivacyDispatcherCandidate({...config(),initializeClients:async()=>({
    db:{get projectId(){throw Error("synthetic sensitive detail");}},
    dispose:async()=>{disposed++;}
  })}),{message:"privacy-dispatcher-unavailable"});
  assert.equal(disposed,1);
});

test("redacts initialization and cleanup failures",async()=>{
  await assert.rejects(createPrivacyDispatcherCandidate({...config(),initializeClients:async()=>{throw Error("synthetic secret");}}),{message:"privacy-dispatcher-unavailable"});
  await assert.rejects(createPrivacyDispatcherCandidate({...config(),initializeClients:async()=>({db:{projectId:"foreign"},dispose:async()=>{throw Error("synthetic cleanup secret");}})}),{message:"privacy-dispatcher-unavailable"});
});

function response() {
  return {status:null,body:null,writeHead(status){this.status=status;},end(body){this.body=body;}};
}
function syntheticClients(dispose=async()=>{}) {
  const unexpected=()=>{throw Error("unexpected external IO");};
  const app={options:{projectId}};
  return {
    db:{projectId,doc:unexpected,collection:unexpected,batch:unexpected,runTransaction:unexpected},
    auth:{app,verifyIdToken:unexpected,getUser:unexpected},
    appCheck:{app,verifyToken:unexpected},deleteField:unexpected,dispose
  };
}

test("composes trusted route, preflight and unauthenticated rejection without AI or SDK IO",async()=>{
  let aiCalls=0,disposals=0;
  const runtime=await createPrivacyDispatcherCandidate({...config(),
    initializeClients:async()=>syntheticClients(async()=>{disposals++;}),
    aiRoute:(_req,res)=>{aiCalls++;res.writeHead(404);res.end("fallback");}
  });
  try {
    const path="/v1/privacy/session-deletion";
    for(const [method,origin,status] of [["OPTIONS",ORIGIN,204],["POST",ORIGIN,401],["POST","https://example.invalid",403],["GET",ORIGIN,404]]){
      const res=response();
      await runtime.dispatch({method,url:path,headers:{origin}},res);
      assert.equal(res.status,status);
    }
    assert.equal(aiCalls,0);
    for(const url of [path+"?x=1",path+"/","/v1/ai/reply"]){
      const res=response();
      await runtime.dispatch({method:"POST",url,headers:{origin:ORIGIN}},res);
      assert.equal(res.status,404);
      assert.equal(res.body,"fallback");
    }
    assert.equal(aiCalls,3);
  } finally {await runtime.dispose();}
  await runtime.dispose();
  assert.equal(disposals,1);
  const res=response();
  await runtime.dispatch({method:"OPTIONS",url:"/v1/privacy/session-deletion",headers:{origin:ORIGIN}},res);
  assert.equal(res.status,503);
  assert.equal(aiCalls,3);
});

test("successful composition disposal failure stays redacted and permanently closed",async()=>{
  let attempts=0;
  const runtime=await createPrivacyDispatcherCandidate({...config(),
    initializeClients:async()=>syntheticClients(async()=>{attempts++;throw Error("synthetic secret");})
  });
  await assert.rejects(runtime.dispose(),{message:"privacy-dispatcher-unavailable"});
  await runtime.dispose();
  assert.equal(attempts,1);
  const res=response();
  await runtime.dispatch({method:"POST",url:"/v1/privacy/session-deletion",headers:{origin:ORIGIN}},res);
  assert.equal(res.status,503);
  assert.deepEqual(JSON.parse(res.body),{error:"unavailable"});
});
