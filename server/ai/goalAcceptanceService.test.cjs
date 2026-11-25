"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGoalAcceptanceService } = require("./goalAcceptanceService.cjs");
const { createProvenanceKeyring } = require("./recommendationProvenanceKeyring.cjs");

function fixture(accountFenceEnabled = false) {
  const projectId = "reflect-ai-staging", uid = "alice", sessionId = "s1";
  const requestId = "request-fixture-0001", sourceTurnId = "user-" + requestId;
  const assistantTurnId = "assistant-" + requestId;
  const provenance = { activeKeyId: "fixture", keys: [{ keyId: "fixture", key: Buffer.alloc(32, 5) }] };
  const source = { id: sourceTurnId, role: "user", content: "Synthetic source" };
  const answer = { id: assistantTurnId, role: "assistant", sourceTurnId,
    content: "Synthetic reply", interaction: { version: "reflect.interaction.v1",
      stage: "synthesize", clarifyingQuestion: "", unknowns: [], insights: [],
      recommendationCandidates: [{ title: "First step", rationale: "Synthetic reason",
        sourceRefs: ["current-message"] }] } };
  const root = "artifacts/reflect-8fdc8/users/" + uid;
  const privateRoot = "_reflectAiPrivate/reflect-8fdc8/attemptOwners/" + uid + "/sessions/" + sessionId;
  const sessionPath = root + "/sessions/" + sessionId;
  const receiptPath = privateRoot + "/turns/" + sourceTurnId;
  const docs = new Map([["_reflectAiPrivate/reflect-8fdc8/runtimeFlags/goalAcceptance", { enabled: true }], [sessionPath, { chatHistory: [source, answer] }],
    [receiptPath, { uid, sessionId, sourceTurnId, assistantTurnId, requestId,
      status: "persisted_reply", provenance: createProvenanceKeyring(provenance).sign({
        projectId, uid, sessionId, sourceTurnId, assistantTurnId, sourceText: source.content,
        assistantText: answer.content, interaction: answer.interaction
      }) }]]);
  let tail = Promise.resolve();
  const db = { projectId, doc: path => ({ path }), runTransaction(work) {
    const execute = async () => {
      const writes = [];
      const result = await work({
        async get(ref) { const data = docs.get(ref.path); return { exists: docs.has(ref.path),
          data: () => structuredClone(data) }; },
        set(ref, data) { writes.push([ref.path, structuredClone(data)]); },
        update(ref, data) { writes.push([ref.path, { ...docs.get(ref.path), ...structuredClone(data) }]); }
      });
      for (const [path, data] of writes) docs.set(path, data);
      return result;
    };
    const next = tail.then(execute); tail = next.catch(() => {}); return next;
  } };
  const service = createGoalAcceptanceService({ db, projectId, provenance, accountFenceEnabled });
  const body = { sessionId, sourceTurnId, assistantTurnId, candidateIndex: 0, confirmed: true,
    goalTitle: "Owner goal", goalPurpose: "", goalStep: "Owner step", goalCriteria: "Owner criteria" };
  const accept = (patch = {}, principal = { uid }) => service.accept({ ...body, ...patch }, principal);
  return { docs, root, privateRoot, sessionPath, receiptPath, body, accept,
    goals: () => [...docs.keys()].filter(p => p.startsWith(root + "/goals/")),
    acceptances: () => [...docs.keys()].filter(p => p.startsWith(privateRoot + "/acceptances/")) };
}
const denied = (call, code) => assert.rejects(call, e => e.code === code);

test("explicit acceptance atomically records owner goal, decision and private event", async () => {
  const f = fixture(), result = await f.accept();
  assert.equal(result.alreadyAccepted, false);
  assert.equal(f.goals().length, 1);
  assert.equal(f.acceptances().length, 1);
  const goal = f.docs.get(f.goals()[0]);
  assert.equal(goal.text, "Owner goal");
  assert.equal(goal.sourceMessageId, f.body.sourceTurnId);
  const decision = f.docs.get(f.sessionPath).recommendationDecisions["r-" + f.body.assistantTurnId + "-0"];
  assert.equal(decision.goalId, result.goalId);
  const event = f.docs.get(f.acceptances()[0]);
  assert.equal(event.goalId, result.goalId);
  assert.equal(JSON.stringify(event).includes("Owner goal"), false);
  assert.equal(event.provenance, undefined);
});

test("concurrent repeats converge and never overwrite edited goals", async () => {
  const f = fixture();
  const results = await Promise.all([f.accept(), f.accept()]);
  assert.equal(results[0].goalId, results[1].goalId);
  assert.equal(results.filter(x => !x.alreadyAccepted).length, 1);
  f.docs.get(f.goals()[0]).text = "Owner edited";
  assert.equal((await f.accept({ goalTitle: "Other" })).alreadyAccepted, true);
  assert.equal(f.docs.get(f.goals()[0]).text, "Owner edited");
  assert.equal(f.acceptances().length, 1);
});

test("deleted goal is not silently recreated", async () => {
  const f = fixture(); await f.accept(); f.docs.delete(f.goals()[0]);
  await denied(() => f.accept(), "goal-no-longer-exists");
  assert.equal(f.goals().length, 0);
});

test("consent and exact request shape required; foreign owner cannot access source", async () => {
  const f = fixture();
  await denied(() => f.accept({ confirmed: false }), "invalid-argument");
  await denied(() => f.accept({ uid: "alice" }), "invalid-argument");
  await denied(() => f.accept({}, { uid: "bob" }), "invalid-source");
  await denied(() => f.accept({ goalStep: "" }), "invalid-argument");
  assert.equal(f.goals().length, 0);
  assert.equal(f.acceptances().length, 0);
});

test("revoked or tampered source denies acceptance without writes", async () => {
  const f = fixture();
  f.docs.set(f.privateRoot, { provenanceRevoked: true });
  await denied(() => f.accept(), "revoked");
  f.docs.delete(f.privateRoot);
  f.docs.get(f.sessionPath).chatHistory[1].content = "Modified";
  await denied(() => f.accept(), "unverified");
  assert.equal(f.goals().length, 0);
  assert.equal(f.acceptances().length, 0);
});

test("client-created accepted decision is never upgraded to verified event", async () => {
  const f = fixture();
  f.docs.get(f.sessionPath).recommendationDecisions = {
    ["r-" + f.body.assistantTurnId + "-0"]: { status: "accepted", goalId: "fake" }
  };
  await denied(() => f.accept(), "acceptance-conflict");
  assert.equal(f.acceptances().length, 0);
});

 test("final acceptance transaction independently requires enabled private flag", async () => {
  const f = fixture(), flag = "_reflectAiPrivate/reflect-8fdc8/runtimeFlags/goalAcceptance";
  for (const value of [undefined, {enabled:false}, {enabled:"true"}]) {
    if (value === undefined) f.docs.delete(flag); else f.docs.set(flag,value);
    await denied(()=>f.accept(),"unavailable");
    assert.equal(f.goals().length,0); assert.equal(f.acceptances().length,0);
  }
  f.docs.set(flag,{enabled:true});
  assert.equal((await f.accept()).alreadyAccepted,false);
  f.docs.set(flag,{enabled:false});
  await denied(()=>f.accept(),"unavailable");
});

test("enabled account fence blocks goal acceptance and repeat without mutation",async()=>{
 const f=fixture(true),marker="_reflectAiPrivate/reflect-8fdc8/accountRevocations/alice";
 f.docs.set(marker,{});
 const before=structuredClone(f.docs);
 await assert.rejects(f.accept(),/account-revoked/);
 assert.deepEqual(f.docs,before);
 f.docs.delete(marker);
 await f.accept();
 f.docs.set(marker,{});
 const after=structuredClone(f.docs);
 await assert.rejects(f.accept(),/account-revoked/);
 assert.deepEqual(f.docs,after);
});
