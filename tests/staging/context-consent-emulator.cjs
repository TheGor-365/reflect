#!/usr/bin/env node
"use strict";

/**
 * Emulator-only. Synthetic Auth accounts and content, NEVER real Firebase.
 * App Check itself is NOT emulated here. HTTP App Check negative cases are
 * independently tested by contextConsentHttp.test.cjs with injected verifiers.
 */
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
// Resolve Node's package exports from the isolated server workspace.
// Direct filesystem require('firebase-admin/app') bypasses exports resolution.
const serverRequire = createRequire(require.resolve("../../server/package.json"));
const { initializeApp, deleteApp } = serverRequire("firebase-admin/app");
const { getAuth } = serverRequire("firebase-admin/auth");
const { getFirestore } = serverRequire("firebase-admin/firestore");
const {
  createContextConsentStore, PROJECT_ID, CONSENT_VERSION, SCOPE, TTL_MS
} = require("../../server/privacy/contextConsent.cjs");

const DEMO = "demo-reflect-context-consent";
const AUTH = "http://127.0.0.1:19099";
const FIRESTORE = "http://127.0.0.1:19081";
const ROOT = FIRESTORE + "/v1/projects/" + DEMO + "/databases/(default)/documents/";
const namespace = "reflect-8fdc8";
const grantId = "synthetic-grant-id-000001";
const sessionId = "synthetic-session-000001";
const nowMs = 1794340000000;

if (process.env.GCLOUD_PROJECT !== DEMO ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19099" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:19081" ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.REFLECT_FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.REFLECT_XAI_KEY ||
    process.env.REFLECT_CONTEXT_CONSENT_API_ENABLED === "yes") {
  throw Error("STOP: refuse non-ephemeral Firebase/Auth project or private credentials");
}
const app = initializeApp({ projectId: DEMO });
const db = getFirestore(app);

async function createIdentity() {
  const r = await fetch(AUTH + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  });
  assert.equal(r.status, 200, "Auth emulator signUp");
  const value = await r.json();
  assert.ok(value.localId && value.idToken);
  return { uid: value.localId, token: value.idToken };
}
async function rest(path, token, method = "GET", fields) {
  const r = await fetch(ROOT + path, {
    method, headers: {
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(fields ? { "content-type": "application/json" } : {})
    },
    ...(fields ? { body: JSON.stringify({ fields }) } : {}),
    signal: AbortSignal.timeout(12000)
  });
  return r.status;
}
async function main() {
  const a = await createIdentity(), b = await createIdentity();
  assert.notEqual(a.uid, b.uid);
  const auth = getAuth(app);
  const verifiedA = await auth.verifyIdToken(a.token, true);
  const verifiedB = await auth.verifyIdToken(b.token, true);
  assert.equal(verifiedA.uid, a.uid);
  assert.equal(verifiedB.uid, b.uid);
  const ownSession = `artifacts/${namespace}/users/${a.uid}/sessions/${sessionId}`;
  const privatePath = `_reflectAiPrivate/${namespace}/contextGrants/${a.uid}/grants/${grantId}`;
  await db.doc(ownSession).create({
    title: "Synthetic only",
    chatHistory: [{ content: "NEVER_SEND_THIS_TO_PROVIDER", role: "user" }]
  });
  assert.equal(await rest(ownSession, a.token), 200);
  assert.equal(await rest(ownSession, b.token), 403);

  // The root Rules are deliberately broader than candidate strict field rules;
  // the private consent root MUST still be denied to ALL browser identities.
  assert.equal(await rest(privatePath, a.token), 403);
  assert.equal(await rest(privatePath, b.token), 403);
  assert.equal(await rest(privatePath, null), 403);
  assert.equal(await rest(privatePath, a.token, "PATCH", {
    status: { stringValue: "active" }
  }), 403);
  assert.equal(await rest(privatePath, b.token, "PATCH", {
    status: { stringValue: "active" }
  }), 403);

  const store = createContextConsentStore({
    db, projectId: PROJECT_ID, clock: () => nowMs
  });
  const principal = { uid: verifiedA.uid,
    projectId: PROJECT_ID, appCheckVerified: true };
  const command = {
    action: "grant", grantId, scope: SCOPE, sourceId: sessionId,
    consentVersion: CONSENT_VERSION
  };
  const created = await store.execute(command, principal);
  assert.equal(created.status, "active");
  assert.equal(created.expiresAtMs, nowMs + TTL_MS);
  assert.equal(await store.check({
    uid: verifiedA.uid, grantId, scope: SCOPE, sourceId: sessionId
  }), true);
  assert.equal(await store.check({
    uid: verifiedB.uid, grantId, scope: SCOPE, sourceId: sessionId
  }), false);
  const listing = await store.list(principal);
  assert.equal(listing.grants.length, 1);
  assert.equal(listing.grants[0].sourceId, sessionId);
  assert.equal(JSON.stringify(listing).includes("NEVER_SEND_THIS_TO_PROVIDER"), false);
  assert.equal(await rest(privatePath, a.token), 403);
  await store.execute({ action: "revoke", grantId }, principal);
  assert.equal(await store.check({
    uid: verifiedA.uid, grantId, scope: SCOPE, sourceId: sessionId
  }), false);
  assert.deepEqual((await store.list(principal)).grants, []);
  assert.equal(await rest(privatePath, a.token), 403);
  console.log("PASS: real synthetic Auth token, owner-only Rules, Admin grant/revoke, private browser denial");
}
main().catch(error => {
  console.error("Context consent emulator QA failed:", error.message);
  process.exitCode = 1;
}).finally(async () => {
  await deleteApp(app);
});
