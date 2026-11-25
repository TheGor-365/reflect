"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createLegacyTargetAcquisition,LIMIT}=require("./legacyTargetAcquisition.cjs");
const projectId="reflect-ai-staging";
const root="_reflectAiPrivate/reflect-8fdc8/attemptOwners/alice/sessions";
const make=readPage=>createLegacyTargetAcquisition({projectId,locallyEnabled:true,readPage});
test("default off and foreign project fail closed",()=>{
 assert.equal(createLegacyTargetAcquisition(),null);
 assert.throws(()=>createLegacyTargetAcquisition({locallyEnabled:"yes"}),/unsafe-legacy-acquisition/);
 assert.throws(()=>createLegacyTargetAcquisition({projectId:"foreign",locallyEnabled:true,readPage:()=>[]}),/unsafe-legacy-acquisition/);
});
test("bounded ordered page and continuation contract",async()=>{
 const ids=Array.from({length:LIMIT},(_,i)=>"s"+String(i).padStart(2,"0"));
 const acquisition=make(async args=>{
   assert.deepEqual(args,{collectionPath:root,after:null,limit:LIMIT});
   return ids.map(id=>root+"/"+id);
 });
 const result=await acquisition.acquire({uid:"alice"});
 assert.deepEqual(result,{targets:ids.map(sessionId=>({uid:"alice",sessionId})),nextAfter:"s24"});
 assert.ok(Object.isFrozen(result.targets));
 assert.ok(Object.isFrozen(result.targets[0]));
});
test("short and empty pages finish without continuation",async()=>{
 const acquisition=make(async args=>{
   assert.equal(args.after,"s24");return [root+"/s25"];
 });
 assert.deepEqual(await acquisition.acquire({uid:"alice",after:"s24"}),{targets:[{uid:"alice",sessionId:"s25"}],nextAfter:null});
 assert.deepEqual(await make(async()=>[]).acquire({uid:"alice"}),{targets:[],nextAfter:null});
});
test("invalid scope rejected before adapter access",async()=>{
 let calls=0;const acquisition=make(async()=>{calls++;return [];});
 for(const scope of [{uid:"../alice"},{uid:"alice",after:"a/b"},{}])
   await assert.rejects(acquisition.acquire(scope),/invalid-legacy-acquisition-scope/);
 assert.equal(calls,0);
});
test("rejects foreign nested duplicate unordered stale and oversized pages",async()=>{
 for(const page of [[root.replace("/alice/","/bob/")+"/s1"],[root+"/s1/turns/t1"],[root+"/s2",root+"/s2"],[root+"/s3",root+"/s2"],[root+"/s0"],Array.from({length:LIMIT+1},(_,i)=>root+"/s"+i),null])
   await assert.rejects(make(async()=>page).acquire({uid:"alice",after:"s0"}),{message:"legacy-acquisition-unavailable"});
});
test("adapter failures are redacted",async()=>{
 await assert.rejects(make(async()=>{throw Error("synthetic private path");}).acquire({uid:"alice"}),{message:"legacy-acquisition-unavailable"});
});
