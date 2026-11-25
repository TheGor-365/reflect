"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createAccountRevocationFence,ROOT}=require("./accountRevocationFence.cjs");
const projectId="reflect-ai-staging";
const db={projectId,doc:path=>({path})};
const make=()=>createAccountRevocationFence({db,projectId,locallyEnabled:true});
test("default off and foreign project fail closed",()=>{
 assert.equal(createAccountRevocationFence(),null);
 assert.throws(()=>createAccountRevocationFence({db,projectId,locallyEnabled:"true"}),/unsafe-account-fence/);
 assert.throws(()=>createAccountRevocationFence({db:{...db,projectId:"foreign"},projectId,locallyEnabled:true}),/unsafe-account-fence/);
});
test("missing marker allows active owner using exact transaction path",async()=>{
 const paths=[];
 await make().requireActive({get:async ref=>{paths.push(ref.path);return {exists:false};}},"alice");
 assert.deepEqual(paths,[ROOT+"/alice"]);
});
test("any existing marker blocks even malformed state",async()=>{
 for(const data of [null,{}, {revoked:false},{revoked:true}]){
   await assert.rejects(make().requireActive({get:async()=>({exists:true,data:()=>data})},"alice"),{message:"account-revoked"});
 }
});
test("invalid scope rejected before reads",async()=>{
 let calls=0;const tx={get:async()=>{calls++;}};
 for(const uid of ["","../alice",null,"a/b"])
   await assert.rejects(make().requireActive(tx,uid),/invalid-account-fence-scope/);
 assert.equal(calls,0);
});
test("missing metadata or storage failure denies and redacts",async()=>{
 for(const get of [async()=>null,async()=>({}),async()=>{throw Error("private path");}])
   await assert.rejects(make().requireActive({get},"alice"),{message:"account-fence-unavailable"});
});
