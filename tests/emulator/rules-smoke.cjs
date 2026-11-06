#!/usr/bin/env node
"use strict";

// Only synthetic demo Auth + Firestore. Verify actual security decisions via
// Firestore's REST gateway, not by assuming a client hides inaccessible data.
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:18081";
const PROJECT = "demo-reflect-auth-qa";
const APP = "reflect-8fdc8";
const restRoot = FIRESTORE + "/v1/projects/" + PROJECT +
  "/databases/(default)/documents/";

function mustBeDemoOnly() {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:18081") {
    throw new Error("Never run Firestore rule smoke outside isolated local demo.");
  }
}
async function newSyntheticIdentity() {
  const response = await fetch(
    AUTH + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-demo-only",
    {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
      signal: AbortSignal.timeout(15000)
    }
  );
  if (!response.ok) throw new Error("Synthetic anonymous Auth creation failed");
  const result = await response.json();
  if (!/^[A-Za-z0-9_-]+$/.test(result.localId) || !result.idToken) {
    throw new Error("Synthetic Auth UID or ID token missing");
  }
  return { uid: result.localId, token: result.idToken };
}
function fields() {
  return { title: { stringValue: "Synthetic rules validation only" } };
}
async function request(path, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["content-type"] = "application/json";
  const result = await fetch(restRoot + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  return result.status;
}
function assertStatus(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(label + ": expected HTTP " + expected + ", got " + actual);
  }
  console.log("PASS: " + label);
}

async function main() {
  mustBeDemoOnly();
  const owner = await newSyntheticIdentity();
  const stranger = await newSyntheticIdentity();
  if (stranger.uid === owner.uid) throw new Error("Auth returned duplicate UIDs");
  const root = "artifacts/" + APP + "/users/" + owner.uid;
  const known = root + "/diaryNotes/rules-smoke";
  assertStatus("owner creates own diary note", await request(known, {
    token: owner.token, method: "PATCH", body: { fields: fields() }
  }), 200);
  assertStatus("owner reads own note", await request(known, { token: owner.token }), 200);
  assertStatus("other UID cannot read owner note",
    await request(known, { token: stranger.token }), 403);
  assertStatus("other UID cannot overwrite owner note", await request(known, {
    token: stranger.token, method: "PATCH", body: { fields: fields() }
  }), 403);
  assertStatus("unauthenticated cannot read owner note", await request(known), 403);

  assertStatus("owner cannot write unknown collection", await request(
    root + "/privateNotes/synthetic", {
      token: owner.token, method: "PATCH", body: { fields: fields() }
    }), 403);
  assertStatus("owner cannot write nested goal collection", await request(
    root + "/goals/synthetic/privateNotes/synthetic", {
      token: owner.token, method: "PATCH", body: { fields: fields() }
    }), 403);
  assertStatus("owner cannot write another app namespace", await request(
    "artifacts/untrusted/users/" + owner.uid + "/diaryNotes/synthetic", {
      token: owner.token, method: "PATCH", body: { fields: fields() }
    }), 403);
  assertStatus("owner cannot write user root document", await request(root, {
    token: owner.token, method: "PATCH", body: { fields: fields() }
  }), 403);
  assertStatus("owner cannot write alternate profile ID", await request(
    root + "/profiles/otherProfile", {
      token: owner.token, method: "PATCH", body: { fields: fields() }
    }), 403);
  assertStatus("owner cannot delete profile without a dedicated flow", await request(
    root + "/profiles/userProfile", {
      token: owner.token, method: "DELETE"
    }), 403);

  for (const collection of ["moods", "sessions", "goals"]) {
    const name = root + "/" + collection + "/synthetic-rules";
    assertStatus("owner may create own " + collection, await request(name, {
      token: owner.token, method: "PATCH", body: { fields: fields() }
    }), 200);
    assertStatus("other UID cannot read " + collection,
      await request(name, { token: stranger.token }), 403);
  }
  assertStatus("owner may create own profile", await request(
    root + "/profiles/userProfile", {
      token: owner.token, method: "PATCH", body: { fields: {
        name: { stringValue: "Synthetic rules test" }
      } }
    }), 200);
  console.log("PASS: real Firestore Rules limit all known collections to UID and deny unknown paths");
}

main().catch(error => {
  console.error("Demo Firestore Rules test failed:", error.message);
  process.exitCode = 1;
});
