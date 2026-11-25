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
