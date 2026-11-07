"use strict";

/**
 * Stage04B isolated integration. Uses ONLY the demo Auth 19098 and
 * Firestore 19082; does not load any owner's archived data or credentials.
 */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { CONSENT_VERSION, LIMITS, PolicyError } = require("./policy.cjs");
const { createMockCallable, estimateInputTokens } = require("./mockCallable.cjs");
const { createDemoFirestoreQuota, DEMO_PROJECT, FIRESTORE_HOST } =
  require("./firestoreQuota.cjs");

const NOW = Date.parse("2026-11-07T12:00:00Z");
if (process.env.GCLOUD_PROJECT !== DEMO_PROJECT ||
    process.env.FIRESTORE_EMULATOR_HOST !== FIRESTORE_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19098" ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Stage04B integrations MUST run only in a disposable emulator");
}
admin.initializeApp({ projectId: DEMO_PROJECT });
const db = admin.firestore();
const store = createDemoFirestoreQuota(db);
after(async () => admin.app().delete());

const id = num => "stage04b_request_" + String(num).padStart(12, "0");
const req = (uid, num = 1, message = "Synthetic user-selected private text") => ({
  auth: uid ? { uid } : null,
  app: { appId: "synthetic-attestation" },
  data: {
    requestId: id(num), message,
    consent: { granted: true, version: CONSENT_VERSION, scope: "one-message" }
  }
});
const policyReason = code => error => error instanceof PolicyError &&
  error.code === code && error.message === "AI request rejected by server policy.";
const create = (options = {}) => createMockCallable({
  store, clock: () => NOW, ...options
});

test("injected Admin Firestore client must match isolated demo project", () => {
  assert.throws(() => createDemoFirestoreQuota({
    projectId: "some-other-project",
    runTransaction: async () => {},
    collection: () => {}
  }), policyReason("unsafe-environment"));
});

test("Auth Emulator can recover and validate a real synthetic ID token; client cannot read quota", async () => {
  const response = await fetch(
    "http://127.0.0.1:19098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-only", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true })
    }
  );
  assert.equal(response.ok, true);
  const created = await response.json();
  const verified = await admin.auth().verifyIdToken(created.idToken);
  assert.equal(verified.uid, created.localId);
  const callable = create();
  const result = await callable(req(verified.uid, 101));
  assert.equal(result.mode, "mock");
  assert.match(result.text, /Настоящий ИИ не подключён/);

  const { user, ledger } = store.testRefs(verified.uid, id(101), NOW);
  const publicRead = await fetch(
    "http://" + FIRESTORE_HOST + "/v1/projects/" + DEMO_PROJECT +
      "/databases/(default)/documents/" + user.path,
    { headers: { Authorization: "Bearer " + created.idToken } }
  );
  assert.equal(publicRead.status, 403);
  const publicLedger = await fetch(
    "http://" + FIRESTORE_HOST + "/v1/projects/" + DEMO_PROJECT +
      "/databases/(default)/documents/" + ledger.path,
    { headers: { Authorization: "Bearer " + created.idToken } }
  );
  assert.equal(publicLedger.status, 403);
});

test("missing Auth, App Check, consumed token or explicit consent fail before reservation", async () => {
  let providerCalls = 0;
  const callable = create({ responder: async () => {
    providerCalls++;
    return { text: "Mock" };
  } });
  const u = "synthetic-invalid";
  for (const malformed of [
    { ...req(u, 201), auth: null },
    { ...req(u, 202), app: null },
    { ...req(u, 203), app: { appId: "synthetic-attestation", alreadyConsumed: true } },
    { ...req(u, 204), data: { ...req(u, 204).data, consent: { granted: false } } },
    { ...req(u, 205), data: { ...req(u, 205).data, history: ["not-allowed"] } }
  ]) {
    await assert.rejects(callable(malformed), error =>
      error instanceof PolicyError && error.message ===
        "AI request rejected by server policy.");
  }
  assert.equal(providerCalls, 0);
  const user = await store.testRefs(u, id(201), NOW).user.get();
  assert.equal(user.exists, false);
});

test("parallel same-ID requests commit once, invoke responder exactly once", async () => {
  const uid = "synthetic-concurrent";
  let calls = 0;
  const callable = create({ responder: async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 35));
    return { text: "Synthetic response" };
  } });
  const results = await Promise.allSettled([
    callable(req(uid, 301)), callable(req(uid, 301))
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.equal(calls, 1);
  const rejected = results.find(r => r.status === "rejected").reason;
  assert.equal(rejected.code, "already-exists");
  const { user, ledger } = store.testRefs(uid, id(301), NOW);
  assert.equal((await user.get()).data().count, 1);
  assert.equal((await ledger.get()).data().status, "completed");
});

test("rolling minute rate cap rejects third request after two committed reservations", async () => {
  const uid = "synthetic-minute-cap";
  const callable = create();
  await callable(req(uid, 401));
  await callable(req(uid, 402));
  await assert.rejects(callable(req(uid, 403)), policyReason("resource-exhausted"));
  assert.equal((await store.testRefs(uid, id(401), NOW).user.get()).data().count, 2);
});

test("project-wide budget is atomic across two simultaneous independent UIDs", async () => {
  const message = "Synthetic global quota";
  const charged = estimateInputTokens(message) + LIMITS.maxOutputTokens;
  const day = store.testRefs("any-synthetic", id(1), NOW).project;
  await day.set({ day: "2026-11-07",
    reservedTokens: LIMITS.maxGlobalTokensPerUtcDay - charged });
  let providerCalls = 0;
  const callable = create({ responder: async () => {
    providerCalls++;
    return { text: "Mock" };
  } });
  const results = await Promise.allSettled([
    callable(req("global-owner-A", 501, message)),
    callable(req("global-owner-B", 502, message))
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(providerCalls, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code,
    "resource-exhausted");
  assert.equal((await day.get()).data().reservedTokens,
    LIMITS.maxGlobalTokensPerUtcDay);
  // Reset isolated demo budget only after this single synthetic test. It
  // never shares a project with the owner's live QA or other CI jobs.
  await day.set({ day: "2026-11-07", reservedTokens: 0 });
});

test("replay ledger blocks same request ID even when UTC date changes", async () => {
  const uid = "synthetic-across-day";
  let time = NOW;
  const callable = create({ clock: () => time });
  await callable(req(uid, 601));
  time = NOW + 86400000;
  await assert.rejects(callable(req(uid, 601)), policyReason("already-exists"));
  await callable(req(uid, 602));
  const old = store.testRefs(uid, id(601), NOW).ledger;
  assert.equal((await old.get()).data().status, "completed");
  const newUser = store.testRefs(uid, id(602), time).user;
  assert.equal((await newUser.get()).data().count, 1);
});

test("mock timeout consumes quota, never retries or returns input text", async () => {
  const uid = "synthetic-timeout";
  const secret = "PRIVATE_SYNTHETIC_USER_TEXT_FOR_PRIVACY_CHECK";
  let calls = 0;
  const callable = create({
    timeoutMs: 35,
    responder: () => {
      calls++;
      return new Promise(() => {});
    }
  });
  await assert.rejects(callable(req(uid, 701, secret)),
    policyReason("deadline-exceeded"));
  assert.equal(calls, 1);
  await assert.rejects(callable(req(uid, 701, secret)),
    policyReason("already-exists"));
  const { ledger, user, project } = store.testRefs(uid, id(701), NOW);
  assert.equal((await ledger.get()).data().status, "failed");
  assert.equal((await user.get()).data().count, 1);
  assert.ok((await project.get()).data().reservedTokens > 0);
  for (const snapshot of [await ledger.get(), await user.get(), await project.get()]) {
    const stored = JSON.stringify(snapshot.data());
    assert.equal(stored.includes(secret), false);
    assert.equal(stored.includes(uid), false);
  }
});

test("provider failure and malformed response fail closed, no private error leak", async () => {
  const uid = "synthetic-provider-failure";
  const privateMessage = "PRIVATE_SYNTHETIC_TEXT";
  const callable = create({
    responder: async () => { throw new Error("secret:" + privateMessage); }
  });
  await assert.rejects(callable(req(uid, 801, privateMessage)),
    policyReason("unavailable"));
  assert.equal((await store.testRefs(uid, id(801), NOW).ledger.get()).data().status,
    "failed");
  const brokenReply = create({ responder: async () =>
    ({ text: "", rawToolCall: "not-permitted" }) });
  await assert.rejects(brokenReply(req(uid, 802)), policyReason("invalid-provider-response"));
  assert.equal((await store.testRefs(uid, id(802), NOW).ledger.get()).data().status,
    "failed");
});

test("pre-filled daily count rejects new provider operation", async () => {
  const uid = "synthetic-day-cap";
  const { user, ledger } = store.testRefs(uid, id(901), NOW);
  await user.set({
    day: "2026-11-07", count: LIMITS.maxPerUtcDay,
    reservedTokens: 2000, recent: [], ids: []
  });
  let called = false;
  const callable = create({ responder: async () => {
    called = true;
    return { text: "Mock" };
  } });
  await assert.rejects(callable(req(uid, 901)), policyReason("resource-exhausted"));
  assert.equal(called, false);
  assert.equal((await ledger.get()).exists, false);
});
