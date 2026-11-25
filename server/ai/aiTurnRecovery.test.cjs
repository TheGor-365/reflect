"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiTurnRecovery, validateAttemptPayload,
  validateStatusBody, publicState, LEASE_MS } = require("./aiTurnRecovery.cjs");

const UID = "synthetic-eric", SID = "session-eric-abc123";
const ID1 = "request-original-0001", ID2 = "request-retry-0000002";
const TEXT = "Я затягиваю запуск. Можно обсудить следующий шаг?";
const USER_ID = "user-" + ID1;
const sessionPath = uid => `artifacts/reflect-8fdc8/users/${uid}/sessions/${SID}`;
const receiptPath = uid => `_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${SID}/turns/${USER_ID}`;
const clone = obj => structuredClone(obj);

class MemoryDb {
  constructor() { this.docs = new Map(); this.tail = Promise.resolve(); this.reads = []; }
  seed(uid = UID) {
    this.docs.set(sessionPath(uid), {
      chatHistory: [{ id: USER_ID, role: "user", content: TEXT }],
      title: "Затягиваю запуск", ownerUid: uid
    });
  }
  doc(path) {
    const db = this;
    return {
      path, async get() {
        db.reads.push(path);
        const data = db.docs.get(path);
        return { exists: Boolean(data), data: () => clone(data) };
      }
    };
  }
  runTransaction(work) {
    // Synchronous serial commit model: assertions for double-click locking.
    const execute = async () => {
      const writes = [];
      const tx = {
        get: ref => ref.get(),
        set(ref, value) { writes.push(["set", ref.path, clone(value)]); },
        update(ref, value) { writes.push(["update", ref.path, clone(value)]); }
      };
      const result = await work(tx);
      for (const [kind, path, value] of writes) {
        if (kind === "update" && !this.docs.has(path)) throw Error("missing");
        this.docs.set(path, kind === "set" ? value : {
          ...this.docs.get(path), ...value
        });
      }
      return result;
    };
    const next = this.tail.then(execute, execute);
    this.tail = next.catch(() => {});
    return next;
  }
}
const setup = (provenance = null) => {
  let time = Date.parse("2026-11-13T13:00:00Z");
  const db = new MemoryDb(); db.seed();
  const store = createAiTurnRecovery({
    db, projectId: "reflect-ai-staging", clock: () => time, provenance
  });
  return { store, db, tick: ms => { time += ms; } };
};
const params = (requestId = ID1, retryConfirmed = false, uid = UID) => ({
  uid, sessionId: SID, sourceTurnId: USER_ID,
  requestId, message: TEXT, retryConfirmed
});
const forbid = (run, code = "already-exists") =>
  assert.rejects(run, e => e?.code === code);

test("P0: owner-persisted user turn -> single provider attempt -> durable reply + receipt", async () => {
  const { store, db } = setup();
  const attempt = await store.claim(params());
  let status = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
  assert.equal(status.status, "provider_pending");
  assert.equal(status.canRetry, false);
  await store.providerStarted(attempt);
  await store.persistReply(attempt, {
    text: "Достаточно одной проверяемой версии.",
    interaction: { version: "reflect.interaction.v1", stage: "synthesize" }
  });
  status = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
  assert.equal(status.status, "persisted_reply");
  assert.equal(status.billedPossible, true);
  assert.equal(status.canRetry, false);
  assert.equal(status.assistantTurnId, "assistant-" + ID1);
  const turns = db.docs.get(sessionPath(UID)).chatHistory;
  assert.equal(turns.length, 2);
  assert.equal(turns[1].sourceTurnId, USER_ID);
  assert.equal(turns[1].content, "Достаточно одной проверяемой версии.");
  assert.equal(turns[1].interaction.version, "reflect.interaction.v1");
  assert(receiptPath(UID).startsWith("_reflectAiPrivate/reflect-8fdc8/"));
  assert(!receiptPath(UID).startsWith(sessionPath(UID)));
  assert(!JSON.stringify(db.docs.get(receiptPath(UID))).includes(TEXT));
  assert(!JSON.stringify(db.docs.get(receiptPath(UID))).includes("Достаточно одной"));
  await forbid(() => store.claim(params(ID2, true)));
});

test("P0: error after possible provider charge is visible, requires explicit new ID and consent", async () => {
  const { store, db } = setup();
  const first = await store.claim(params());
  await store.providerStarted(first);
  await store.finishFailed(first, { error: { code: "invalid-provider-response" } });
  const old = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
  assert.deepEqual([old.status, old.billedPossible, old.canRetry, old.errorCode],
    ["failed_after_provider", true, true, "invalid-provider-response"]);
  await forbid(() => store.claim(params(ID2, false)), "permission-denied");
  const second = await store.claim(params(ID2, true));
  await store.providerStarted(second);
  await store.persistReply(second, { text: "Восстановленная после явного повтора идея." });
  assert.equal(db.docs.get(sessionPath(UID)).chatHistory.length, 2);
  assert.equal(db.docs.get(sessionPath(UID)).chatHistory.filter(t=>t.role==="user").length, 1);
  assert.equal(db.docs.get(receiptPath(UID)).attemptsCount, 2);
  await forbid(() => store.claim(params(ID2, true)));
});

test("P0: double click / concurrent tabs cannot launch a second pending provider call", async () => {
  const { store } = setup();
  const results = await Promise.allSettled([
    store.claim(params(ID1)),
    store.claim(params(ID2, true))
  ]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(results.filter(x => x.status === "rejected").length, 1);
  const current = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
  assert.equal(current.status, "provider_pending");
  assert.equal(current.canRetry, false);
});

test("P0: in-flight unknown remains locked until lease expires; stale prior cannot overwrite", async () => {
  const { store, tick, db } = setup();
  const original = await store.claim(params());
  await store.providerStarted(original);
  await forbid(() => store.claim(params(ID2, true)));
  tick(LEASE_MS + 1);
  const state = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
  assert.equal(state.status, "outcome_unknown");
  assert.equal(state.billedPossible, true);
  const retry = await store.claim(params(ID2, true));
  await forbid(() => store.persistReply(original, { text: "Поздний ответ" }));
  await store.providerStarted(retry);
  await store.persistReply(retry, { text: "Новая попытка подтверждена" });
  assert.equal(db.docs.get(sessionPath(UID)).chatHistory.length, 2);
  assert(!JSON.stringify(db.docs.get(sessionPath(UID))).includes("Поздний ответ"));
});

test("P0: request rejected BEFORE provider does not carry charge claim", async () => {
  const { store } = setup();
  const attempt = await store.claim(params());
  await store.finishFailed(attempt, { beforeProvider: true,
    error: { code: "resource-exhausted" } });
  const state = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
  assert.equal(state.status, "failed_before_provider");
  assert.equal(state.billedPossible, false);
  assert.equal(state.canRetry, true);
});

test("P0: free status never discloses owner text and denies Jack/Eric crossing", async () => {
  const { store, db } = setup();
  const untracked = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
  assert.deepEqual([untracked.status, untracked.billedPossible, untracked.canRetry],
    ["not_tracked", true, true]); // historical attempt cannot be proven unbilled
  assert.equal(JSON.stringify(untracked).includes(TEXT), false);
  await forbid(() => store.status({ uid: "synthetic-jack",
    sessionId: SID, sourceTurnId: USER_ID }), "not-found");
  assert(db.reads.every(path => !path.startsWith("artifacts/production")));
});

test("P0: unknown/malformed input cannot claim a saved owner message", async () => {
  const { store, db } = setup();
  await forbid(() => store.claim({ ...params(), message: "Подмена текста" }), "permission-denied");
  await forbid(() => store.claim({ ...params(), sourceTurnId: "user-not-matched" }),
    "invalid-argument");
  await forbid(() => store.claim({ ...params(), uid: "../other-user" }),
    "invalid-argument");
  db.docs.get(sessionPath(UID)).chatHistory.push({
    id: "assistant-legacy", role: "assistant", content: "Ответ есть"
  });
  await forbid(() => store.claim(params()), "already-exists");
});

test("P0: strict new request shape never accepts other history, custom model or silent retries", () => {
  const base = { requestId: ID1, message: TEXT,
    consent: { granted: true, version: "2026-11-07", scope: "one-message" },
    sessionId: SID, sourceTurnId: USER_ID };
  assert.equal(validateAttemptPayload(base).retryConfirmed, false);
  assert.equal(validateAttemptPayload({ ...base, retryConfirmed: true }).retryConfirmed, true);
  assert.throws(() => validateAttemptPayload({ ...base, chatHistory: [] }),
    e => e.code === "invalid-argument");
  assert.throws(() => validateAttemptPayload({ ...base, retryConfirmed: false }),
    e => e.code === "invalid-argument");
  assert.deepEqual(validateStatusBody({ sessionId: SID, sourceTurnId: USER_ID }),
    { sessionId: SID, sourceTurnId: USER_ID });
  assert.throws(() => validateStatusBody({ sessionId: SID, sourceTurnId: USER_ID,
    uid: "synthetic-jack" }), e => e.code === "invalid-argument");
});

test("P0: after max explicit attempts, UI cannot offer another paid retry", () => {
  const state = publicState({
    status: "failed_after_provider", billedPossible: true,
    requestId: ID2, attemptsCount: 6, errorCode: "unavailable"
  }, false, Date.now());
  assert.equal(state.status, "failed_after_provider");
  assert.equal(state.canRetry, false);
  assert.equal(state.billedPossible, true);
});

test("P0: upstream 400 or 502 is classified in private receipt without body", async () => {
  const { store, db } = setup();
  const first = await store.claim(params());
  await store.providerStarted(first);
  const error = { code: "unavailable", secretBody: "PRIVATE_GROK_RESPONSE" };
  Object.defineProperty(error, "upstreamHttpStatus", {
    value: 400, enumerable: false
  });
  await store.finishFailed(first, { error });
  const state = await store.status({
    uid: UID, sessionId: SID, sourceTurnId: USER_ID
  });
  assert.equal(state.status, "failed_after_provider");
  assert.equal(state.errorCode, "xai-invalid-request");
  assert.equal(state.canRetry, true);
  assert.equal(JSON.stringify(db.docs.get(receiptPath(UID))).includes("PRIVATE"), false);
});

test("P0: private receipt persists only whitelisted failure stage, never raw output", async () => {
  for (const [stage, expected] of [
    ["incomplete", "xai-response-incomplete"],
    ["envelope", "xai-envelope-invalid"],
    ["interaction-contract", "xai-interaction-invalid"],
    ["transport-shape", "xai-transport-invalid"]
  ]) {
    const { store, db } = setup();
    const attempt = await store.claim(params());
    await store.providerStarted(attempt);
    const error = { code: "invalid-provider-response", output: "SENSITIVE_GROK_DATA" };
    Object.defineProperty(error, "providerFailureStage", {
      value: stage, enumerable: false
    });
    await store.finishFailed(attempt, { error });
    const state = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
    assert.equal(state.status, "failed_after_provider");
    assert.equal(state.errorCode, expected);
    assert.equal(state.billedPossible, true);
    const receipt = db.docs.get(receiptPath(UID));
    assert.equal(receipt.errorCode, expected);
    assert.equal(JSON.stringify(receipt).includes("SENSITIVE"), false);
    assert.equal(JSON.stringify(state).includes("SENSITIVE"), false);
  }
});


test("M4.2: owner committed turn locks chosen mode into one receipt and assistant reply", async () => {
  const { store, db } = setup();
  db.docs.get(sessionPath(UID)).chatHistory[0].interactionMode = "coach";
  const attempt = await store.claim(params());
  assert.equal(attempt.interactionMode, "coach");
  await store.providerStarted(attempt);
  await store.persistReply(attempt, { text: "Проверенный ответ коучинга" });
  const turns = db.docs.get(sessionPath(UID)).chatHistory;
  assert.equal(turns[1].interactionMode, "coach");
  assert.equal(db.docs.get(receiptPath(UID)).interactionMode, undefined);
  assert.equal(JSON.stringify(db.docs.get(receiptPath(UID))).includes(TEXT), false);
});

test("M4.2: tampered/unknown mode blocks receipt before provider and cost", async () => {
  for (const bad of ["admin", "therapist", "unlimited", "", {}, null]) {
    const { store, db } = setup();
    db.docs.get(sessionPath(UID)).chatHistory[0].interactionMode = bad;
    await forbid(() => store.claim(params()), "invalid-session-history");
    assert.equal(db.docs.has(receiptPath(UID)), false);
  }
});

test("M4.2: old owner turn without mode is still compatible with account preference", async () => {
  const { store } = setup();
  const attempt = await store.claim(params());
  assert.equal(attempt.interactionMode, undefined);
});


test("M5b V2: trusted source summary travels in ephemeral owner attempt, NOT private receipt",async()=>{
  const { store, db } = setup();
  const sourceQuote = TEXT.slice(0,20).trim();
  db.docs.get(sessionPath(UID)).readinessEvidence = {
    situation: {
      sourceTurnId: USER_ID, quote: sourceQuote,
      confirmedByOwner:true,status:"confirmed"
    },
    desiredResult: {
      sourceTurnId: USER_ID, quote:"The quote is not actually present",
      confirmedByOwner:true,status:"confirmed"
    }
  };
  const attempt = await store.claim({ ...params(), collectEvidence:true });
  assert.deepEqual(attempt.evidenceSnapshot.confirmedSlots,["situation"]);
  assert.deepEqual(attempt.evidenceSnapshot.missingSlots,[
    "desiredResult","circumstances","constraints"
  ]);
  assert.equal(JSON.stringify(db.docs.get(receiptPath(UID))).includes(TEXT),false);
  assert.equal(db.docs.get(receiptPath(UID)).evidenceSnapshot,undefined);
  await store.providerStarted(attempt);
  await store.persistReply(attempt, {text:"Это допустимый синтетический ответ.",
    interaction:{
      version:"reflect.interaction.v2",stage:"synthesize",
      clarifyingQuestion:"", evidenceClaims:[{
        quote:sourceQuote,sourceRef:"current-message",
        sourceTurnId: USER_ID,
        provenance:"owner-stated-not-independently-verified"
      }],evidenceSummary:{
        confirmedSlots:["situation"],missingSlots:[
          "desiredResult","circumstances","constraints"],
        disputedSlots:[],completeCount:1
      }
    }});
  const turns=db.docs.get(sessionPath(UID)).chatHistory;
  assert.equal(turns[1].interaction.version,"reflect.interaction.v2");
  assert.equal(turns[1].interaction.evidenceSummary.completeCount,1);
  assert.equal(db.docs.get(receiptPath(UID)).interaction,undefined);
});

test("M5b V2: foreign principal cannot sample or claim another owner's evidence",async()=>{
  const { store } = setup();
  await assert.rejects(
    store.claim({ ...params(ID1,false,"synthetic-jack"), collectEvidence:true }),
    error=>error?.code==="not-found"||error?.code==="permission-denied"
  );
});

test("M5b V2: legacy owner claim has zero new private reads and no evidence payload",async()=>{
  const { store }=setup();
  const attempt=await store.claim(params());
  assert.equal(attempt.evidenceSnapshot,undefined);
  assert.equal(attempt.requestId,ID1);
});


const signingKey = Buffer.alloc(32, 19); // synthetic only
const signingOptions = { key: signingKey, keyId: "fixture-key-v1" };
const signedReply = {
  text: "Проверяемый ответ",
  interaction: { version: "reflect.interaction.v1", stage: "synthesize",
    clarifyingQuestion: "", unknowns: [], insights: [],
    recommendationCandidates: [{ title: "Проверить", rationale: "Есть задача",
      sourceRefs: ["current-message"] }] }
};

test("R139 C3c2 opt-in recovery atomically binds the saved reply to exact claimed input", async () => {
  const { verify } = require("./recommendationProvenance.cjs");
  const { store, db } = setup(signingOptions);
  const attempt = await store.claim(params());
  assert.equal(JSON.stringify(attempt).includes(TEXT), false);
  await store.providerStarted(attempt);
  await store.persistReply(attempt, signedReply);
  const receipt = db.docs.get(receiptPath(UID));
  const reply = db.docs.get(sessionPath(UID)).chatHistory[1];
  assert.equal(receipt.provenance.keyId, signingOptions.keyId);
  assert.equal(verify({ projectId: "reflect-ai-staging", uid: UID, sessionId: SID,
    sourceTurnId: USER_ID, assistantTurnId: reply.id, sourceText: TEXT,
    assistantText: reply.content, interaction: reply.interaction },
    receipt.provenance, signingKey), true);
  assert(!JSON.stringify(receipt).includes(TEXT));
  assert(!JSON.stringify(receipt).includes(signedReply.text));
  const status = await store.status({ uid: UID, sessionId: SID, sourceTurnId: USER_ID });
  assert.equal(status.provenance, undefined);
});

test("R139 C3c2 source changed during provider request cannot receive attested reply", async () => {
  const { store, db } = setup(signingOptions);
  const attempt = await store.claim(params());
  await store.providerStarted(attempt);
  db.docs.get(sessionPath(UID)).chatHistory[0].content = "Изменённый текст";
  await forbid(() => store.persistReply(attempt, signedReply), "permission-denied");
  assert.equal(db.docs.get(sessionPath(UID)).chatHistory.length, 1);
  assert.equal(db.docs.get(receiptPath(UID)).provenance, undefined);
});

test("R139 C3c2 copied attempt and duplicate source IDs fail closed", async () => {
  const { store, db } = setup(signingOptions);
  const attempt = await store.claim(params());
  await store.providerStarted(attempt);
  await forbid(() => store.persistReply({ ...attempt }, signedReply), "permission-denied");
  db.docs.get(sessionPath(UID)).chatHistory.unshift({ id: USER_ID, role: "assistant", content: "Дубликат" });
  await forbid(() => store.persistReply(attempt, signedReply), "permission-denied");
  assert.equal(db.docs.get(receiptPath(UID)).provenance, undefined);
});

test("R139 C3c2 default recovery remains unsigned and invalid signing configuration fails", async () => {
  const { store, db } = setup();
  const attempt = await store.claim(params());
  await store.providerStarted(attempt);
  await store.persistReply(attempt, signedReply);
  assert.equal(db.docs.get(receiptPath(UID)).provenance, undefined);
  assert.throws(() => setup({ key: Buffer.alloc(16), keyId: "fixture" }),
    e => e.code === "unsafe-environment");
});


const guardPath = receiptPath(UID).split("/turns/")[0];

test("R139 retention guard denies a new signed claim for a recreated session", async () => {
  const { store, db } = setup(signingOptions);
  db.docs.set(guardPath, { provenanceRevoked: true });
  await forbid(() => store.claim(params()), "permission-denied");
  assert.equal(db.docs.has(receiptPath(UID)), false);
});

test("R139 retention guard denies provider start after revocation", async () => {
  const { store, db } = setup(signingOptions);
  const attempt = await store.claim(params());
  db.docs.set(guardPath, { provenanceRevoked: true });
  await forbid(() => store.providerStarted(attempt), "permission-denied");
  assert.equal(db.docs.get(receiptPath(UID)).billedPossible, false);
  await store.finishFailed(attempt, { beforeProvider: true });
  assert.equal(db.docs.get(receiptPath(UID)).status, "failed_before_provider");
});

test("R139 late reply cannot restore revoked provenance even after session recreation", async () => {
  const { store, db } = setup(signingOptions);
  const attempt = await store.claim(params());
  await store.providerStarted(attempt);
  db.docs.delete(sessionPath(UID));
  db.docs.set(guardPath, { provenanceRevoked: true });
  db.seed();
  await forbid(() => store.persistReply(attempt, signedReply), "permission-denied");
  assert.equal(db.docs.get(sessionPath(UID)).chatHistory.length, 1);
  assert.equal(db.docs.get(receiptPath(UID)).provenance, undefined);
  await store.finishFailed(attempt, { beforeProvider: false });
  assert.equal(db.docs.get(receiptPath(UID)).billedPossible, true);
});

test("R139 malformed private guard fails closed; unsigned legacy path is unchanged", async () => {
  const { store, db } = setup(signingOptions);
  db.docs.set(guardPath, {});
  await forbid(() => store.claim(params()), "permission-denied");
  const legacy = setup();
  legacy.db.docs.set(guardPath, { provenanceRevoked: true });
  const attempt = await legacy.store.claim(params());
  await legacy.store.providerStarted(attempt);
  await legacy.store.persistReply(attempt, signedReply);
  assert.equal(legacy.db.docs.get(receiptPath(UID)).provenance, undefined);
});


test("R139 keyring recovery signs with active key and rotated ring verifies old receipts", async () => {
  const { createProvenanceKeyring } = require("./recommendationProvenanceKeyring.cjs");
  const a = { keyId: "a", key: Buffer.alloc(32, 1) };
  const b = { keyId: "b", key: Buffer.alloc(32, 2) };
  const config = { activeKeyId: "b", keys: [a, b] };
  const { store, db } = setup(config);
  const attempt = await store.claim(params());
  await store.providerStarted(attempt);
  await store.persistReply(attempt, signedReply);
  const receipt = db.docs.get(receiptPath(UID)).provenance;
  const reply = db.docs.get(sessionPath(UID)).chatHistory[1];
  const input = { projectId: "reflect-ai-staging", uid: UID, sessionId: SID,
    sourceTurnId: USER_ID, assistantTurnId: reply.id, sourceText: TEXT,
    assistantText: reply.content, interaction: reply.interaction };
  const ring = createProvenanceKeyring(config);
  assert.equal(receipt.keyId, "b");
  assert.equal(ring.verify(input, receipt), true);
  const old = createProvenanceKeyring({ activeKeyId: "a", keys: [a] }).sign(input);
  assert.equal(ring.verify(input, old), true);
  assert.equal(createProvenanceKeyring({ activeKeyId: "b", keys: [b] }).verify(input, old), false);
});

test("R139 recovery rejects ambiguous and invalid keyring options at construction", () => {
  const a = { keyId: "a", key: Buffer.alloc(32, 1) };
  for (const config of [
    { activeKeyId: "missing", keys: [a] },
    { activeKeyId: "a", keys: [a, a] },
    { activeKeyId: "a", keys: [a], ...a },
    { activeKeyId: "a", keys: [] }
  ]) assert.throws(() => setup(config), e => e.code === "unsafe-environment");
});

test("R139 rotated recovery configuration still honors private revocation", async () => {
  const { store, db } = setup({ activeKeyId: "b", keys: [
    { keyId: "a", key: Buffer.alloc(32, 1) },
    { keyId: "b", key: Buffer.alloc(32, 2) }
  ] });
  const attempt = await store.claim(params());
  await store.providerStarted(attempt);
  db.docs.set(guardPath, { provenanceRevoked: true });
  await forbid(() => store.persistReply(attempt, signedReply), "permission-denied");
  assert.equal(db.docs.get(receiptPath(UID)).provenance, undefined);
});
