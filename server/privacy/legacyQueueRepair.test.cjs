"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createLegacyQueueRepair}=require("./legacyQueueRepair.cjs");
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
const projectId="reflect-ai-staging",uid="alice",sessionId="s1";
const live="artifacts/reflect-8fdc8/users/alice/sessions/s1";
const marker="_reflectAiPrivate/reflect-8fdc8/attemptOwners/alice/sessions/s1";
const job=JOB_ROOT+"/"+jobId(uid,sessionId);
const input={uid,sessionId,confirmed:true};
const row={schemaVersion:1,uid,sessionId,status:"pending"};
function fixture(entries=[],failCreate=false){
 const docs=new Map(entries),calls={transactions:0,reads:0,creates:0};
 const db={projectId,doc:path=>({path}),async runTransaction(fn){
   calls.transactions++;
   const writes=[];
   const result=await fn({
     async get(ref){calls.reads++;return {exists:docs.has(ref.path),data:()=>docs.get(ref.path)};},
     create(ref,data){calls.creates++;assert.equal(ref.path,job);
       assert.equal(calls.reads%3,0);writes.push([ref.path,data]);}
   });
   for(const [path,data] of writes){
     if(failCreate||docs.has(path))throw Error("synthetic storage conflict");
     docs.set(path,data);
   }
   return result;
 }};
 return {docs,calls,db,repair:createLegacyQueueRepair({db,projectId,locallyEnabled:true})};
}
test("default off and foreign project fail closed",()=>{
 assert.equal(createLegacyQueueRepair(),null);
 assert.throws(()=>createLegacyQueueRepair({locallyEnabled:"yes"}),/unsafe-legacy-repair/);
 assert.throws(()=>createLegacyQueueRepair({db:{projectId:"other"},projectId,locallyEnabled:true}),/unsafe-legacy-repair/);
});
test("invalid or unconfirmed target never opens transaction",async()=>{
 const f=fixture();
 for(const extra of [{confirmed:false},{uid:"../alice"},{sessionId:"a/b"}])
   await assert.rejects(f.repair.repair({...input,...extra}),/invalid-legacy-repair-target/);
 assert.equal(f.calls.transactions,0);
});
test("creates only absent job for existing revoked marker and is idempotent",async()=>{
 const state={provenanceRevoked:true};
 const f=fixture([[marker,state]]);
 assert.deepEqual(await f.repair.repair(input),{status:"queued",created:true});
 assert.deepEqual(f.docs.get(job),row);
 assert.equal(f.docs.get(marker),state);
 assert.equal(f.docs.has(live),false);
 assert.deepEqual(await f.repair.repair(input),{status:"alreadyQueued",created:false});
 assert.equal(f.calls.creates,1);
});
test("missing proof, live sessions, conflicts and previous progress never write",async()=>{
 for(const [entries,status] of [
   [[],"unproven"],[[[live,{}]],"live"],
   [[[live,{}],[marker,{provenanceRevoked:true}]],"conflict"],
   [[[job,row]],"conflict"],
   [[[marker,{provenanceRevoked:true,turnCleanup:{done:true,cursor:null}}]],"reviewProgress"]
 ]){
   const f=fixture(entries);const before=[...f.docs];
   assert.deepEqual(await f.repair.repair(input),{status,created:false});
   assert.deepEqual([...f.docs],before);assert.equal(f.calls.creates,0);
 }
});
test("existing jobs including attention and complete are preserved",async()=>{
 for(const status of ["pending","complete","attention"]){
   const existing={...row,status};const f=fixture([[marker,{provenanceRevoked:true}],[job,existing]]);
   assert.deepEqual(await f.repair.repair(input),{status:"alreadyQueued",created:false});
   assert.equal(f.docs.get(job),existing);assert.equal(f.calls.creates,0);
 }
});
test("create failure returns only redacted error and leaves fixture unchanged",async()=>{
 const f=fixture([[marker,{provenanceRevoked:true}]],true);
 await assert.rejects(f.repair.repair(input),{message:"legacy-repair-unavailable"});
 assert.equal(f.docs.has(job),false);
});
