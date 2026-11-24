"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
if (process.env.GCLOUD_PROJECT !== "demo-reflect-r139" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:19381" ||
    process.env.REFLECT_R139_EMULATOR !== "1" ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS) throw Error("unsafe emulator environment");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { createAiTurnRecovery } = require("../ai/aiTurnRecovery.cjs");
const { createProvenanceRetention } = require("./provenanceRetention.cjs");
const app = initializeApp({ projectId: "demo-reflect-r139" });
const db = getFirestore(app);
// Logical staging policy argument; actual SDK target is strictly demo + loopback.
const projectId = "reflect-ai-staging";
const recovery = createAiTurnRecovery({ db, projectId,
  provenance: { key: Buffer.alloc(32, 11), keyId: "synthetic-v1" } });
const retention = createProvenanceRetention({ db, projectId,
  deleteField: () => FieldValue.delete() });
test.after(async () => { await db.terminate(); await deleteApp(app); });

test("R139 real Admin SDK: concurrent reply and atomic deletion cannot resurrect provenance", async () => {
  const uid = "fixture-" + randomUUID(), sessionId = "s1";
  const requestId = "request-fixture-0001", sourceTurnId = "user-" + requestId;
  const message = "Synthetic source";
  const session = db.doc(`artifacts/reflect-8fdc8/users/${uid}/sessions/${sessionId}`);
  const guard = db.doc(`_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`);
  const receipt = guard.collection("turns").doc(sourceTurnId);
  const initial = { chatHistory: [{ id: sourceTurnId, role: "user", content: message }] };
  await session.set(initial);
  const attempt = await recovery.claim({ uid, sessionId, requestId, sourceTurnId,
    message, retryConfirmed: false });
  await recovery.providerStarted(attempt);
  const reply = { text: "Synthetic reply", interaction: {
    version: "reflect.interaction.v1", stage: "synthesize",
    clarifyingQuestion: "", unknowns: [], insights: [], recommendationCandidates: []
  }};
  const [saved, deleted] = await Promise.allSettled([
    recovery.persistReply(attempt, reply),
    retention.revokeAndDeleteSession({ sessionId, confirmed: true }, { uid })
  ]);
  assert.equal(deleted.status, "fulfilled");
  if (saved.status === "rejected") {
    assert.ok(["permission-denied", "not-found"].includes(saved.reason.code));
    await recovery.finishFailed(attempt, { beforeProvider: false });
  }
  assert.equal((await session.get()).exists, false);
  assert.equal((await guard.get()).data().provenanceRevoked, true);
  assert.deepEqual(await retention.revokeAndDeleteSession({ sessionId, confirmed: true }, { uid }), { revoked: true });
  const result = await retention.scrubDeletedSession({ sessionId }, { uid });
  assert.equal(result.nextCursor, null);
  const retained = (await receipt.get()).data();
  assert.equal(retained.provenance, undefined);
  assert.equal(retained.billedPossible, true);
  await session.set(initial);
  await assert.rejects(recovery.persistReply(attempt, reply), e => e.code === "permission-denied");
  await assert.rejects(recovery.claim({ uid, sessionId, requestId, sourceTurnId,
    message, retryConfirmed: false }), e => e.code === "permission-denied");
  assert.equal((await receipt.get()).data().provenance, undefined);
  console.log("R139_C3C2C2B_ADMIN_EMULATOR_PASS");
});
