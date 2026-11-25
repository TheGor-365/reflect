"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createLegacyDescendantsDiscovery,LIMIT}=require("./legacyDescendantsDiscovery.cjs");
const projectId="reflect-ai-staging";
const root="_reflectAiPrivate/reflect-8fdc8/attemptOwners/alice/sessions/";
const live="artifacts/reflect-8fdc8/users/alice/sessions/";
const target=sessionId=>({uid:"alice",sessionId});
function fixture(paths=[]){
 const docs=new Set(paths),reads=[];
 const db={projectId,doc:path=>({path}),collection:path=>({
   select(...fields){assert.equal(fields.length,0);return this;},
   limit(n){assert.equal(n,1);return {path,query:true};}
 }),async runTransaction(fn,options){
   assert.deepEqual(options,{readOnly:true});
   return fn({async get(ref){reads.push(ref.path);return ref.query?
     {empty:![...docs].some(p=>p.startsWith(ref.path+"/")&&p.slice(ref.path.length+1).split("/").length===1)}:
     {exists:docs.has(ref.path)};}});
 }};
 return {db,reads,discovery:createLegacyDescendantsDiscovery({db,projectId,locallyEnabled:true})};
}
test("default off and foreign project rejected",()=>{
 assert.equal(createLegacyDescendantsDiscovery(),null);
 assert.throws(()=>createLegacyDescendantsDiscovery({locallyEnabled:"yes"}),/unsafe-legacy-discovery/);
 assert.throws(()=>createLegacyDescendantsDiscovery({db:{projectId:"foreign"},projectId,locallyEnabled:true}),/unsafe-legacy-discovery/);
});
test("finds orphan descendants even without private parent; no foreign scope",async()=>{
 const f=fixture([root+"a/turns/t1",root+"b",root+"b/acceptances/e1",live+"c",root+"c/turns/t1",live+"d",root.replace("/alice/","/bob/")+"e/turns/t1"]);
 assert.deepEqual(await f.discovery.inspect("abcde".split("").map(target)),{
 scanned:5,missingWithDescendants:2,missingWithoutKnownDescendants:1,liveWithDescendants:1,liveWithoutKnownDescendants:1,missingPrivateParentWithDescendants:2});
 assert.equal(f.reads.length,20);
 assert.ok(f.reads.every(path=>path.includes("/alice/")));
});
test("rejects duplicate invalid and oversized batches before reads",async()=>{
 const f=fixture();
 for(const rows of [[],null,[target("a"),target("a")],[target("../a")],[{...target("a"),proof:true}],Array.from({length:LIMIT+1},(_,i)=>target("s"+i))])
   await assert.rejects(f.discovery.inspect(rows),/invalid-legacy-targets/);
 assert.equal(f.reads.length,0);
});
test("storage errors are redacted",async()=>{
 const db={projectId,doc(){},collection(){},async runTransaction(){throw Error("synthetic private path");}};
 await assert.rejects(createLegacyDescendantsDiscovery({db,projectId,locallyEnabled:true}).inspect([target("a")]),{message:"legacy-discovery-unavailable"});
});
