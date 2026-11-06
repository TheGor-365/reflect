#!/usr/bin/env node
"use strict";

// CI-only real import smoke. Synthetic email/password only; no production
// Firebase config, no token, journal content or exported records are logged.
const PROJECT = "demo-reflect-auth-qa";
const AUTH_URL = "http://127.0.0.1:9099";
const FIRESTORE_URL = "http://127.0.0.1:18081";
const EMAIL = "reflect-synthetic-alpha@example.test";
const PASSWORD = "Synthetic-Recovered-Password-2026!";
const EXPECTED_TEXT = "Synthetic alpha journal entry";

async function main() {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" ||
      process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:18081") {
    throw new Error("Refusing import smoke outside dedicated local QA.");
  }
  const authResponse = await fetch(
    AUTH_URL + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-qa-only-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
      signal: AbortSignal.timeout(15000)
    }
  );
  if (!authResponse.ok) throw new Error("Recovered Auth account unavailable after import");
  const user = await authResponse.json();
  if (!/^[A-Za-z0-9_-]+$/.test(user.localId || "") || !user.idToken) {
    throw new Error("Restored Auth identity missing UID or token");
  }
  const url = FIRESTORE_URL + "/v1/projects/" + PROJECT +
    "/databases/(default)/documents/artifacts/reflect-8fdc8/users/" +
    encodeURIComponent(user.localId) + "/diaryNotes?pageSize=100";
  const diaryResponse = await fetch(url, {
    headers: { Authorization: "Bearer " + user.idToken },
    signal: AbortSignal.timeout(15000)
  });
  if (!diaryResponse.ok) throw new Error("Recovered user's diary is inaccessible");
  const diary = await diaryResponse.json();
  if (!Array.isArray(diary.documents) ||
      !diary.documents.some(document => JSON.stringify(document.fields || {}).includes(EXPECTED_TEXT))) {
    throw new Error("Recovered journal content missing from Firestore export");
  }
  console.log("PASS: imported Auth login and owner-scoped Firestore diary match synthetic baseline");
}

main().catch(error => {
  console.error("Private emulator import check failed:", error.message);
  process.exitCode = 1;
});
