"use strict";

/**
 * Stage04C: REAL Firebase Functions v2 onCall wrapper, deployed ONLY into a
 * disposable functions emulator by tests/ai-stage04c/firebase.json.
 * It refuses every non-emulator project and has NO provider, API key, or
 * connection to the owner's Test Firebase project.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  createDemoFirestoreQuota, STAGE04C_PROJECT, STAGE04C_FIRESTORE_HOST
} = require("../../../server/ai/firestoreQuota.cjs");
const { createMockCallable } = require("../../../server/ai/mockCallable.cjs");
const { PolicyError } = require("../../../server/ai/policy.cjs");

const STAGE04C_EXPECTED_APP = "stage04c-emulator-only-app";

const ERROR_CODES = new Set([
  "invalid-argument", "permission-denied", "unauthenticated",
  "already-exists", "resource-exhausted", "deadline-exceeded",
  "unavailable"
]);

function enforceDisposableEnvironment() {
  const local = process.env.FUNCTIONS_EMULATOR === "true" &&
    process.env.GCLOUD_PROJECT === STAGE04C_PROJECT &&
    process.env.FIRESTORE_EMULATOR_HOST === STAGE04C_FIRESTORE_HOST &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:19097" &&
    process.env.REFLECT_STAGE04C_MOCK_ONLY === "yes" &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!local) {
    throw new HttpsError("failed-precondition", "Mock AI disabled.");
  }
}
function safeError(error) {
  const code = error instanceof PolicyError && ERROR_CODES.has(error.code)
    ? error.code : "internal";
  // No messages from provider, Admin SDK or user text escape to clients.
  return new HttpsError(code, "Mock AI request rejected.");
}
function ensureAdmin() {
  if (!admin.apps.length) admin.initializeApp({ projectId: STAGE04C_PROJECT });
  return admin.firestore();
}

// Export is intentionally discoverable only by the demo Firebase CLI.
// App Check enforcement and token parsing are owned by Firebase's v2 SDK.
// For local tests the emulator cannot prove real cryptographic attestation;
// production App Check evaluation remains an explicit separate release gate.
exports.reflectMockReply = onCall({
  region: "us-central1",
  enforceAppCheck: true,
  consumeAppCheckToken: false,
  maxInstances: 1,
  timeoutSeconds: 30
}, async request => {
  enforceDisposableEnvironment();
  if (!request.auth?.uid ||
      request.app?.appId !== STAGE04C_EXPECTED_APP ||
      request.app.alreadyConsumed === true) {
    throw new HttpsError("unauthenticated", "Verified sign-in and App Check required.");
  }
  try {
    const db = ensureAdmin();
    const store = createDemoFirestoreQuota(db);
    const mock = createMockCallable({ store });
    // Auth and App Check are taken only from the v2 SDK's request context.
    // The user cannot place either UID or App Check metadata in request.data.
    return await mock({
      auth: { uid: request.auth.uid },
      app: { appId: request.app.appId, alreadyConsumed: request.app.alreadyConsumed },
      data: request.data
    });
  } catch (error) {
    throw safeError(error);
  }
});
