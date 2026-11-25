"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createAccountDeletionAuthorization,createTrustedAccountDeletionAuthorization}=require("./accountDeletionAuthorization.cjs");
const {APP_ID}=require("./provenanceRetentionDeletionHttp.cjs");
const projectId="reflect-ai-staging",now=1700000000000;
const principal={uid:"alice",auth_time:now/1000,firebase:{sign_in_provider:"password"}};
const input={body:{confirmed:true},idToken:"i".repeat(30),appCheckToken:"a".repeat(30)};
const app={appId:APP_ID,alreadyConsumed:false};
const make=(extra={})=>createAccountDeletionAuthorization({projectId,locallyEnabled:true,clock:()=>now,verifyAuth:async()=>principal,verifyAppCheck:async()=>app,authorizeAccount:async()=>true,...extra});
test("default off and foreign project rejected",()=>{
 assert.equal(createAccountDeletionAuthorization(),null);
 assert.equal(createTrustedAccountDeletionAuthorization(),null);
 assert.throws(()=>make({projectId:"foreign"}),/unsafe-account-deletion-auth/);
});
test("only verified UID returned, independent of AI entitlement",async()=>{
 const gate=make({authorizeAccount:async p=>{assert.deepEqual(p,{uid:"alice"});return true;}});
 assert.deepEqual(await gate.authorize(input),{uid:"alice"});
});
test("caller-selected UID and absent confirmation rejected before verification",async()=>{
 let calls=0;const gate=make({verifyAuth:async()=>{calls++;return principal;}});
 for(const body of [{confirmed:true,uid:"bob"},{confirmed:false},{}])
  await assert.rejects(gate.authorize({...input,body}),/invalid-account-deletion-request/);
 assert.equal(calls,0);
});
test("stale future or missing auth_time and anonymous identity fail closed",async()=>{
 for(const [claims,error] of [
  [{...principal,auth_time:now/1000-301},"account-deletion-reauthentication-required"],
  [{...principal,auth_time:now/1000+1},"account-deletion-reauthentication-required"],
  [{...principal,auth_time:undefined},"account-deletion-unauthenticated"],
  [{...principal,firebase:{sign_in_provider:"anonymous"}},"account-deletion-guest-policy-required"]
 ])await assert.rejects(make({verifyAuth:async()=>claims}).authorize(input),{message:error});
});
test("auth revocation failure and invalid or replayed app check are redacted",async()=>{
 await assert.rejects(make({verifyAuth:async()=>{throw Error("private token");}}).authorize(input),{message:"account-deletion-unauthenticated"});
 for(const result of [{...app,alreadyConsumed:true},{...app,appId:"foreign"},{appId:APP_ID}])
  await assert.rejects(make({verifyAppCheck:async()=>result}).authorize(input),{message:"account-deletion-unauthenticated"});
});
test("disabled account or lookup failure denies authorization",async()=>{
 for(const authorizeAccount of [async()=>false,async()=>{throw Error("private user");}])
  await assert.rejects(make({authorizeAccount}).authorize(input),{message:"account-deletion-permission-denied"});
});
test("freshness is rechecked after asynchronous authorization",async()=>{
 let time=now;
 const gate=make({clock:()=>time,authorizeAccount:async()=>{time+=301000;return true;}});
 await assert.rejects(gate.authorize(input),/account-deletion-reauthentication-required/);
});
