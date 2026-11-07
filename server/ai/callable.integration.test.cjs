"use strict";

/**
 * Stage04C HTTPS integration against the actual Firebase v2 Functions SDK
 * running in a disposable Functions emulator. A synthetic App Check header
 * is accepted by emulator test machinery; it is NOT real attestation proof.
 */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { CONSENT_VERSION, LIMITS } = require("./policy.cjs");
const { STAGE04C_PROJECT, STAGE04C_FIRESTORE_HOST } = require("./firestoreQuota.cjs");

const URL = "http://127.0.0.1:19005/" +
  STAGE04C_PROJECT + "/us-central1/reflectMockReply";
const SIGNUP = "http://127.0.0.1:19097/" +
  "identitytoolkit.googleapis.com/v1/accounts:signUp?key=mock-stage04c-only";
if (process.env.GCLOUD_PROJECT !== STAGE04C_PROJECT ||
    process.env.FIRESTORE_EMULATOR_HOST !== STAGE04C_FIRESTORE_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19097" ||
    process.env.REFLECT_STAGE04C_MOCK_ONLY !== "yes" ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Refusing Stage04C test outside isolated demo");
}
admin.initializeApp({ projectId: STAGE04C_PROJECT });
const db = admin.firestore();
after(async () => admin.app().delete());

const ROOT = db.collection("_reflectStage04B").doc("reflect-8fdc8");
const flag = ROOT.collection("runtimeFlags").doc("ai");
const DAY = "2026-11-07";
const id = n => "stage04c_call_" + String(n).padStart(14, "0");
const data = (n, extras = {}) => ({
  requestId: id(n), message: "Synthetic explicitly selected text",
  consent: { granted: true, version: CONSENT_VERSION, scope: "one-message" },
  ...extras
});

async function signup() {
  const resp = await fetch(SIGNUP, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  });
  assert.equal(resp.ok, true, "Synthetic Auth signup in disposable emulator");
  const json = await resp.json();
  const checked = await admin.auth().verifyIdToken(json.idToken);
  assert.equal(checked.uid, json.localId);
  return json;
}
async function invoke(payload, token = null, appCheck = true) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (appCheck) {
    // Synthetic test-only attestation. Firebase emulator disables actual
    // signature verification; production is explicitly NOT proven here.
    // Formatted but NOT SIGNED for production. Firebase Emulator
    // explicitly skips signature verification; the app_id claim must be
    // present for request.app.appId in the real v2 onCall context.
    const header = Buffer.from(JSON.stringify({
      alg: "none", typ: "JWT"
    })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      app_id: "stage04c-emulator-only-app",
      iss: "https://firebaseappcheck.googleapis.com/" + STAGE04C_PROJECT,
      aud: ["projects/" + STAGE04C_PROJECT],
      sub: "stage04c-emulator-only-app",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString("base64url");
    headers["X-Firebase-AppCheck"] = header + "." + payload + ".synthetic";
  }
  const result = await fetch(URL, {
    method: "POST", headers, body: JSON.stringify({ data: payload }),
    signal: AbortSignal.timeout(18000)
  });
  const body = await result.json();
  return {
    status: result.status,
    code: body?.error?.status,
    response: body?.result
  };
}
async function mustError(title, result, status) {
  assert.equal(result.status, status, title);
  assert.equal(result.response, undefined, title + " must not leak a response");
}
async function mustSucceed(title, result) {
  assert.equal(result.status, 200, title + " must succeed");
  assert.equal(result.response?.mode, "mock");
  assert.match(result.response?.text ?? "", /Настоящий ИИ не подключён/);
}
function ownerDocs() {
  return ROOT.collection("userBudgets");
}

test("real v2 endpoint denies missing App Check even when Auth is valid", async () => {
  const user = await signup();
  await mustError("missing App Check", await invoke(data(1), user.idToken, false), 401);
  assert.equal((await ownerDocs().get()).size, 0);
});

test("real v2 endpoint denies missing Auth even with test App Check header", async () => {
  await mustError("missing Firebase Auth",
    await invoke(data(2)), 401);
  assert.equal((await ownerDocs().get()).size, 0);
});

test("server-owned kill switch defaults OFF and rejects before budget reservation", async () => {
  const user = await signup();
  // Never treat setting an environment variable as permission to spend.
  assert.equal((await flag.get()).exists, false);
  const result = await invoke(data(3), user.idToken);
  await mustError("kill switch missing", result, 503);
  assert.equal((await ownerDocs().get()).size, 0);
});

test("v2 callable with Auth and test App Check succeeds only when switch enabled", async () => {
  const user = await signup();
  await flag.set({ enabled: true });
  const result = await invoke(data(4), user.idToken);
  await mustSucceed("real v2 mock handler", result);
  assert.equal((await ownerDocs().get()).size, 1);
});

test("client cannot spoof UID, history or provider; no quota is reserved", async () => {
  const user = await signup();
  for (const [n, malicious] of [
    [5, { uid: "foreign-synthetic-user" }],
    [6, { chatHistory: ["secret"] }],
    [7, { provider: "external-model" }],
    [8, { consent: { granted: false, version: CONSENT_VERSION,
      scope: "one-message" } }],
    [9, { message: "Z".repeat(LIMITS.maxMessageChars + 1) }]
  ]) {
    await mustError("unsafe client payload " + n,
      await invoke(data(n, malicious), user.idToken), 400);
  }
  // Only previous successful user should have allocated a quota document.
  assert.equal((await ownerDocs().get()).size, 1);
});

test("same synthetic request ID at HTTPS boundary cannot run twice", async () => {
  const user = await signup();
  const attempts = await Promise.allSettled(
    Array.from({ length: 3 }, () => invoke(data(10), user.idToken)));
  const values = attempts.map(r => {
    if (r.status !== "fulfilled") throw r.reason;
    return r.value;
  });
  assert.equal(values.filter(v => v.status === 200).length, 1);
  assert.equal(values.filter(v => v.code === "ALREADY_EXISTS").length, 2);
});

test("direct browser requests to private server quotas remain blocked", async () => {
  const user = await signup();
  const path = ROOT.collection("runtimeFlags").doc("ai").path;
  const endpoint = "http://" + STAGE04C_FIRESTORE_HOST + "/v1/projects/" +
    STAGE04C_PROJECT + "/databases/(default)/documents/" + path;
  const response = await fetch(endpoint, {
    headers: { Authorization: "Bearer " + user.idToken }
  });
  assert.equal(response.status, 403);
});

test("server kill switch disables new calls, keeps committed usage unchanged", async () => {
  const user = await signup();
  const before = await ownerDocs().get();
  await flag.set({ enabled: false });
  const response = await invoke(data(11), user.idToken);
  await mustError("switch OFF", response, 503);
  const afterStop = await ownerDocs().get();
  assert.equal(afterStop.size, before.size);
  await flag.set({ enabled: true });
  const recovered = await invoke(data(12), user.idToken);
  await mustSucceed("switch reenabled in disposable emulator", recovered);
});

test("invalid HTTP body cannot invoke mock provider or spend quota", async () => {
  const before = await ownerDocs().get();
  const resp = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unexpectedField: "disallowed" })
  });
  assert.ok(resp.status >= 400);
  const after = await ownerDocs().get();
  assert.equal(after.size, before.size);
});
