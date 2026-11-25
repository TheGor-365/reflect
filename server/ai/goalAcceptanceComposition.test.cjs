"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createGoalAcceptanceComposition } = require("./goalAcceptanceComposition.cjs");
const { PATH, ORIGIN } = require("./goalAcceptanceHttp.cjs");
const projectId = "reflect-ai-staging";
const flag = "_reflectAiPrivate/reflect-8fdc8/runtimeFlags/goalAcceptance";
const body = { sessionId:"s1", sourceTurnId:"user-request-fixture-0001",
 assistantTurnId:"assistant-request-fixture-0001",candidateIndex:0,confirmed:true,
 goalTitle:"Synthetic",goalPurpose:"",goalStep:"Step",goalCriteria:"Criteria" };
test("composition defaults off without reading storage or loading keys", () => {
 assert.equal(createGoalAcceptanceComposition({projectId}),null);
 assert.throws(()=>createGoalAcceptanceComposition({projectId:"other"}),/unsafe-environment/);
 assert.throws(()=>createGoalAcceptanceComposition({projectId,locallyEnabled:"yes"}),/unsafe-environment/);
});
test("enabled composition requires trusted dependencies", () => {
 assert.throws(()=>createGoalAcceptanceComposition({projectId,locallyEnabled:true}),/unsafe-environment/);
});
test("composed route cannot write goal when flag turns off after quota", async () => {
 const docs = new Map([[flag,{enabled:true}]]);
 let transactions=0, writes=0;
 const db = { doc:path=>({path,async get(){return {exists:docs.has(path),data:()=>docs.get(path)}}}),
  async runTransaction(work) {
   transactions++;
   if(transactions===2) docs.set(flag,{enabled:false});
   return work({get:ref=>ref.get(),set(ref,data){writes++;docs.set(ref.path,data)}});
  }};
 const listener = createGoalAcceptanceComposition({db,projectId,locallyEnabled:true,
  provenance:{activeKeyId:"fixture",keys:[{keyId:"fixture",key:Buffer.alloc(32,7)}]},
  verifyAuth:async()=>({uid:"alice"}),
  verifyAppCheck:async()=>({appId:"1:599679789981:web:d4d8743dbff0fe40af1d74",alreadyConsumed:false}),
  authorizeAccount:async()=>true });
 const req=Readable.from([Buffer.from(JSON.stringify(body))]);
 req.url=PATH;req.method="POST";req.headers={origin:ORIGIN,"content-type":"application/json",
 authorization:"Bearer "+"a".repeat(40),"x-firebase-appcheck":"b".repeat(40)};
 const res={writeHead(status){this.status=status},end(raw){this.data=JSON.parse(raw)}};
 await listener(req,res);
 assert.equal(res.status,503);assert.deepEqual(res.data,{error:"unavailable"});
 assert.equal(transactions,2);assert.equal(writes,1);
 assert.equal(docs.size,2);
});
