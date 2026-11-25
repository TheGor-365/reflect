"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createPreviewQuota}=require("./contextPreviewQuota.cjs");
const {ROOT}=require("./accountRevocationFence.cjs");
const projectId="reflect-ai-staging";
function fixture(revoked){
 const calls=[],rows=new Map();
 const db={projectId,doc:path=>({path}),async runTransaction(fn){
  return fn({async get(ref){calls.push(["get",ref.path]);return {exists:ref.path===ROOT+"/alice"?revoked:rows.has(ref.path),data:()=>rows.get(ref.path)};},
   create(ref,data){calls.push(["create",ref.path]);rows.set(ref.path,data);},
   update(ref,data){calls.push(["update",ref.path]);rows.set(ref.path,data);}
  });
 }};
 return {db,calls,rows};
}
test("preview quota default off preserves existing behavior",async()=>{
 const f=fixture(true);
 assert.equal(await createPreviewQuota({db:f.db,projectId,clock:()=>1000}).consume("alice"),true);
 assert.equal(f.calls.some(c=>c[1]===ROOT+"/alice"),false);
});
test("enabled preview fence rejects revoked account before quota writes",async()=>{
 const f=fixture(true);
 await assert.rejects(createPreviewQuota({db:f.db,projectId,accountFenceEnabled:true,clock:()=>1000}).consume("alice"),/account-revoked/);
 assert.deepEqual(f.calls,[["get",ROOT+"/alice"]]);assert.equal(f.rows.size,0);
});
test("active preview owner reads fence first in same transaction",async()=>{
 const f=fixture(false);
 assert.equal(await createPreviewQuota({db:f.db,projectId,accountFenceEnabled:true,clock:()=>1000}).consume("alice"),true);
 assert.deepEqual(f.calls[0],["get",ROOT+"/alice"]);assert.equal(f.rows.size,1);
});
test("enabled preview fence rejects foreign database metadata",()=>{
 const f=fixture(false);f.db.projectId="foreign";
 assert.throws(()=>createPreviewQuota({db:f.db,projectId,accountFenceEnabled:true}),/unsafe-account-fence/);
});
