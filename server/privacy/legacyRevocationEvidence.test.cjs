"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assessLegacyRevocation}=require("./legacyRevocationEvidence.cjs");
const {JOB_ROOT,jobId}=require("./provenanceRetention.cjs");
const projectId="reflect-ai-staging",uid="alice",sessionId="s1";
const live="artifacts/reflect-8fdc8/users/alice/sessions/s1";
const marker="_reflectAiPrivate/reflect-8fdc8/attemptOwners/alice/sessions/s1";
const job=JOB_ROOT+"/"+jobId(uid,sessionId);
const validJob={schemaVersion:1,uid,sessionId,status:"pending"};
function fixture(entries=[]){
 const docs=new Map(entries),reads=[];
 const db={projectId,doc:path=>({path})};
 const tx={async get(ref){reads.push(ref.path);return {exists:docs.has(ref.path),data:()=>docs.get(ref.path)};}};
 return {reads,args:{db,tx,projectId,uid,sessionId}};
}
test("missing session alone or nonrevoked marker is never evidence",async()=>{
 for(const entries of [[],[[marker,{}]],[[marker,{provenanceRevoked:false}]]])
   assert.equal(await assessLegacyRevocation(fixture(entries).args),"unproven");
});
test("existing server marker and absent session eligible for queue repair only",async()=>{
 const f=fixture([[marker,{provenanceRevoked:true}]]);
 assert.equal(await assessLegacyRevocation(f.args),"eligibleExistingMarker");
 assert.deepEqual(f.reads,[live,marker,job]);
});
test("existing live sessions and contradictory records never eligible",async()=>{
 for(const [entries,expected] of [
   [[[live,{}]],"live"],
   [[[live,{}],[marker,{provenanceRevoked:true}]],"conflict"],
   [[[job,validJob]],"conflict"],
   [[[marker,{provenanceRevoked:"yes"}]],"conflict"],
   [[[marker,{provenanceRevoked:true}],[job,{...validJob,uid:"bob"}]],"conflict"]
 ])assert.equal(await assessLegacyRevocation(fixture(entries).args),expected);
});
test("existing jobs preserve status and cleanup progress requires review",async()=>{
 for(const status of ["pending","complete","attention"])
   assert.equal(await assessLegacyRevocation(fixture([[marker,{provenanceRevoked:true}],[job,{...validJob,status}]]).args),"alreadyQueued");
 for(const progress of [{turnCleanup:{done:true,cursor:null}},{acceptanceCleanup:null}])
   assert.equal(await assessLegacyRevocation(fixture([[marker,{provenanceRevoked:true,...progress}]]).args),"reviewProgress");
});
test("invalid scope rejected before transaction reads",async()=>{
 const f=fixture();
 for(const extra of [{uid:"../alice"},{sessionId:"a/b"},{projectId:"foreign"}])
   await assert.rejects(assessLegacyRevocation({...f.args,...extra}),/unsafe-legacy-evidence/);
 assert.equal(f.reads.length,0);
});
test("storage failures are redacted",async()=>{
 const f=fixture();
 await assert.rejects(assessLegacyRevocation({...f.args,tx:{get(){throw Error("synthetic private path");}}}),{message:"legacy-evidence-unavailable"});
});
