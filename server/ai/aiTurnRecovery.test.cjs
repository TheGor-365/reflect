"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiTurnRecovery, validateAttemptPayload,
  validateStatusBody, LEASE_MS } = require("./aiTurnRecovery.cjs");

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
const setup = () => {
  let time = Date.parse("2026-11-13T13:00:00Z");
  const db = new MemoryDb(); db.seed();
  const store = createAiTurnRecovery({
    db, projectId: "reflect-ai-staging", clock: () => time
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
