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
  createContextConsentStore, PROJECT_ID, CONSENT_VERSION, SCOPE, TTL_MS, MAX_GRANTS_PER_DAY
} = require("../../server/privacy/contextConsent.cjs");
const { createSessionContextPreview } = require("../../server/privacy/sessionContextPreview.cjs");
const { createPreviewQuota } = require("../../server/privacy/contextPreviewQuota.cjs");
const { createAppCheckReplayGuard } = require("../../server/railway/appCheckReplayGuard.cjs");
const { createHash } = require("node:crypto");

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
  const quotaPath = `_reflectAiPrivate/${namespace}/contextConsentQuotas/${a.uid}`;
  const previewQuotaPath = `_reflectAiPrivate/${namespace}/contextPreviewQuotas/${a.uid}`;
  await db.doc(ownSession).create({
    title: "Synthetic only",
    chatHistory: [{ content: "NEVER_SEND_THIS_TO_PROVIDER", role: "user" }]
  });
  assert.equal(await rest(ownSession, a.token), 200);
  assert.equal(await rest(ownSession, b.token), 403);

  // The root Rules are deliberately broader than candidate strict field rules;
  // the private consent root MUST still be denied to ALL browser identities.
  assert.equal(await rest(privatePath, a.token), 403);
  assert.equal(await rest(quotaPath, a.token), 403);
  assert.equal(await rest(quotaPath, b.token), 403);
  assert.equal(await rest(previewQuotaPath, a.token), 403);
  assert.equal(await rest(previewQuotaPath, b.token), 403);
  assert.equal(await rest(privatePath, b.token), 403);
  assert.equal(await rest(privatePath, null), 403);
  assert.equal(await rest(privatePath, a.token, "PATCH", {
    status: { stringValue: "active" }
  }), 403);
  assert.equal(await rest(privatePath, b.token, "PATCH", {
    status: { stringValue: "active" }
  }), 403);

  // Real Firestore Emulator transactions: one token must be accepted once
  // across two independently instantiated Railway guards (same private DB).
  // This synthetic token is NOT an actual Firebase App Check credential.
  const mockToken = "synthetic-emulator-app-check-token-00001";
  const mockClaims = {
    alreadyConsumed: false, token: { exp: Math.floor(nowMs / 1000) + 300 }
  };
  const replayA = createAppCheckReplayGuard({
    db, projectId: PROJECT_ID, clock: () => nowMs
  });
  const replayB = createAppCheckReplayGuard({
    db, projectId: PROJECT_ID, clock: () => nowMs
  });
  const firstAndReplay = await Promise.all([
    replayA.consume(mockToken, mockClaims),
    replayB.consume(mockToken, mockClaims)
  ]);
  assert.deepEqual(firstAndReplay.sort(), [false, true]);
  assert.equal(await replayA.consume(mockToken, mockClaims), false);
  const tokenDigest = createHash("sha256").update(mockToken, "utf8").digest("hex");
  const privateReplayPath =
    "_reflectAiPrivate/" + namespace + "/appCheckReplayTokens/" + tokenDigest;
  const replayDoc = await db.doc(privateReplayPath).get();
  assert.equal(replayDoc.exists, true);
  assert.equal(replayDoc.data().expiresAt.toMillis(), mockClaims.token.exp * 1000);
  assert.equal(JSON.stringify(replayDoc.data()).includes(mockToken), false);
  assert.equal(await rest(privateReplayPath, a.token), 403);
  assert.equal(await rest(privateReplayPath, b.token), 403);
  assert.equal(await rest(privateReplayPath, null), 403);

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

  // Privileged, provider-disconnected preview: the actual Admin source read
  // is allowed only with the exact active owner grant. No HTTP endpoint.
  const previewer = createSessionContextPreview({
    db, consentStore: store, projectId: PROJECT_ID
  });
  const preview = await previewer.preview({
    principal, grantId, sourceId: sessionId, scope: SCOPE
  });
  assert.equal(preview.providerDispatchAllowed, false);
  assert.equal(preview.disclosureRequired, true);
  assert.equal(preview.turns.length, 1);
  assert.equal(preview.turns[0].content, "NEVER_SEND_THIS_TO_PROVIDER");
  // The extra read quota stays Admin-private and is per verified owner.
  const quota = createPreviewQuota({ db, projectId: PROJECT_ID, clock: () => nowMs });
  assert.equal(await quota.consume(verifiedA.uid), true);
  assert.equal(await rest(previewQuotaPath, a.token), 403);
  assert.equal(await rest(previewQuotaPath, b.token), 403);
  await assert.rejects(() => previewer.preview({
    principal: { ...principal, uid: verifiedB.uid },
    grantId, sourceId: sessionId, scope: SCOPE
  }), { code: "permission-denied" });
  assert.equal(await rest(privatePath, a.token), 403);
  await store.execute({ action: "revoke", grantId }, principal);
  assert.equal(await store.check({
    uid: verifiedA.uid, grantId, scope: SCOPE, sourceId: sessionId
  }), false);
  assert.deepEqual((await store.list(principal)).grants, []);
  await assert.rejects(() => previewer.preview({
    principal, grantId, sourceId: sessionId, scope: SCOPE
  }), { code: "permission-denied" });
  assert.equal(await rest(privatePath, a.token), 403);

  // The first, now revoked grant still counts toward the 12 grants/day quota.
  for (let i = 1; i < MAX_GRANTS_PER_DAY; i += 1) {
    const issued = await store.execute({
      ...command, grantId: `synthetic-quota-grant-${String(i).padStart(6, "0")}`
    }, principal);
    assert.equal(issued.status, "active");
  }
  await assert.rejects(() => store.execute({
    ...command, grantId: "synthetic-grant-id-overflow"
  }, principal), { code: "resource-exhausted" });
  const issuedQuota = await db.doc(quotaPath).get();
  assert.equal(issuedQuota.data().issuedCount, MAX_GRANTS_PER_DAY);
  assert.equal((await store.list(principal)).grants.length, MAX_GRANTS_PER_DAY - 1);
  assert.equal(await rest(quotaPath, a.token), 403);

  console.log("PASS: synthetic Auth, Firestore replay transactions, owner Rules, Admin grant/revoke, browser denial");
}
main().catch(error => {
  console.error("Context consent emulator QA failed:", error.message);
  process.exitCode = 1;
}).finally(async () => {
  await deleteApp(app);
});
