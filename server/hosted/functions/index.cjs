"use strict";

/**
 * Stage04G: deployable ONLY to an explicitly approved separate
 * reflect-ai-stage-* Firebase project. No production or demo fallback.
 * Do not enable or deploy until the owner has configured a real signed
 * App Check web app, spending limits and a separate secret.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createHostedHandler } = require("./lib/hostedHandler.cjs");
const { STAGING_ID } = require("./lib/hostedBudget.cjs");
const { PolicyError } = require("./lib/policy.cjs");

const XAI_KEY = defineSecret("REFLECT_XAI_KEY");
const ERROR_CODES = new Set([
  "unauthenticated", "invalid-argument", "permission-denied",
  "already-exists", "resource-exhausted", "unavailable"
]);

function verifyStaging() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
  const approved = process.env.REFLECT_AI_APPROVED_PROJECT || "";
  const appId = process.env.REFLECT_AI_APP_CHECK_APP_ID || "";
  if (process.env.FUNCTIONS_EMULATOR === "true" ||
      !STAGING_ID.test(projectId) ||
      approved !== projectId ||
      process.env.REFLECT_AI_ENABLED !== "yes" ||
      !/^1:[0-9]+:web:[A-Za-z0-9]+$/.test(appId)) {
    throw new HttpsError("failed-precondition", "Reflect AI is disabled.");
  }
  return { projectId, appId };
}

exports.reflectAiReply = onCall({
  region: "us-central1",
  enforceAppCheck: true,
  consumeAppCheckToken: true,
  secrets: [XAI_KEY],
  maxInstances: 2,
  concurrency: 2,
  timeoutSeconds: 45,
  memory: "256MiB"
}, async request => {
  // SDK verifies signed App Check, Auth and limited-use token before handler.
  const { projectId, appId } = verifyStaging();
  if (!request.auth?.uid ||
      request.app?.appId !== appId ||
      request.app?.alreadyConsumed === true) {
    throw new HttpsError("unauthenticated", "Verified sign-in and App Check required.");
  }
  try {
    if (!getApps().length) initializeApp({ projectId });
    const db = getFirestore();
    const handle = createHostedHandler({
      db, projectId, appId,
      readSecret: () => XAI_KEY.value(),
      transport: fetch
    });
    return await handle({
      auth: { uid: request.auth.uid },
      app: {
        appId: request.app.appId,
        alreadyConsumed: request.app.alreadyConsumed
      },
      data: request.data
    });
  } catch (error) {
    // Never return Firebase internals, user messages or provider bodies.
    const code = error instanceof PolicyError && ERROR_CODES.has(error.code)
      ? error.code : "internal";
    throw new HttpsError(code, "Reflect AI request was not completed.");
  }
});
