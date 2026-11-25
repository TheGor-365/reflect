"use strict";
// Candidate only; never registered by createRuntime.
const { APP_ID, ORIGIN } = require("../privacy/provenanceRetentionDeletionHttp.cjs");
const { initializePrivacyFirebaseClients } = require("./privacyFirebaseSdk.cjs");
const { createRuntimeDispatcher, createPrivacyDeletionRoute } = require("./index.cjs");
const PROJECT = "reflect-ai-staging";

async function createPrivacyDispatcherCandidate({
  locallyEnabled = false, projectId, appId, origin, readCredential,
  initializeClients = initializePrivacyFirebaseClients, aiRoute
} = {}) {
  if (typeof locallyEnabled !== "boolean") throw Error("privacy-dispatcher-unavailable");
  if (!locallyEnabled) return null;
  if (projectId !== PROJECT || appId !== APP_ID || origin !== ORIGIN ||
      typeof readCredential !== "function" || typeof initializeClients !== "function" ||
      typeof aiRoute !== "function") throw Error("privacy-dispatcher-unavailable");
  let clients;
  try {
    const raw = await readCredential();
    if (typeof raw !== "string" || !raw || raw.length > 65536) throw Error("invalid");
    const credential = JSON.parse(raw);
    if (credential?.type !== "service_account" || credential.project_id !== PROJECT ||
        typeof credential.client_email !== "string" || !credential.client_email ||
        typeof credential.private_key !== "string" || !credential.private_key) throw Error("invalid");
    clients = await initializeClients({ locallyEnabled: true, projectId, credential });
    if (typeof clients?.dispose !== "function") throw Error("invalid");
    // Keep all existing strict project checks. Unavailable Firestore metadata
    // is a composition failure, not permission to bypass the trusted adapter.
    const deletionRoute = createPrivacyDeletionRoute({
      db: clients.db, auth: clients.auth, appCheck: clients.appCheck,
      deleteField: clients.deleteField, projectId, locallyEnabled: true
    });
    const dispatch = createRuntimeDispatcher({ aiRoute, deletionRoute });
    let disposed = false;
    return Object.freeze({
      dispatch(req, res) {
        if (disposed) {
          res.writeHead(503, {"content-type":"application/json","cache-control":"no-store"});
          return res.end('{"error":"unavailable"}');
        }
        return dispatch(req, res);
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        try { await clients.dispose(); }
        catch { throw Error("privacy-dispatcher-unavailable"); }
      }
    });
  } catch {
    if (typeof clients?.dispose === "function") {
      try { await clients.dispose(); } catch { /* redact cleanup failure */ }
    }
    throw Error("privacy-dispatcher-unavailable");
  }
}
module.exports = { createPrivacyDispatcherCandidate };
