"use strict";
// R139 candidate only. Never imported by the live runtime. No SDK, credentials,
// environment, ADC, provider or network access at module import.
const PROJECT = "reflect-ai-staging";
const APP_NAME = "reflect-r139-privacy-staging";

function validateEnvironment(env) {
  if (!env || typeof env !== "object") return false;
  // Emulator redirects must be a separate, explicit demo-only composition.
  for (const key of [
    "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST",
    "FIREBASE_APPCHECK_DEBUG_TOKEN", "FIREBASE_STORAGE_EMULATOR_HOST",
    "FIREBASE_CONFIG"
  ]) {
    if (env[key]) return false;
  }
  return ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID"]
    .every(key => !env[key] || env[key] === PROJECT);
}

function validateCredential(value) {
  return value && Object.getPrototypeOf(value) === Object.prototype &&
    value.type === "service_account" && value.project_id === PROJECT &&
    typeof value.client_email === "string" && value.client_email.length > 0 &&
    typeof value.private_key === "string" && value.private_key.length > 0 &&
    JSON.stringify(value).length <= 65536;
}

function loadFirebaseAdminSdk() {
  // Lazy loading is intentional: no SDK initialization in the OFF state.
  return {
    app: require("firebase-admin/app"),
    auth: require("firebase-admin/auth"),
    appCheck: require("firebase-admin/app-check"),
    firestore: require("firebase-admin/firestore")
  };
}

// Async cleanup is required if any SDK client fails after initializeApp.
// This isolated initializer is deliberately NOT wired into the synchronous
// bootstrapPrivacyDeletion or createRuntime; that is a separate review gate.
async function initializePrivacyFirebaseClients({
  locallyEnabled = false, projectId, credential,
  env = process.env, loadSdk = loadFirebaseAdminSdk
} = {}) {
  if (typeof locallyEnabled !== "boolean") throw Error("privacy-sdk-unavailable");
  if (!locallyEnabled) return null;
  let validated = false;
  try {
    validated = projectId === PROJECT && validateEnvironment(env) &&
      validateCredential(credential) && typeof loadSdk === "function";
  } catch { /* Malformed/cyclic credential or hostile environment: fail closed. */ }
  if (!validated) throw Error("privacy-sdk-unavailable");

  let app = null;
  let sdk = null;
  try {
    sdk = loadSdk();
    if (typeof sdk?.app?.getApps !== "function" ||
        typeof sdk.app.initializeApp !== "function" ||
        typeof sdk.app.cert !== "function" ||
        typeof sdk.app.deleteApp !== "function" ||
        typeof sdk.auth?.getAuth !== "function" ||
        typeof sdk.appCheck?.getAppCheck !== "function" ||
        typeof sdk.firestore?.getFirestore !== "function" ||
        typeof sdk.firestore?.FieldValue?.delete !== "function") {
      throw Error("invalid-sdk");
    }
    // Do not borrow any default/other app. Never delete a pre-existing app.
    if (sdk.app.getApps().some(existing => existing?.name === APP_NAME)) {
      throw Error("duplicate-sdk-app");
    }
    app = sdk.app.initializeApp({
      credential: sdk.app.cert(credential), projectId: PROJECT
    }, APP_NAME);
    if (app?.name !== APP_NAME || app?.options?.projectId !== PROJECT) {
      throw Error("wrong-sdk-app");
    }
    const auth = sdk.auth.getAuth(app);
    const appCheck = sdk.appCheck.getAppCheck(app);
    const db = sdk.firestore.getFirestore(app);
    if (auth?.app !== app || appCheck?.app !== app ||
        db?.projectId !== PROJECT || typeof db.doc !== "function" ||
        typeof db.collection !== "function" ||
        typeof db.runTransaction !== "function" ||
        typeof db.batch !== "function") {
      throw Error("cross-project-sdk-client");
    }
    let disposed = false;
    return Object.freeze({
      db, auth, appCheck,
      deleteField: () => sdk.firestore.FieldValue.delete(),
      async dispose() {
        if (disposed) return;
        disposed = true;
        try { await sdk.app.deleteApp(app); }
        catch { throw Error("privacy-sdk-dispose-unavailable"); }
      }
    });
  } catch {
    if (app && sdk?.app?.deleteApp) {
      try { await sdk.app.deleteApp(app); } catch { /* fail closed */ }
    }
    // Never reveal SDK error, environment values or credentials.
    throw Error("privacy-sdk-unavailable");
  }
}

module.exports = { initializePrivacyFirebaseClients };
