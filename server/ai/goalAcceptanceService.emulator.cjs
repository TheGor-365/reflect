"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
if (process.env.GCLOUD_PROJECT !== "demo-reflect-r139" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:19381" ||
    process.env.REFLECT_R139_EMULATOR !== "1" ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS) throw Error("unsafe emulator environment");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createAiTurnRecovery } = require("./aiTurnRecovery.cjs");
const { createGoalAcceptanceService } = require("./goalAcceptanceService.cjs");
const app = initializeApp({ projectId: "demo-reflect-r139" });
const db = getFirestore(app);
const projectId = "reflect-ai-staging"; // logical policy; actual SDK is demo only
const provenance = { activeKeyId: "synthetic-v1",
  keys: [{ keyId: "synthetic-v1", key: Buffer.alloc(32, 23) }] };
const recovery = createAiTurnRecovery({ db, projectId, provenance });
const service = createGoalAcceptanceService({ db, projectId, provenance });
test.after(async () => { await db.terminate(); await deleteApp(app); });

async function fixture() {
  const uid = "fixture-" + randomUUID(), sessionId = "s1";
  const requestId = "request-fixture-0001", sourceTurnId = "user-" + requestId;
  const message = "Synthetic source";
  const root = db.doc("artifacts/reflect-8fdc8/users/" + uid);
  const session = root.collection("sessions").doc(sessionId);
  const guard = db.doc("_reflectAiPrivate/reflect-8fdc8/attemptOwners/" + uid + "/sessions/" + sessionId);
  await session.set({ ownerUid: uid,
    chatHistory: [{ id: sourceTurnId, role: "user", content: message }] });
  const attempt = await recovery.claim({ uid, sessionId, sourceTurnId, requestId,
    message, retryConfirmed: false });
  await recovery.providerStarted(attempt);
  const assistantTurnId = await recovery.persistReply(attempt, {
    text: "Synthetic reply", interaction: { version: "reflect.interaction.v1",
      stage: "synthesize", clarifyingQuestion: "", unknowns: [], insights: [],
      recommendationCandidates: [{ title: "First step", rationale: "Synthetic reason",
        sourceRefs: ["current-message"] }] }
  });
  const body = { sessionId, sourceTurnId, assistantTurnId, candidateIndex: 0,
    confirmed: true, goalTitle: "Owner goal", goalPurpose: "",
    goalStep: "Owner step", goalCriteria: "Owner criteria" };
  return { uid, body, root, session, guard,
    accept: (patch = {}, principal = { uid }) => service.accept({ ...body, ...patch }, principal) };
}

test("real Admin SDK concurrent accepts converge to one goal and one private event", async () => {
  const f = await fixture();
  const [a,b] = await Promise.all([f.accept(), f.accept()]);
  assert.equal(a.goalId, b.goalId);
  assert.equal([a,b].filter(x => !x.alreadyAccepted).length, 1);
  const goals = await f.root.collection("goals").get();
  const events = await f.guard.collection("acceptances").get();
  assert.equal(goals.size, 1);
  assert.equal(events.size, 1);
  const goal = goals.docs[0];
  assert.equal(goal.id, a.goalId);
  assert.equal(goal.data().sourceMessageId, f.body.sourceTurnId);
  assert.equal(events.docs[0].data().goalId, a.goalId);
  assert.equal(events.docs[0].data().provenance, undefined);
  const session = (await f.session.get()).data();
  assert.equal(session.recommendationDecisions["r-" + f.body.assistantTurnId + "-0"].goalId, a.goalId);
  await goal.ref.update({ text: "Owner edit" });
  assert.equal((await f.accept()).alreadyAccepted, true);
  assert.equal((await goal.ref.get()).data().text, "Owner edit");
  await goal.ref.delete();
  await assert.rejects(f.accept(), e => e.code === "goal-no-longer-exists");
  assert.equal((await f.root.collection("goals").get()).size, 0);
});

test("real Admin SDK rejects foreign, revoked and modified source without acceptance writes", async () => {
  const f = await fixture();
  await assert.rejects(f.accept({}, { uid: "foreign-" + randomUUID() }), e => e.code === "invalid-source");
  await f.guard.set({ provenanceRevoked: true });
  await assert.rejects(f.accept(), e => e.code === "revoked");
  // Synthetic characterization only: removing the fixture guard to test tampering independently.
  await f.guard.delete();
  const data = (await f.session.get()).data();
  data.chatHistory[1].content = "Tampered";
  await f.session.update({ chatHistory: data.chatHistory });
  await assert.rejects(f.accept(), e => e.code === "unverified");
  assert.equal((await f.root.collection("goals").get()).size, 0);
  assert.equal((await f.guard.collection("acceptances").get()).size, 0);
  assert.equal((await f.session.get()).data().recommendationDecisions, undefined);
});

test("real Admin SDK abort after queued service writes rolls back all three documents", async () => {
  const f = await fixture();
  const abortingDb = { doc: path => db.doc(path),
    runTransaction: work => db.runTransaction(async tx => {
      await work(tx);
      throw Error("synthetic-abort-before-commit");
    }) };
  const aborting = createGoalAcceptanceService({ db: abortingDb, projectId, provenance });
  await assert.rejects(aborting.accept(f.body, { uid: f.uid }), /synthetic-abort-before-commit/);
  assert.equal((await f.root.collection("goals").get()).size, 0);
  assert.equal((await f.guard.collection("acceptances").get()).size, 0);
  assert.equal((await f.session.get()).data().recommendationDecisions, undefined);
  assert.equal((await f.accept()).alreadyAccepted, false);
  console.log("R139_C3C3B2_ADMIN_ACCEPTANCE_PASS");
});
