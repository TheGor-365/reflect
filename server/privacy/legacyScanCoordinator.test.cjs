"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createLegacyScanCoordinator,MAX_PAGES}=require("./legacyScanCoordinator.cjs");
const projectId="reflect-ai-staging";
const target=sessionId=>({uid:"alice",sessionId});
const inv=batch=>({scanned:batch.length,live:0,missingUnproven:batch.length,revokedWithoutJob:0,revokedWithJob:0,conflict:0});
const desc=batch=>({scanned:batch.length,missingWithDescendants:batch.length,missingWithoutKnownDescendants:0,liveWithDescendants:0,liveWithoutKnownDescendants:0,missingPrivateParentWithDescendants:batch.length});
const make=(readPage,extra={})=>createLegacyScanCoordinator({projectId,locallyEnabled:true,readPage,inspectInventory:inv,inspectDescendants:desc,...extra});
test("default off and unsafe construction fail closed",()=>{
 assert.equal(createLegacyScanCoordinator(),null);
 assert.throws(()=>createLegacyScanCoordinator({locallyEnabled:"yes"}),/unsafe-legacy-scan/);
 assert.throws(()=>make(()=>[],{projectId:"foreign"}),/unsafe-legacy-scan/);
});
test("aggregates short and empty pages with opaque continuation without exposing IDs",async()=>{
 let calls=0;
 const scanner=make(async({uid,pageToken})=>{
   assert.equal(uid,"alice");assert.equal(pageToken,[null,"a","b"][calls]);
   return [{targets:[target("s1")],nextPageToken:"a"},{targets:[],nextPageToken:"b"},{targets:[target("s2")],nextPageToken:null}][calls++];
 });
 assert.deepEqual(await scanner.scan({uid:"alice"}),{pages:3,scanned:2,complete:true,inventory:{live:0,missingUnproven:2,revokedWithoutJob:0,revokedWithJob:0,conflict:0},descendants:{missingWithDescendants:2,missingWithoutKnownDescendants:0,liveWithDescendants:0,liveWithoutKnownDescendants:0,missingPrivateParentWithDescendants:2}});
 assert.equal(calls,3);
});
test("budget exhaustion explicitly incomplete",async()=>{
 let calls=0;
 const scanner=make(async()=>({targets:[target("s"+(++calls))],nextPageToken:"t"+calls}));
 const result=await scanner.scan({uid:"alice",maxPages:2});
 assert.equal(result.pages,2);assert.equal(result.scanned,2);assert.equal(result.complete,false);assert.equal(calls,2);
});
test("invalid scope fails before reads",async()=>{
 let calls=0;const scanner=make(async()=>{calls++;});
 for(const scope of [{uid:"../alice"},{uid:"alice",maxPages:MAX_PAGES+1},{uid:"alice",maxPages:0}])
   await assert.rejects(scanner.scan(scope),/invalid-legacy-scan-scope/);
 assert.equal(calls,0);
});
test("cross-page duplicate and token cycle fail closed",async()=>{
 for(const pages of [
   [{targets:[target("s1")],nextPageToken:"a"},{targets:[target("s1")],nextPageToken:null}],
   [{targets:[],nextPageToken:"a"},{targets:[],nextPageToken:"b"},{targets:[],nextPageToken:"a"}]
 ]){
   let i=0;await assert.rejects(make(async()=>pages[i++]).scan({uid:"alice"}),{message:"legacy-scan-unavailable"});
 }
});
test("foreign targets rejected before inspectors",async()=>{
 let calls=0;
 const scanner=make(async()=>({targets:[{uid:"bob",sessionId:"s1"}],nextPageToken:null}),{inspectInventory:()=>{calls++;}});
 await assert.rejects(scanner.scan({uid:"alice"}),/legacy-scan-unavailable/);assert.equal(calls,0);
});
test("malformed counts and storage errors produce no partial report",async()=>{
 const page=async()=>({targets:[target("s1")],nextPageToken:null});
 await assert.rejects(make(page,{inspectInventory:()=>({...inv([1]),live:1})}).scan({uid:"alice"}),/legacy-scan-unavailable/);
 await assert.rejects(make(page,{inspectDescendants:()=>{throw Error("synthetic private path");}}).scan({uid:"alice"}),{message:"legacy-scan-unavailable"});
});
