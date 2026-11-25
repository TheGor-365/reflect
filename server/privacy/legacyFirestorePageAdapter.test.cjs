"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createLegacyFirestorePageAdapter}=require("./legacyFirestorePageAdapter.cjs");
const env={GCLOUD_PROJECT:"demo-reflect-r139",FIRESTORE_EMULATOR_HOST:"127.0.0.1:19381",REFLECT_R139_EMULATOR:"1"};
const prefix="projects/demo-reflect-r139/databases/(default)/documents/_reflectAiPrivate/reflect-8fdc8/attemptOwners/alice/sessions/";
const make=transport=>createLegacyFirestorePageAdapter({locallyEnabled:true,env,transport});
const response=body=>({ok:true,json:async()=>body});
test("default off and unsafe environment rejected",()=>{
 assert.equal(createLegacyFirestorePageAdapter(),null);
 for(const extra of [{GCLOUD_PROJECT:"reflect-ai-staging"},{FIRESTORE_EMULATOR_HOST:"example.invalid"},{GOOGLE_APPLICATION_CREDENTIALS:"synthetic"}])
   assert.throws(()=>createLegacyFirestorePageAdapter({locallyEnabled:true,env:{...env,...extra}}),/unsafe-legacy-page-adapter/);
});
test("short page with missing parent and opaque continuation",async()=>{
 let calls=0;
 const adapter=make(async(raw,options)=>{
   calls++;const url=new URL(raw);
   assert.equal(url.origin,"http://127.0.0.1:19381");
   assert.ok(url.pathname.endsWith("/alice/sessions"));
   assert.equal(url.searchParams.get("showMissing"),"true");
   assert.equal(url.searchParams.get("pageSize"),"25");
   assert.equal(url.searchParams.get("mask.fieldPaths"),"__name__");
   assert.equal(url.searchParams.has("orderBy"),false);
   assert.equal(options.redirect,"error");
   assert.equal(options.method,"GET");
   assert.equal(url.searchParams.get("pageToken"),calls===1?null:"opaque+/=");
   return response(calls===1?{documents:[{name:prefix+"s1"}],nextPageToken:"opaque+/="}:{documents:[{name:prefix+"s2"}]});
 });
 assert.deepEqual(await adapter.readPage({uid:"alice"}),{targets:[{uid:"alice",sessionId:"s1"}],nextPageToken:"opaque+/="});
 assert.deepEqual(await adapter.readPage({uid:"alice",pageToken:"opaque+/="}),{targets:[{uid:"alice",sessionId:"s2"}],nextPageToken:null});
 assert.equal(calls,2);
});
test("empty page preserves continuation",async()=>{
 assert.deepEqual(await make(async()=>response({nextPageToken:"next"})).readPage({uid:"alice"}),{targets:[],nextPageToken:"next"});
});
test("invalid scope fails before transport",async()=>{
 let calls=0;const adapter=make(async()=>{calls++;});
 for(const scope of [{uid:"../alice"},{uid:"alice",pageToken:""},{uid:"alice",pageToken:"x".repeat(4097)}])
   await assert.rejects(adapter.readPage(scope),/invalid-legacy-page-scope/);
 assert.equal(calls,0);
});
test("rejects foreign, nested, duplicate, oversized and repeated token responses",async()=>{
 for(const body of [{documents:[{name:prefix.replace("/alice/","/bob/")+"s1"}]},{documents:[{name:prefix+"s1/turns/t1"}]},{documents:[{name:prefix+"s1"},{name:prefix+"s1"}]},{documents:Array.from({length:26},(_,i)=>({name:prefix+"s"+i}))},{nextPageToken:"same"},null])
   await assert.rejects(make(async()=>response(body)).readPage({uid:"alice",pageToken:"same"}),{message:"legacy-page-unavailable"});
});
test("transport failures redacted",async()=>{
 await assert.rejects(make(async()=>{throw Error("synthetic secret");}).readPage({uid:"alice"}),{message:"legacy-page-unavailable"});
});
