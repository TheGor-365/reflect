"use strict";
// Candidate only: no environment reads, SDK initialization at import, or
// provider credentials. The live runtime activation fence remains in index.cjs.
const { APP_ID, ORIGIN } = require("../privacy/provenanceRetentionDeletionHttp.cjs");
const { createTrustedSessionDeletion } = require("../privacy/provenanceRetentionDeletionAuth.cjs");
const PROJECT = "reflect-ai-staging";
function bootstrapPrivacyDeletion({ locallyEnabled = false, projectId,
  appId, origin, readCredential, initializeClients } = {}) {
  if (typeof locallyEnabled !== "boolean") throw Error("unsafe-privacy-bootstrap");
  if (!locallyEnabled) return null;
  if (projectId !== PROJECT || appId !== APP_ID || origin !== ORIGIN ||
      typeof readCredential !== "function" || typeof initializeClients !== "function")
    throw Error("unsafe-privacy-bootstrap");
  try {
    const raw = readCredential();
    if (typeof raw !== "string" || !raw || raw.length > 65536)
      throw Error("invalid");
    const credential = JSON.parse(raw);
    if (!credential || credential.type !== "service_account" ||
        credential.project_id !== PROJECT ||
        typeof credential.client_email !== "string" || !credential.client_email ||
        typeof credential.private_key !== "string" || !credential.private_key)
      throw Error("invalid");
    const { db, auth, appCheck, deleteField } = initializeClients(credential, PROJECT);
    return createTrustedSessionDeletion({
      db, auth, appCheck, deleteField, projectId: PROJECT, locallyEnabled: true
    });
  } catch {
    // Never expose credential JSON, SDK error messages or account identifiers.
    throw Error("privacy-bootstrap-unavailable");
  }
}
module.exports = { bootstrapPrivacyDeletion };
