"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROJECT_ID, NAMESPACE, CONSENT_VERSION, TTL_MS, MAX_GRANTS_PER_DAY, SCOPE,
  parseContextConsentCommand, isActiveContextGrant, createContextConsentStore
} = require("./contextConsent.cjs");

const UID = "owner-verified-account";
const OTHER_UID = "other-verified-account";
const GRANT = "grant-request-00001";
const SESSION = "real-session-id-01";
const START = 1794340000000;
const principal = (uid = UID) => ({
  uid, projectId: PROJECT_ID, appCheckVerified: true
});
const grant = (overrides = {}) => ({
  action: "grant", grantId: GRANT, scope: SCOPE,
  sourceId: SESSION, consentVersion: CONSENT_VERSION, ...overrides
});
const revoke = (grantId = GRANT) => ({ action: "revoke", grantId });
const grantPath = (uid = UID, id = GRANT) =>
  `_reflectAiPrivate/${NAMESPACE}/contextGrants/${uid}/grants/${id}`;
const sessionPath = (uid = UID, id = SESSION) =>
  `artifacts/${NAMESPACE}/users/${uid}/sessions/${id}`;
const quotaPath = (uid = UID) =>
  `_reflectAiPrivate/${NAMESPACE}/contextConsentQuotas/${uid}`;

function fakeFirestore() {
  const state = new Map();
  const reads = [], created = [], updates = [];
  const db = {
    doc(path) {
      if (!path || path.includes("//")) throw Error("invalid Firestore path");
      return {
        path,
        async get() {
          reads.push(path);
          const exists = state.has(path);
          return { exists, data: () => state.get(path) };
        }
      };
    },
    async runTransaction(operation) {
      const pending = [];
      const result = await operation({
        async get(ref) {
          reads.push(ref.path);
          const exists = state.has(ref.path);
          return { exists, data: () => state.get(ref.path) };
        },
        create(ref, data) {
          pending.push(() => {
            if (state.has(ref.path)) throw Error("exists");
            state.set(ref.path, data);
            created.push(ref.path);
          });
        },
        update(ref, fields) {
          pending.push(() => {
            if (!state.has(ref.path)) throw Error("missing");
            state.set(ref.path, { ...state.get(ref.path), ...fields });
            updates.push(ref.path);
          });
        }
      });
      pending.forEach(commit => commit());
      return result;
    }
  };
  return { db, state, reads, created, updates };
}
const build = ({ store = fakeFirestore(), now = START } = {}) => ({
  store, api: createContextConsentStore({
    db: store.db, projectId: PROJECT_ID, clock: () => now
  })
});

test("rejects any unverified principal, foreign project and injected UID", () => {
  for (const identity of [
    undefined, {}, { ...principal(), appCheckVerified: false },
    { ...principal(), projectId: "reflect-8fdc8" },
    { ...principal(), uid: "other/../../owner" }
  ]) {
    assert.throws(() => parseContextConsentCommand(grant(), identity),
      { code: "unauthenticated" });
  }
  assert.throws(() => parseContextConsentCommand({
    ...grant(), uid: OTHER_UID
  }, principal()), { code: "invalid-argument" });
});

test("only a specific session is supported; no all-history, text, paths or extra flags", () => {
  for (const body of [
    grant({ scope: "entire-diary" }),
    grant({ scope: "all-sessions" }),
    grant({ scope: "session-summary" }),
    grant({ sourceId: "*" }),
    grant({ sourceId: "../../goals" }),
    grant({ sourceId: "" }),
    grant({ consentVersion: "outdated" }),
    grant({ autoSave: true }),
    grant({ message: "private note" }),
    { ...revoke(), scope: SCOPE },
    { action: "grant", grantId: GRANT }
  ]) assert.throws(() => parseContextConsentCommand(body, principal()),
    { code: "invalid-argument" });
});

test("does not allow non-staging or non-transactional stores", () => {
  assert.throws(() => createContextConsentStore({
    db: fakeFirestore().db, projectId: "reflect-8fdc8"
  }), { code: "unsafe-environment" });
  assert.throws(() => createContextConsentStore({
    db: { doc() {} }, projectId: PROJECT_ID
  }), { code: "unsafe-environment" });
});

test("missing session does not create private access or read transcript data", async () => {
  const { store, api } = build();
  await assert.rejects(() => api.execute(grant(), principal()),
    { code: "not-found" });
  assert.equal(store.created.length, 0);
  assert.deepEqual(store.reads, [grantPath(), sessionPath()]);
});

test("explicit session-specific grant writes only a private 15-minute record", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), { text: "DO_NOT_READ_THIS_TEXT" });
  const result = await api.execute(grant(), principal());
  assert.deepEqual(result, { status: "active", expiresAtMs: START + TTL_MS });
  assert.deepEqual(store.created, [quotaPath(), grantPath()]);
  assert.deepEqual(store.state.get(quotaPath()), {
    uid: UID, dayKey: Math.floor(START / 86400000), issuedCount: 1
  });
  assert.equal(store.state.get(grantPath()).uid, UID);
  assert.equal(store.state.get(grantPath()).sourceId, SESSION);
  assert.equal(store.state.get(grantPath()).status, "active");
  assert.equal(store.state.get(grantPath()).expiresAtMs - START, TTL_MS);
  assert.equal(JSON.stringify(store.state.get(grantPath())).includes("DO_NOT_READ"), false);
  assert.equal(await api.check({
    uid: UID, grantId: GRANT, scope: SCOPE, sourceId: SESSION
  }), true);
});

test("cross-user and wrong-session permissions fail closed", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), {});
  await api.execute(grant(), principal());
  for (const query of [
    { uid: OTHER_UID, grantId: GRANT, scope: SCOPE, sourceId: SESSION },
    { uid: UID, grantId: GRANT, scope: SCOPE, sourceId: "another-session" },
    { uid: UID, grantId: GRANT, scope: "all", sourceId: SESSION },
    { uid: UID, grantId: "bad", scope: SCOPE, sourceId: SESSION }
  ]) assert.equal(await api.check(query), false);
  await assert.rejects(() => api.execute(grant({
    grantId: "new-grant-0000001"
  }), principal(OTHER_UID)), { code: "not-found" });
});

test("replaying the same grant is idempotent while active", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), {});
  const first = await api.execute(grant(), principal());
  const second = await api.execute(grant(), principal());
  assert.deepEqual(second, first);
  assert.equal(store.created.length, 2);
  assert.equal(store.state.get(quotaPath()).issuedCount, 1);
});

test("reusing grant ID for another session or version fails; never overwrite", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), {});
  store.state.set(sessionPath(UID, "another-session"), {});
  await api.execute(grant(), principal());
  await assert.rejects(() => api.execute(grant({
    sourceId: "another-session"
  }), principal()), { code: "already-exists" });
  assert.equal(store.created.length, 2);
  assert.equal(store.state.get(quotaPath()).issuedCount, 1);
});

test("revoke is idempotent and permanent for the old grant ID", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), {});
  await api.execute(grant(), principal());
  assert.deepEqual(await api.execute(revoke(), principal()), { status: "revoked" });
  assert.deepEqual(await api.execute(revoke(), principal()), { status: "revoked" });
  assert.equal(store.updates.length, 1);
  assert.equal(await api.check({
    uid: UID, grantId: GRANT, scope: SCOPE, sourceId: SESSION
  }), false);
  await assert.rejects(() => api.execute(grant(), principal()),
    { code: "already-exists" });
  assert.equal(store.created.length, 2);
  assert.equal(store.state.get(quotaPath()).issuedCount, 1);
});

test("revoke unknown ID never creates a consent record", async () => {
  const { store, api } = build();
  assert.deepEqual(await api.execute(revoke(), principal()), { status: "revoked" });
  assert.equal(store.state.size, 0);
});

test("expires at 15-minute boundary; stale, forged and malformed records deny", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), {});
  await api.execute(grant(), principal());
  const record = store.state.get(grantPath());
  const expectation = {
    uid: UID, grantId: GRANT, sourceId: SESSION, scope: SCOPE
  };
  assert.equal(isActiveContextGrant(record, { ...expectation, nowMs: START }), true);
  assert.equal(isActiveContextGrant(record, {
    ...expectation, nowMs: START + TTL_MS - 1
  }), true);
  assert.equal(isActiveContextGrant(record, {
    ...expectation, nowMs: START + TTL_MS
  }), false);
  assert.equal(isActiveContextGrant({ ...record, sourceId: "another-session" }, {
    ...expectation, nowMs: START
  }), false);
  assert.equal(isActiveContextGrant({ ...record, expiresAtMs: START + TTL_MS * 20 }, {
    ...expectation, nowMs: START
  }), false);
  assert.equal(isActiveContextGrant({ ...record, revokedAtMs: START + 1 }, {
    ...expectation, nowMs: START + 2
  }), false);
  assert.equal(isActiveContextGrant(null, {
    ...expectation, nowMs: START
  }), false);
});


test("daily issuance cap is per owner, transactional and cannot be refunded by revoke", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), {});
  for (let i = 0; i < MAX_GRANTS_PER_DAY; i += 1) {
    const grantId = `grant-request-${String(i).padStart(8, "0")}`;
    const response = await api.execute(grant({ grantId }), principal());
    assert.equal(response.status, "active");
    if (i === 0) {
      await api.execute(revoke(grantId), principal());
      assert.equal(store.state.get(quotaPath()).issuedCount, 1);
    }
  }
  assert.equal(store.state.get(quotaPath()).issuedCount, MAX_GRANTS_PER_DAY);
  const nextId = "grant-request-nextday-0001";
  await assert.rejects(() => api.execute(grant({ grantId: nextId }), principal()),
    { code: "resource-exhausted" });
  assert.equal(store.state.has(grantPath(UID, nextId)), false);
  // A distinct UID gets a completely separate quota and cannot use owner's session.
  store.state.set(sessionPath(OTHER_UID), {});
  await api.execute(grant(), principal(OTHER_UID));
  assert.equal(store.state.get(quotaPath(OTHER_UID)).issuedCount, 1);
});

test("UTC day boundary renews quota but stale/replayed IDs stay blocked", async () => {
  const store = fakeFirestore();
  store.state.set(sessionPath(), {});
  const first = build({ store, now: START });
  for (let i = 0; i < MAX_GRANTS_PER_DAY; i += 1) {
    await first.api.execute(grant({
      grantId: `grant-request-${String(i).padStart(8, "0")}`
    }), principal());
  }
  const second = build({ store, now: START + 86400000 });
  await second.api.execute(grant({
    grantId: "grant-request-newday-0001"
  }), principal());
  assert.equal(store.state.get(quotaPath()).issuedCount, 1);
  assert.equal(store.state.get(quotaPath()).dayKey,
    Math.floor((START + 86400000) / 86400000));
  await assert.rejects(() => second.api.execute(grant({
    grantId: "grant-request-00000000"
  }), principal()), { code: "already-exists" });
  assert.equal(store.state.get(quotaPath()).issuedCount, 1);
});

test("malformed quota document fails closed before issuing access", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), {});
  store.state.set(quotaPath(), {
    uid: OTHER_UID, dayKey: Math.floor(START / 86400000), issuedCount: -1
  });
  await assert.rejects(() => api.execute(grant(), principal()),
    { code: "invalid-consent-state" });
  assert.equal(store.state.has(grantPath()), false);
  assert.equal(store.created.length, 0);
});

test("private Firestore read failures cannot become permission", async () => {
  const { store, api } = build();
  store.state.set(sessionPath(), {});
  await api.execute(grant(), principal());
  const ref = store.db.doc;
  store.db.doc = path => ({
    ...ref(path),
    async get() { throw Error("PRIVATE_DATABASE_FAILURE"); }
  });
  assert.equal(await api.check({
    uid: UID, grantId: GRANT, sourceId: SESSION, scope: SCOPE
  }), false);
});
