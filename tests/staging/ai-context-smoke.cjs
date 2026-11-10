#!/usr/bin/env node
"use strict";
/**
 * AI-01B.3: fully synthetic Firestore Rules integration, no network/prod data.
 * Uses the independent Stage03H emulator and genuine Auth-issued bearer tokens.
 */
const PROJECT = "demo-reflect-stage03h-rules";
const AUTH = "http://127.0.0.1:19099";
const BASE = "http://127.0.0.1:19081/v1/projects/" + PROJECT +
  "/databases/(default)/documents/";
const assertDemo = () => {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19099" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:19081" ||
      process.env.GCLOUD_PROJECT !== PROJECT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("Refusing AI policy tests outside an isolated demo emulator");
  }
};
const string = value => ({ stringValue: value });
const bool = value => ({ booleanValue: value });
const integer = value => ({ integerValue: String(value) });
const list = values => ({ arrayValue: { values } });
const timestamp = value => ({ timestampValue: value });
const preferences = (extra = {}) => ({
  schemaVersion: integer(1),
  responseDepth: string("balanced"),
  responseTone: string("analytical"),
  askClarifyingQuestions: bool(true),
  recommendationsEnabled: bool(false),
  autoSaveRecommendations: bool(false),
  recommendationFrequency: string("rare"),
  showContextIndicator: bool(false),
  updatedAt: timestamp("2026-11-10T00:00:00Z"),
  ...extra
});
async function newIdentity() {
  const response = await fetch(AUTH +
    "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=isolated-demo", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Synthetic Auth signup failed");
  const result = await response.json();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(result.localId) || !result.idToken)
    throw new Error("Invalid demo identity");
  return { uid: result.localId, token: result.idToken };
}
async function operation(path, method = "GET", token = null, fields = null, mask = []) {
  const url = new URL(BASE + path);
  for (const key of mask) url.searchParams.append("updateMask.fieldPaths", key);
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (fields) headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method, headers, body: fields ? JSON.stringify({ fields }) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  return { status: response.status, data: response.ok ? await response.json() : null };
}
function expectStatus(label, response, code) {
  if (response.status !== code)
    throw new Error(label + ": expected HTTP " + code + ", received " + response.status);
  process.stdout.write("PASS: " + label + "\n");
}
async function main() {
  assertDemo();
  const alice = await newIdentity();
  const bob = await newIdentity();
  if (alice.uid === bob.uid) throw new Error("Synthetic accounts not isolated");
  const root = "artifacts/reflect-8fdc8/users/" + alice.uid + "/";
  const settings = root + "aiSettings/preferences";
  const grant = root + "aiContextGrants/synthetic_grant1";
  const fakeText = string("Never read my entire diary unless explicitly granted");

  expectStatus("owner creates schema-valid settings",
    await operation(settings, "PATCH", alice.token, preferences()), 200);
  expectStatus("owner reads own settings",
    await operation(settings, "GET", alice.token), 200);
  expectStatus("stranger cannot read settings",
    await operation(settings, "GET", bob.token), 403);
  expectStatus("anonymous cannot read settings",
    await operation(settings), 403);
  expectStatus("stranger cannot replace settings",
    await operation(settings, "PATCH", bob.token, preferences()), 403);

  expectStatus("owner can change only valid preference",
    await operation(settings, "PATCH", alice.token,
      { responseDepth: string("deep") }, ["responseDepth"]), 200);
  expectStatus("unknown extra client permission rejected",
    await operation(settings, "PATCH", alice.token,
      { readAllHistory: bool(true) }, ["readAllHistory"]), 403);
  expectStatus("owner cannot update provider key",
    await operation(settings, "PATCH", alice.token,
      { providerApiKey: fakeText }, ["providerApiKey"]), 403);
  expectStatus("unknown response tone rejected",
    await operation(settings, "PATCH", alice.token,
      { responseTone: string("unsafe-mode") }, ["responseTone"]), 403);
  expectStatus("wrong settings schema version rejected",
    await operation(settings, "PATCH", alice.token,
      { schemaVersion: integer(10) }, ["schemaVersion"]), 403);
  expectStatus("invalid updatedAt type rejected",
    await operation(settings, "PATCH", alice.token,
      { updatedAt: string("tomorrow") }, ["updatedAt"]), 403);
  expectStatus("autosave cannot be enabled while recommendations off",
    await operation(settings, "PATCH", alice.token,
      { autoSaveRecommendations: bool(true) }, ["autoSaveRecommendations"]), 403);
  expectStatus("recommendations with autosave may be saved as preference only",
    await operation(settings, "PATCH", alice.token,
      { recommendationsEnabled: bool(true), autoSaveRecommendations: bool(true) },
      ["recommendationsEnabled", "autoSaveRecommendations"]), 200);
  expectStatus("owner cannot disable recommendations while autosave stays true",
    await operation(settings, "PATCH", alice.token,
      { recommendationsEnabled: bool(false) }, ["recommendationsEnabled"]), 403);
  expectStatus("cannot delete preferences via client",
    await operation(settings, "DELETE", alice.token), 403);
  expectStatus("cannot create unrelated aiSettings document",
    await operation(root + "aiSettings/admin", "PATCH", alice.token,
      preferences()), 403);

  const approvedGrant = {
    ownerUid: string(alice.uid),
    version: string("reflect-context-v1"),
    scope: string("selected-history"),
    consent: bool(true),
    sourceIds: list([string("note1")]),
    approvedAt: integer(1794340000000),
    expiresAt: integer(1794340300000),
    revokedAt: { nullValue: null }
  };
  expectStatus("owner cannot self-issue a source consent grant",
    await operation(grant, "PATCH", alice.token, approvedGrant), 403);
  expectStatus("stranger cannot create owner's grant",
    await operation(grant, "PATCH", bob.token, approvedGrant), 403);
  expectStatus("anonymous cannot create owner's grant",
    await operation(grant, "PATCH", null, approvedGrant), 403);

  // Emulator privileged seed models a trusted server-created grant. The
  // browser must still be unable to change its scope or revocation status.
  expectStatus("isolated admin seeds synthetic grant",
    await operation(grant, "PATCH", "owner", approvedGrant), 200);
  expectStatus("owner may inspect a trusted grant",
    await operation(grant, "GET", alice.token), 200);
  expectStatus("stranger cannot read the trusted grant",
    await operation(grant, "GET", bob.token), 403);
  expectStatus("anonymous cannot read a trusted grant",
    await operation(grant), 403);
  expectStatus("owner cannot expand grant scope",
    await operation(grant, "PATCH", alice.token,
      { sourceIds: list([string("note1"), string("all-history")]) },
      ["sourceIds"]), 403);
  expectStatus("owner cannot change consent or revoke state",
    await operation(grant, "PATCH", alice.token,
      { revokedAt: integer(1794340000000) }, ["revokedAt"]), 403);
  expectStatus("owner cannot remove grant document without trusted revocation flow",
    await operation(grant, "DELETE", alice.token), 403);
  expectStatus("stranger cannot remove grant",
    await operation(grant, "DELETE", bob.token), 403);

  expectStatus("private AI ledger remains hidden from owner",
    await operation("_reflectAiPrivate/reflect-8fdc8", "GET", alice.token), 403);
  expectStatus("a different namespace cannot write preferences",
    await operation("artifacts/untrusted/users/" + alice.uid +
      "/aiSettings/preferences", "PATCH", alice.token, preferences()), 403);
  expectStatus("nested AI grant subcollections are denied",
    await operation(grant + "/nested/forbidden", "PATCH", alice.token,
      { arbitrary: bool(true) }), 403);
  console.log("PASS: settings do NOT mint consent, and all grant writes require trusted server");
}
main().catch(error => {
  console.error("AI-01B.3 Firestore security matrix failed:", error.message);
  process.exitCode = 1;
});
