"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createLegacyRevocationInventory,LIMIT}=require("./legacyRevocationInventory.cjs");
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
const projectId="reflect-ai-staging";
const target=sessionId=>({uid:"alice",sessionId});
const root=id=>"_reflectAiPrivate/reflect-8fdc8/attemptOwners/alice/sessions/"+id;
const live=id=>"artifacts/reflect-8fdc8/users/alice/sessions/"+id;
const job=id=>JOB_ROOT+"/"+jobId("alice",id);
const validJob=id=>({schemaVersion:1,uid:"alice",sessionId:id,status:"pending"});
function fixture(docs=new Map()){
 let reads=0,transactions=0;
 const db={projectId,doc:path=>({path}),async runTransaction(fn,options){
   transactions++;assert.deepEqual(options,{readOnly:true});
   return fn({async get(ref){reads++;return {exists:docs.has(ref.path),data:()=>docs.get(ref.path)};}});
 }};
 return {db,counts:()=>({reads,transactions}),inventory:createLegacyRevocationInventory({db,projectId,locallyEnabled:true})};
}
test("default off and foreign project fail closed",()=>{
 assert.equal(createLegacyRevocationInventory(),null);
 assert.throws(()=>createLegacyRevocationInventory({locallyEnabled:"yes"}),/unsafe-legacy-inventory/);
 assert.throws(()=>createLegacyRevocationInventory({db:{projectId:"other"},projectId,locallyEnabled:true}),/unsafe-legacy-inventory/);
});
test("classifies explicit targets and returns aggregate only",async()=>{
 const docs=new Map([[live("a"),{archivedAt:1}],[root("c"),{provenanceRevoked:true}],[root("d"),{provenanceRevoked:true}],[job("d"),validJob("d")],[live("e"),{}],[root("e"),{provenanceRevoked:true}],[job("f"),validJob("f")],[root("g"),{provenanceRevoked:"yes"}],[root("h"),{provenanceRevoked:true}],[job("h"),{...validJob("h"),uid:"bob"}]]);
 const before=JSON.stringify([...docs]);
 const f=fixture(docs);
 assert.deepEqual(await f.inventory.inspect("abcdefgh".split("").map(target)),{scanned:8,live:1,missingUnproven:1,revokedWithoutJob:1,revokedWithJob:1,conflict:4});
 assert.deepEqual(f.counts(),{reads:24,transactions:1});
 assert.equal(JSON.stringify([...docs]),before);
});
test("rejects malformed duplicate or oversized targets before reading",async()=>{
 const f=fixture();
 for(const rows of [[],null,[target("a"),target("a")],[target("../a")],[{...target("a"),proof:true}],Array.from({length:LIMIT+1},(_,i)=>target("s"+i))])
   await assert.rejects(f.inventory.inspect(rows),/invalid-legacy-targets/);
 assert.deepEqual(f.counts(),{reads:0,transactions:0});
});
test("missing session with nonrevoked marker is not proof of deletion",async()=>{
 const f=fixture(new Map([[root("a"),{provenanceRevoked:false}],[root("b"),{}]]));
 assert.deepEqual(await f.inventory.inspect([target("a"),target("b")]),{scanned:2,live:0,missingUnproven:2,revokedWithoutJob:0,revokedWithJob:0,conflict:0});
});
test("storage failures are redacted",async()=>{
 const db={projectId,doc(){throw Error("synthetic sensitive path");},async runTransaction(fn){return fn({});}};
 await assert.rejects(createLegacyRevocationInventory({db,projectId,locallyEnabled:true}).inspect([target("a")]),{message:"legacy-inventory-unavailable"});
});
