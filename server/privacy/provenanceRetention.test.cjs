"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvenanceRetention, JOB_ROOT, jobId } = require("./provenanceRetention.cjs");
const { createProvenanceRetentionWorker } = require("./provenanceRetentionWorker.cjs");
const DELETE = Symbol("delete-field");
const root = "_reflectAiPrivate/reflect-8fdc8/attemptOwners/alice/sessions/s1";
const live = "artifacts/reflect-8fdc8/users/alice/sessions/s1";

function fixture(count = 2, clock = Date.now) {
  const docs = new Map();
  for (let i = 0; i < count; i++) {
    docs.set(root + "/turns/u" + String(i).padStart(3, "0"),
      { status: "persisted_reply", billedPossible: true, provenance: { mac: "synthetic" } });
  }
  const foreign = root.replace("/alice/", "/bob/") + "/turns/u000";
  docs.set(foreign, { provenance: { mac: "foreign" } });
  const ref = path => ({ path });
  const db = {
    doc: ref,
    collection(path) {
      const q = { path, cursor: null, size: 100,
        where(field, op, value) { this.filter = [field,op,value]; return this; },
        async get() { return {docs:[...docs.keys()].filter(p=>p.startsWith(path+"/") && (!this.filter || docs.get(p)[this.filter[0]]===this.filter[2])).sort().filter(p=>this.cursor===null || p.split("/").pop()>this.cursor).slice(0,this.size).map(p=>({id:p.split("/").pop(),data:()=>docs.get(p)}))}; },
        orderBy(field) { assert.equal(field, "__name__"); return this; },
        limit(size) { this.size = size; return this; },
        startAfter(cursor) { this.cursor = cursor; return this; } };
      return q;
    },
    async runTransaction(work) {
      const writes = [];
      const result = await work({
        async get(r) {
          if (!("size" in r)) return { exists: docs.has(r.path), data: () => docs.get(r.path) };
          return { docs: [...docs.keys()].filter(p => p.startsWith(r.path + "/"))
            .sort().filter(p => r.cursor === null || p.split("/").pop() > r.cursor)
            .slice(0, r.size).map(p => ({ id: p.split("/").pop(), ref: ref(p),
              data: () => docs.get(p) })) };
        },
        set(r, data, options) { assert.ok(options === undefined || options.merge === true);
          writes.push(() => docs.set(r.path, options?.merge ? { ...docs.get(r.path), ...data } : data)); },
        delete(r) { writes.push(() => docs.delete(r.path)); },
        update(r, data) { writes.push(() => {
          if (data.status === "complete") { docs.set(r.path,{...docs.get(r.path),...data}); return; }
          assert.equal(data.provenance, DELETE);
          const next = { ...docs.get(r.path) }; delete next.provenance; docs.set(r.path, next);
        }); }
      });
      writes.forEach(write => write());
      return result;
    }
  };
  return { db, docs, foreign, worker:createProvenanceRetentionWorker({db,clock,projectId:"reflect-ai-staging",deleteField:()=>DELETE}), service: createProvenanceRetention({
    db, projectId: "reflect-ai-staging", deleteField: () => DELETE }) };
}

test("deleted session cleanup strips only provenance and preserves other owner and accounting", async () => {
  const { docs, foreign, service } = fixture();
  docs.set(root, { provenanceRevoked: true });
  assert.deepEqual(await service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" }),
    { scrubbed: 2, done: true });
  assert.deepEqual(docs.get(root + "/turns/u000"), { status: "persisted_reply", billedPossible: true });
  assert.equal(docs.get(foreign).provenance.mac, "foreign");
  assert.equal(docs.get(root).provenanceRevoked, true);
  assert.equal((await service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" })).scrubbed, 0);
});

test("existing session including archived session cannot be scrubbed", async () => {
  const { docs, service } = fixture();
  docs.set(live, { archivedAt: 1 });
  await assert.rejects(service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" }), /session-still-exists/);
  assert.equal(docs.has(root), false);
  assert.ok(docs.get(root + "/turns/u000").provenance);
});

test("bounded cleanup resumes with private cursor and preserves unrelated metadata", async () => {
  const { docs, service } = fixture(101);
  docs.set(root, { provenanceRevoked: true });
  const first = await service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" });
  assert.deepEqual(first, { scrubbed: 100, done: false });
  assert.deepEqual(docs.get(root).turnCleanup, { done: false, cursor: "u099" });
  docs.set(live, { chatHistory: [] }); // recreated session cannot cancel revoked cleanup
  assert.deepEqual(await service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" }),
    { scrubbed: 1, done: true });
  assert.equal(docs.get(root + "/turns/u100").provenance, undefined);
});

test("reject malformed identity, path and environment", async () => {
  const { service } = fixture();
  for (const [body, principal] of [
    [{ sessionId: "s1" }, null], [{ sessionId: "../s1" }, { uid: "alice" }],
    [{ sessionId: "s1", cursor: "../u" }, { uid: "alice" }],
    [{ sessionId: "s1" }, { uid: "../bob" }]
  ]) await assert.rejects(service.scrubDeletedSession(body, principal), /invalid-retention-target/);
  assert.throws(() => createProvenanceRetention({ projectId: "production" }), /unsafe-retention-environment/);
});

test("cleanup cannot create arbitrary tombstones or accept caller cursor", async () => {
  const { docs, service } = fixture();
  await assert.rejects(service.scrubDeletedSession({sessionId:"s1"}, {uid:"alice"}), /revocation-required/);
  assert.equal(docs.has(root),false);
  docs.set(root,{provenanceRevoked:true});
  await assert.rejects(service.scrubDeletedSession({sessionId:"s1",cursor:"u999"}, {uid:"alice"}), /invalid-retention-target/);
  assert.ok(docs.get(root+"/turns/u000").provenance);
});
test("malformed private progress fails closed", async () => {
  const {docs,service}=fixture();
  docs.set(root,{provenanceRevoked:true,turnCleanup:{done:false,cursor:null}});
  await assert.rejects(service.scrubDeletedSession({sessionId:"s1"},{uid:"alice"}),/invalid-retention-progress/);
  assert.ok(docs.get(root+"/turns/u000").provenance);
});


test("acceptance cleanup deletes bounded pages and preserves goals, accounting and foreign events", async () => {
  const {docs,service}=fixture();
  docs.set(root,{provenanceRevoked:true,turnCleanup:{done:true,cursor:null}});
  const foreign=root.replace("/alice/","/bob/")+"/acceptances/verified-other";
  const goal="artifacts/reflect-8fdc8/users/alice/goals/verified-owner";
  docs.set(foreign,{status:"accepted"});
  docs.set(goal,{text:"Synthetic owner goal"});
  for(let i=0;i<101;i++) docs.set(root+"/acceptances/verified-"+String(i).padStart(3,"0"),{status:"accepted"});
  assert.deepEqual(await service.scrubDeletedSessionAcceptances({sessionId:"s1"},{uid:"alice"}),{deleted:100,done:false});
  assert.deepEqual(docs.get(root).acceptanceCleanup,{done:false});
  assert.deepEqual(await service.scrubDeletedSessionAcceptances({sessionId:"s1"},{uid:"alice"}),{deleted:1,done:true});
  assert.deepEqual(await service.scrubDeletedSessionAcceptances({sessionId:"s1"},{uid:"alice"}),{deleted:0,done:true});
  assert.equal([...docs.keys()].filter(p=>p.startsWith(root+"/acceptances/")).length,0);
  assert.equal(docs.get(foreign).status,"accepted");
  assert.equal(docs.get(goal).text,"Synthetic owner goal");
  assert.equal(docs.get(root+"/turns/u000").billedPossible,true);
  assert.deepEqual(docs.get(root).turnCleanup,{done:true,cursor:null});
});
test("acceptance cleanup denies absent revocation, forged cursor and malformed state", async () => {
  const {docs,service}=fixture();
  const event=root+"/acceptances/verified-owner";
  docs.set(event,{status:"accepted"});
  const clean=body=>service.scrubDeletedSessionAcceptances(body,{uid:"alice"});
  await assert.rejects(clean({sessionId:"s1"}),/revocation-required/);
  assert.equal(docs.has(root),false);
  docs.set(root,{provenanceRevoked:true,acceptanceCleanup:{done:"yes"}});
  await assert.rejects(clean({sessionId:"s1"}),/invalid-retention-progress/);
  await assert.rejects(clean({sessionId:"s1",cursor:"anything"}),/invalid-retention-target/);
  await assert.rejects(service.scrubDeletedSessionAcceptances({sessionId:"s1"},{uid:"bob"}),/revocation-required/);
  assert.equal(docs.has(event),true);
});

test("deletion atomically registers a private discoverable cleanup job", async () => {
 const {docs,service}=fixture();
 const path=JOB_ROOT+"/"+jobId("alice","s1");
 docs.set(live,{chatHistory:[]});
 assert.deepEqual(await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"}),{revoked:true});
 assert.equal(docs.has(live),false);
 assert.equal(docs.get(root).provenanceRevoked,true);
 assert.deepEqual(docs.get(path),{schemaVersion:1,uid:"alice",sessionId:"s1",status:"pending"});
 await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
 assert.equal(docs.get(path).status,"pending");
});
test("deletion rejects archived, nonexistent and malformed jobs without writes", async () => {
 const {docs,service}=fixture();
 const path=JOB_ROOT+"/"+jobId("alice","s1");
 const remove=()=>service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
 await assert.rejects(remove(),/session-not-found/);
 docs.set(live,{archivedAt:1});
 await assert.rejects(remove(),/archived-session-deletion-blocked/);
 assert.equal(docs.has(path),false);
 docs.set(live,{chatHistory:[]});
 docs.set(path,{uid:"bob",sessionId:"s1",status:"pending",schemaVersion:1});
 await assert.rejects(remove(),/invalid-retention-job/);
 assert.equal(docs.has(live),true);
 assert.equal(docs.has(root),false);
});

test("worker resumes both cleanup streams and completes only after both finish", async () => {
 const {docs,service,worker}=fixture(101);
 docs.set(live,{chatHistory:[]});
 docs.set(root+"/acceptances/a",{status:"accepted"});
 await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
 const path=JOB_ROOT+"/"+jobId("alice","s1");
 assert.deepEqual(await worker.runBatch(),{scanned:1,completed:0,pending:1,failed:0,nextCursor:null});
 assert.equal(docs.get(path).status,"pending");
 assert.deepEqual(await worker.runBatch(),{scanned:1,completed:1,pending:0,failed:0,nextCursor:null});
 assert.equal(docs.get(path).status,"complete");
 assert.equal(docs.get(root+"/turns/u100").provenance,undefined);
 assert.equal(docs.has(root+"/acceptances/a"),false);
 assert.equal((await worker.runBatch()).scanned,0);
});
test("worker rejects forged jobs without preventing valid jobs in same page", async () => {
 const {docs,service,worker}=fixture();
 docs.set(live,{chatHistory:[]});
 await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
 docs.set(JOB_ROOT+"/"+"0".repeat(64),{schemaVersion:1,uid:"bob",sessionId:"s1",status:"pending"});
 const result=await worker.runBatch();
 assert.equal(result.failed,1);assert.equal(result.completed,1);
 await assert.rejects(worker.runBatch({after:"../bad"}),/invalid-worker-cursor/);
});

const retryPolicy = require("./provenanceRetentionRetry.cjs");
test("retention retry policy bounds consecutive failures and delays", () => {
  let row = {status:"pending"}, now = 1000;
  for (const delay of [60000,120000,240000,480000]) {
    assert.equal(retryPolicy.eligible(row,now),true);
    row = retryPolicy.afterFailure(row,now);
    assert.equal(row.status,"pending");
    assert.equal(row.retry.notBeforeMs,now+delay);
    assert.equal(retryPolicy.eligible(row,now+delay-1),false);
    assert.throws(()=>retryPolicy.afterFailure(row,now),/not-eligible/);
    now += delay;
  }
  row = retryPolicy.afterFailure(row,now);
  assert.deepEqual(row,{status:"attention",retry:{failures:5,notBeforeMs:0}});
  assert.equal(retryPolicy.eligible(row,now+1000000),false);
  assert.deepEqual(retryPolicy.afterSuccess(),{failures:0,notBeforeMs:0});
});
test("retention retry policy fails closed on malformed state and clock", () => {
  for (const retry of [null,{failures:-1,notBeforeMs:0},{failures:6,notBeforeMs:0},
    {failures:1,notBeforeMs:0},{failures:0,notBeforeMs:1},{failures:5,notBeforeMs:1},
    {failures:1,notBeforeMs:NaN}]) {
    assert.throws(()=>retryPolicy.eligible({retry},1000),/invalid-retention-retry/);
  }
  assert.throws(()=>retryPolicy.eligible({},-1),/invalid-retention-clock/);
  assert.throws(()=>retryPolicy.afterFailure({},Number.MAX_SAFE_INTEGER),/invalid-retention-clock/);
});

test("worker persists backoff, stops at attention, and deletion reentry cannot reset it", async()=>{
  let time=1000;
  const {docs,worker,service}=fixture(2,()=>time);
  const path=JOB_ROOT+"/"+jobId("alice","s1");
  docs.set(live,{chatHistory:[]});
  await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
  docs.set(root,{provenanceRevoked:true,turnCleanup:{done:false,cursor:null}});
  for(const delay of [60000,120000,240000,480000]){
    assert.equal((await worker.runBatch()).failed,1);
    assert.equal(docs.get(path).retry.notBeforeMs,time+delay);
    assert.equal(docs.get(path).attempt,null);
    assert.equal((await worker.runBatch()).pending,1);
    time+=delay;
  }
  assert.equal((await worker.runBatch()).failed,1);
  assert.equal(docs.get(path).status,"attention");
  assert.deepEqual(docs.get(path).retry,{failures:5,notBeforeMs:0});
  assert.equal((await worker.runBatch()).scanned,0);
  await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
  assert.equal(docs.get(path).status,"attention");
  assert.ok(docs.get(root+"/turns/u000").provenance);
});
test("worker successful partial page resets failure count",async()=>{
  let time=1000;
  const {docs,worker,service}=fixture(101,()=>time);
  const path=JOB_ROOT+"/"+jobId("alice","s1");
  docs.set(live,{chatHistory:[]});
  await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
  docs.set(root,{provenanceRevoked:true,turnCleanup:{done:false,cursor:null}});
  assert.equal((await worker.runBatch()).failed,1);
  docs.set(root,{provenanceRevoked:true});
  time+=60000;
  assert.equal((await worker.runBatch()).pending,1);
  assert.deepEqual(docs.get(path).retry,{failures:0,notBeforeMs:0});
  assert.equal((await worker.runBatch()).completed,1);
});

test("worker-bound cleanup denies expired and replaced attempts before writes",async()=>{
  let time=1000;
  const {db,docs}=fixture();
  const owner="a".repeat(8)+"-"+"a".repeat(4)+"-"+"a".repeat(4)+"-"+"a".repeat(4)+"-"+"a".repeat(12);
  const replacement=owner.replace(/^a/,"b");
  const path=JOB_ROOT+"/"+jobId("alice","s1");
  docs.set(root,{provenanceRevoked:true});
  const event=root+"/acceptances/a";
  docs.set(event,{status:"accepted"});
  const row={schemaVersion:1,uid:"alice",sessionId:"s1",status:"pending",attempt:{owner,untilMs:2000}};
  docs.set(path,row);
  const make=workerAttempt=>createProvenanceRetention({db,projectId:"reflect-ai-staging",
    deleteField:()=>DELETE,clock:()=>time,workerAttempt});
  const args=[{sessionId:"s1"},{uid:"alice"}];
  time=2000;
  await assert.rejects(make(owner).scrubDeletedSession(...args),/stale-retention-attempt/);
  await assert.rejects(make(owner).scrubDeletedSessionAcceptances(...args),/stale-retention-attempt/);
  docs.set(path,{...row,attempt:{owner:replacement,untilMs:3000}});
  await assert.rejects(make(owner).scrubDeletedSession(...args),/stale-retention-attempt/);
  await assert.rejects(make(owner).scrubDeletedSessionAcceptances(...args),/stale-retention-attempt/);
  assert.ok(docs.get(root+"/turns/u000").provenance);
  assert.ok(docs.has(event));
  assert.equal((await make(replacement).scrubDeletedSession(...args)).done,true);
  assert.equal((await make(replacement).scrubDeletedSessionAcceptances(...args)).done,true);
  assert.equal(docs.has(event),false);
});

test("worker health distinguishes backoff, busy and attention without job identifiers",async()=>{
  let time=1000;
  const {docs,worker,service}=fixture(2,()=>time);
  const path=JOB_ROOT+"/"+jobId("alice","s1");
  docs.set(live,{chatHistory:[]});
  await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
  docs.set(root,{provenanceRevoked:true,turnCleanup:{done:false,cursor:null}});
  docs.set(path,{...docs.get(path),attempt:{owner:"a".repeat(36),untilMs:2000}});
  assert.equal((await worker.runBatch({diagnostics:true})).health.busy,1);
  time=2000;
  assert.equal((await worker.runBatch({diagnostics:true})).failed,1);
  const deferred=await worker.runBatch({diagnostics:true});
  assert.equal(deferred.health.backoff,1);
  assert.ok(!JSON.stringify(deferred.health).includes("alice"));
  for(const delay of [60000,120000,240000]){
    time+=delay;
    assert.equal((await worker.runBatch({diagnostics:true})).failed,1);
  }
  time+=480000;
  const exhausted=await worker.runBatch({diagnostics:true});
  assert.equal(exhausted.health.attention,1);
  assert.equal(docs.get(path).status,"attention");
});

const {createProvenanceRetentionInventory,INVENTORY_LIMIT}=require("./provenanceRetentionInventory.cjs");
test("attention inventory returns bounded counts only and never writes",async()=>{
  const {db,docs}=fixture();
  const inventory=createProvenanceRetentionInventory({db,projectId:"reflect-ai-staging"});
  assert.deepEqual(await inventory.readAttention(),{status:"ok",attentionAtLeast:0,exact:true});
  for(let i=0;i<99;i++) docs.set(JOB_ROOT+"/attention-"+i,{status:"attention",uid:"private-fixture"});
  docs.set(JOB_ROOT+"/pending",{status:"pending"});
  const before=structuredClone(docs);
  assert.deepEqual(await inventory.readAttention(),{status:"ok",attentionAtLeast:99,exact:true});
  assert.deepEqual(docs,before);
  docs.set(JOB_ROOT+"/attention-99",{status:"attention"});
  assert.deepEqual(await inventory.readAttention(),{status:"ok",attentionAtLeast:INVENTORY_LIMIT,exact:false});
  docs.set(JOB_ROOT+"/attention-100",{status:"attention"});
  assert.deepEqual(await inventory.readAttention(),{status:"ok",attentionAtLeast:INVENTORY_LIMIT,exact:false});
});
test("attention inventory rejects unsafe environment and redacts read failures",async()=>{
  const db={collection(){throw Error("private user data");}};
  assert.throws(()=>createProvenanceRetentionInventory({db,projectId:"production"}),/unsafe-retention-inventory/);
  const inventory=createProvenanceRetentionInventory({db,projectId:"reflect-ai-staging"});
  assert.deepEqual(await inventory.readAttention(),{status:"unavailable"});
});

test("worker paginates past malformed job IDs without trusting their identity",async()=>{
  const {docs,worker}=fixture();
  for(let i=0;i<10;i++) docs.set(JOB_ROOT+"/!bad-"+i,{status:"pending",uid:"alice",sessionId:"s1",schemaVersion:1});
  const page=await worker.runBatch({diagnostics:true});
  assert.equal(page.failed,10);
  assert.equal(page.nextCursor,"!bad-9");
  assert.equal(page.health.invalidOrStorageFailure,10);
  assert.equal((await worker.runBatch({after:page.nextCursor})).scanned,0);
  assert.ok(docs.get(root+"/turns/u000").provenance);
});
test("private cursor accepts bounded Firestore IDs, not paths or invalid UTF-8",()=>{
  const {validCursor}=require("./provenanceRetentionCursor.cjs");
  for(const value of [null,"!bad-9","a".repeat(1500),"é"]) assert.equal(validCursor(value),true);
  for(const value of [undefined,"","../bad","a/b",".","..","__reserved__","a".repeat(1501),"é".repeat(751),"\ud800",123]) assert.equal(validCursor(value),false);
});

test("scheduler-bound worker denies stale sweep claims before job mutation",async()=>{
  const {SWEEP_PATH}=require("./provenanceRetentionSweepFence.cjs");
  const {randomUUID}=require("node:crypto");
  let time=1000;
  const {docs,worker,service}=fixture(2,()=>time);
  const path=JOB_ROOT+"/"+jobId("alice","s1");
  docs.set(live,{chatHistory:[]});
  await service.revokeAndDeleteSession({sessionId:"s1",confirmed:true},{uid:"alice"});
  const owner=randomUUID(), replacement=randomUUID();
  docs.set(SWEEP_PATH,{schemaVersion:1,leaseOwner:owner,fence:1,leaseUntilMs:2000});
  time=2000;
  const before=structuredClone(docs.get(path));
  assert.equal((await worker.runBatch({sweepClaim:{owner,fence:1}})).failed,1);
  assert.deepEqual(docs.get(path),before);
  docs.set(SWEEP_PATH,{schemaVersion:1,leaseOwner:replacement,fence:2,leaseUntilMs:3000});
  assert.equal((await worker.runBatch({sweepClaim:{owner,fence:1}})).failed,1);
  assert.deepEqual(docs.get(path),before);
  assert.ok(docs.get(root+"/turns/u000").provenance);
  assert.equal((await worker.runBatch({sweepClaim:{owner:replacement,fence:2}})).completed,1);
});
test("scheduler-bound cleanup requires both job attempt and sweep ownership",async()=>{
  const {SWEEP_PATH}=require("./provenanceRetentionSweepFence.cjs");
  const {randomUUID}=require("node:crypto");
  const {db,docs}=fixture();
  const owner=randomUUID(),attemptOwner=randomUUID();
  docs.set(root,{provenanceRevoked:true});
  docs.set(root+"/acceptances/a",{status:"accepted"});
  docs.set(JOB_ROOT+"/"+jobId("alice","s1"),{schemaVersion:1,uid:"alice",sessionId:"s1",status:"pending",attempt:{owner:attemptOwner,untilMs:9000}});
  docs.set(SWEEP_PATH,{schemaVersion:1,leaseOwner:randomUUID(),fence:2,leaseUntilMs:9000});
  const service=createProvenanceRetention({db,projectId:"reflect-ai-staging",deleteField:()=>DELETE,
    clock:()=>1000,workerAttempt:attemptOwner,sweepClaim:{owner,fence:1}});
  await assert.rejects(service.scrubDeletedSession({sessionId:"s1"},{uid:"alice"}),/stale-retention-sweep/);
  await assert.rejects(service.scrubDeletedSessionAcceptances({sessionId:"s1"},{uid:"alice"}),/stale-retention-sweep/);
  assert.ok(docs.get(root+"/turns/u000").provenance);
  assert.ok(docs.has(root+"/acceptances/a"));
});

test("deletion transaction with private gate fails closed and permits idempotent explicit revoke",async()=>{
  const {db,docs}=fixture();
  const {DELETION_FLAG}=require("./provenanceRetention.cjs");
  const service=createProvenanceRetention({db,projectId:"reflect-ai-staging",deleteField:()=>DELETE,requireDeletionFlag:true});
  docs.set(live,{chatHistory:[]});
  const args=[{sessionId:"s1",confirmed:true},{uid:"alice"}];
  await assert.rejects(service.revokeAndDeleteSession(...args),/session-deletion-disabled/);
  assert.ok(docs.has(live));
  assert.ok(!docs.has(JOB_ROOT+"/"+jobId("alice","s1")));
  docs.set(DELETION_FLAG,{enabled:"true"});
  await assert.rejects(service.revokeAndDeleteSession(...args),/session-deletion-disabled/);
  docs.set(DELETION_FLAG,{enabled:true});
  assert.deepEqual(await service.revokeAndDeleteSession(...args),{revoked:true});
  assert.deepEqual(await service.revokeAndDeleteSession(...args),{revoked:true});
  assert.ok(!docs.has(live));
  docs.set(DELETION_FLAG,{enabled:false});
  await assert.rejects(service.revokeAndDeleteSession(...args),/session-deletion-disabled/);
});

const {createSessionDeletionListener,createSessionDeletionComposition,PATH:DELETION_PATH,ORIGIN:DELETION_ORIGIN,APP_ID:DELETION_APP}=require("./provenanceRetentionDeletionHttp.cjs");
function deletionHttpFixture(overrides={}){
  const calls=[];
  const listener=createSessionDeletionListener({
    verifyAuth:async()=>({uid:"alice"}),
    verifyAppCheck:async()=>({appId:DELETION_APP,alreadyConsumed:false}),
    authorizeAccount:async()=>true,rateLimit:async()=>{},
    revoke:async(...args)=>{calls.push(args);return {revoked:true,private:"not public"};},
    ...overrides
  });
  async function invoke({body={confirmed:true,sessionId:"s1"},headers={},method="POST",url=DELETION_PATH}={}){
    const req=require("node:stream").Readable.from([JSON.stringify(body)]);
    Object.assign(req,{method,url,headers:{origin:DELETION_ORIGIN,authorization:"Bearer "+"a".repeat(30),"x-firebase-appcheck":"b".repeat(30),"content-type":"application/json",...headers}});
    let status,output;
    await listener(req,{writeHead(code){status=code;},end(value){output=value?JSON.parse(value):null;}});
    return {status,output};
  }
  return {invoke,calls};
}
test("deletion HTTP binds verified principal and rejects forged body, origin and replay",async()=>{
  const {invoke,calls}=deletionHttpFixture();
  assert.equal((await invoke({body:{confirmed:true,sessionId:"s1",uid:"bob"}})).status,400);
  assert.equal((await invoke({body:{confirmed:false,sessionId:"s1"}})).status,400);
  assert.equal((await invoke({headers:{origin:"https://foreign.invalid"}})).status,403);
  assert.equal((await invoke({method:"OPTIONS"})).status,204);
  assert.equal((await invoke({url:DELETION_PATH+"?x=1"})).status,404);
  assert.equal(calls.length,0);
  assert.deepEqual(await invoke(),{status:200,output:{status:"revoked"}});
  assert.deepEqual(calls,[[{confirmed:true,sessionId:"s1"},{uid:"alice"}]]);
  const replay=deletionHttpFixture({verifyAppCheck:async()=>({appId:DELETION_APP,alreadyConsumed:true})});
  assert.equal((await replay.invoke()).status,401);
  assert.equal(replay.calls.length,0);
});
test("deletion HTTP authorization, quota and errors fail closed; composition defaults off",async()=>{
  assert.equal(createSessionDeletionComposition({projectId:"reflect-ai-staging"}),null);
  assert.throws(()=>createSessionDeletionComposition({projectId:"production"}),/unsafe-deletion-environment/);
  const denied=deletionHttpFixture({authorizeAccount:async()=>false});
  assert.equal((await denied.invoke()).status,403);
  assert.equal(denied.calls.length,0);
  const quota=deletionHttpFixture({rateLimit:async()=>{throw Object.assign(Error("private"),{code:"resource-exhausted"});}});
  assert.equal((await quota.invoke()).status,429);
  assert.equal(quota.calls.length,0);
  const failure=deletionHttpFixture({revoke:async()=>{throw Error("private fixture");}});
  assert.deepEqual(await failure.invoke(),{status:503,output:{error:"unavailable"}});
});

test("privacy quota is independent, durable, bounded and rejects corrupt state",async()=>{
  const {db,docs}=fixture();
  const {DELETION_FLAG}=require("./provenanceRetention.cjs");
  const {createSessionDeletionRuntime,QUOTA_ROOT,LIMIT,WINDOW_MS}=require("./provenanceRetentionDeletionRuntime.cjs");
  let time=1000;
  const make=()=>createSessionDeletionRuntime({db,projectId:"reflect-ai-staging",locallyEnabled:true,clock:()=>time});
  const quota=QUOTA_ROOT+"/alice";
  await assert.rejects(make().rateLimit("alice"),{code:"unavailable"});
  assert.ok(!docs.has(quota));
  docs.set(DELETION_FLAG,{enabled:true});
  for(let i=0;i<LIMIT;i++) await make().rateLimit("alice");
  await assert.rejects(make().rateLimit("alice"),{code:"resource-exhausted"});
  assert.deepEqual(docs.get(quota),{schemaVersion:1,window:0,count:LIMIT});
  assert.equal(await make().rateLimit("bob"),true);
  time=WINDOW_MS;
  await make().rateLimit("alice");
  assert.deepEqual(docs.get(quota),{schemaVersion:1,window:1,count:1});
  time=1000;
  await assert.rejects(make().rateLimit("alice"),{code:"unavailable"});
  await assert.rejects(make().rateLimit("../bob"),{code:"invalid-argument"});
  assert.ok(![...docs.keys()].some(p=>p.includes("goalAcceptanceQuotas")));
});
test("deletion composition uses private quota and atomic flag with no injected quota bypass",async()=>{
  const {db,docs}=fixture();
  const {DELETION_FLAG}=require("./provenanceRetention.cjs");
  const {QUOTA_ROOT}=require("./provenanceRetentionDeletionRuntime.cjs");
  docs.set(live,{chatHistory:[]});
  const listener=createSessionDeletionComposition({db,projectId:"reflect-ai-staging",
    deleteField:()=>DELETE,locallyEnabled:true,clock:()=>1000,
    verifyAuth:async()=>({uid:"alice"}),verifyAppCheck:async()=>({appId:DELETION_APP,alreadyConsumed:false}),
    authorizeAccount:async()=>true});
  const invoke=async()=>{
    const req=require("node:stream").Readable.from(['{"confirmed":true,"sessionId":"s1"}']);
    Object.assign(req,{method:"POST",url:DELETION_PATH,headers:{origin:DELETION_ORIGIN,
      authorization:"Bearer "+"a".repeat(30),"x-firebase-appcheck":"b".repeat(30),"content-type":"application/json"}});
    let status;
    await listener(req,{writeHead(code){status=code;},end(){}});
    return status;
  };
  assert.equal(await invoke(),503);
  assert.ok(docs.has(live));
  docs.set(DELETION_FLAG,{enabled:true});
  assert.equal(await invoke(),200);
  assert.equal(await invoke(),200);
  assert.ok(!docs.has(live));
  assert.deepEqual(docs.get(QUOTA_ROOT+"/alice"),{schemaVersion:1,window:0,count:2});
  assert.equal(docs.get(JOB_ROOT+"/"+jobId("alice","s1")).status,"pending");
  docs.set(DELETION_FLAG,{enabled:false});
  assert.equal(await invoke(),503);
  assert.equal(docs.get(QUOTA_ROOT+"/alice").count,2);
});

test("trusted privacy adapters require revoked-token check, consumed App Check and shared durable replay",async()=>{
  const {createPrivacyAuthAdapters,createTrustedSessionDeletion}=require("./provenanceRetentionDeletionAuth.cjs");
  const projectId="reflect-ai-staging",app={options:{projectId}};
  const records=new Map(),calls=[];
  let result={appId:DELETION_APP,alreadyConsumed:false,token:{exp:2000}};
  let account={uid:"alice",disabled:false,emailVerified:false};
  let sequence=Promise.resolve();
  const db={projectId,doc:path=>({path}),collection:()=>({where(){return this;},limit(){return this;},async get(){return {empty:true};}}),
    batch(){throw Error("unexpected batch");},
    runTransaction(fn){
      const next=sequence.then(()=>fn({get:async ref=>({exists:records.has(ref.path)}),
        create(ref,data){assert.ok(!records.has(ref.path));records.set(ref.path,data);}}));
      sequence=next.catch(()=>{});return next;
    }};
  const auth={app,async verifyIdToken(token,checkRevoked){calls.push([token,checkRevoked]);return {uid:"alice",firebase:{sign_in_provider:"anonymous"}};},
    async getUser(){return account;}};
  const appCheck={app,async verifyToken(token,options){assert.deepEqual(options,{consume:true});return result;}};
  const options={db,projectId,auth,appCheck,clock:()=>1000000};
  const a=createPrivacyAuthAdapters(options);
  assert.equal(createTrustedSessionDeletion({projectId}),null);
  assert.throws(()=>createPrivacyAuthAdapters({...options,projectId:"production"}),/unsafe-privacy-auth-environment/);
  assert.throws(()=>createPrivacyAuthAdapters({...options,appCheck:{...appCheck,app:{options:{projectId:"wrong"}}}}),/unsafe-privacy-auth-environment/);
  const principal=await a.verifyAuth("synthetic-auth");
  assert.deepEqual(calls,[["synthetic-auth",true]]);
  assert.equal(await a.authorizeAccount(principal),true);
  account={uid:"alice",disabled:true};
  assert.equal(await a.authorizeAccount(principal),false);
  account={uid:"bob",disabled:false};
  assert.equal(await a.authorizeAccount(principal),false);
  const token="synthetic-limited-use-token-001";
  const concurrent=await Promise.allSettled([a.verifyAppCheck(token),createPrivacyAuthAdapters(options).verifyAppCheck(token)]);
  assert.equal(concurrent.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(records.size,1);
  const [key,value]=[...records][0];
  assert.match(key,/appCheckReplayTokens\/[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(value).sort(),["createdAt","expiresAt","schemaVersion"]);
  assert.ok(!JSON.stringify([...records]).includes(token));
  result={...result,appId:"wrong"};
  await assert.rejects(a.verifyAppCheck("synthetic-limited-use-token-002"),/invalid-privacy-app-check/);
  result={...result,appId:DELETION_APP,alreadyConsumed:true};
  await assert.rejects(a.verifyAppCheck("synthetic-limited-use-token-003"),/invalid-privacy-app-check/);
  assert.equal(records.size,1);
});
