#!/usr/bin/env node
"use strict";
// Exclusively ephemeral staging Auth 19099 / Firestore 19081. No user data.
const PROJECT = "demo-reflect-stage03h-rules";
const AUTH = "http://127.0.0.1:19099";
const ROOT = "http://127.0.0.1:19081/v1/projects/" + PROJECT + "/databases/(default)/documents/";
if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19099" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:19081" ||
    process.env.GCLOUD_PROJECT !== PROJECT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Refusing non-isolated Rules validation environment");
}
const str = text => ({ stringValue: text });
const versioned = originals => ({ arrayValue: { values: originals.map(text => ({
  mapValue: { fields: { text: str(text), title: str(""),
    savedAt: { timestampValue: "2026-11-07T00:00:00Z" } } }
})) } });
const entry = (text, originals = []) => ({ mapValue: { fields: {
  text: str(text), createdAt: { timestampValue: "2026-11-07T00:00:00Z" },
  ...(originals.length ? { version: { integerValue: "2" },
    versions: versioned(originals) } : {})
} } });
const note = (title = "Synthetic", extra = {}) => ({
  title: str(title), entries: { arrayValue: { values: [entry("initial")] } },
  ...extra
});
async function identity() {
  const reply = await fetch(AUTH + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-only", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  });
  if (!reply.ok) throw new Error("Synthetic Auth creation failed");
  const json = await reply.json();
  if (!json.localId || !json.idToken) throw new Error("Missing demo Auth identity");
  return { uid: json.localId, token: json.idToken };
}
async function operation(path, method = "GET", token = null, fields = null, mask = []) {
  const url = new URL(ROOT + path);
  for (const field of mask) url.searchParams.append("updateMask.fieldPaths", field);
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (fields) headers["content-type"] = "application/json";
  const response = await fetch(url, {
    method, headers, body: fields ? JSON.stringify({ fields }) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  return { status: response.status, data: response.ok ? await response.json() : null };
}
function verify(description, result, expected) {
  if (result.status !== expected) throw new Error(description +
    ": expected HTTP " + expected + ", got " + result.status);
  console.log("PASS: " + description);
}
async function main() {
  const alice = await identity(), bob = await identity();
  if (alice.uid === bob.uid) throw new Error("Synthetic UIDs collided");
  const root = "artifacts/reflect-8fdc8/users/" + alice.uid + "/";
  const noteId = root + "diaryNotes/staging-note";
  verify("owner creates valid note", await operation(noteId, "PATCH", alice.token, note()), 200);
  verify("stranger read blocked", await operation(noteId, "GET", bob.token), 403);
  verify("anonymous read blocked", await operation(noteId), 403);
  verify("unknown create field denied", await operation(root + "diaryNotes/unknown",
    "PATCH", alice.token, note("Synthetic", { hidden: str("synthetic") })), 403);
  verify("missing entry denied", await operation(root + "diaryNotes/empty",
    "PATCH", alice.token, { title: str("Synthetic") }), 403);
  verify("oversized title denied", await operation(root + "diaryNotes/large",
    "PATCH", alice.token, note("A".repeat(241))), 403);
  const revised = await operation(noteId, "PATCH", alice.token,
    { entries: { arrayValue: { values: [entry("revised", ["initial"])] } } }, ["entries"]);
  verify("version-preserving edit allowed", revised, 200);
  if (revised.data?.fields?.entries?.arrayValue?.values?.[0]?.mapValue?.fields
      ?.versions?.arrayValue?.values?.length !== 1) {
    throw new Error("Original revision was not retained");
  }
  verify("createdAt mutation denied", await operation(noteId, "PATCH", alice.token,
    { createdAt: { timestampValue: "2020-01-01T00:00:00Z" } }, ["createdAt"]), 403);
  const legacy = root + "diaryNotes/synthetic-legacy";
  verify("isolated admin seeds legacy only", await operation(legacy, "PATCH", "owner",
    note("6 ноября 2026 г.", {
      unknownLegacy: str("retained"),
      entries: { arrayValue: { values: [entry("Legacy original")] } }
    })), 200);
  const update = await operation(legacy, "PATCH", alice.token,
    { title: str("Custom legacy title") }, ["title"]);
  verify("edit old title without deleting legacy field", update, 200);
  if (update.data?.fields?.unknownLegacy?.stringValue !== "retained") {
    throw new Error("Legacy field was lost on safe edit");
  }
  // Owner archive inventory: two diary documents, one old entry without
  // version and one record containing a saved original. Reproduce only
  // synthetic shapes; no private exported JSON is used.
  const v1 = update.data?.fields?.entries?.arrayValue?.values?.[0]?.mapValue?.fields;
  if (v1?.text?.stringValue !== "Legacy original" || v1.version !== undefined) {
    throw new Error("Synthetic legacy version-one record was unexpectedly rewritten");
  }
  const upgrade = await operation(legacy, "PATCH", alice.token,
    { entries: { arrayValue: { values: [entry("Legacy edited", ["Legacy original"])] } } },
    ["entries"]);
  verify("legacy unversioned entry upgraded to versioned note", upgrade, 200);
  const upgraded = upgrade.data?.fields || {};
  const current = upgraded.entries?.arrayValue?.values?.[0]?.mapValue?.fields;
  const original = current?.versions?.arrayValue?.values?.[0]?.mapValue?.fields;
  if (upgraded.unknownLegacy?.stringValue !== "retained" ||
      upgraded.title?.stringValue !== "Custom legacy title" ||
      current?.text?.stringValue !== "Legacy edited" ||
      Number(current?.version?.integerValue) !== 2 ||
      original?.text?.stringValue !== "Legacy original") {
    throw new Error("Legacy upgrade lost old content, title, unknown metadata or history");
  }
  verify("other UID cannot replace preserved history", await operation(
    legacy, "PATCH", bob.token, {
      entries: { arrayValue: { values: [entry("foreign overwrite")] } }
    }, ["entries"]), 403);

  const profile = root + "profiles/userProfile";
  verify("valid profile create", await operation(profile, "PATCH", alice.token,
    { name: str("Synthetic"), age: { integerValue: "39" } }), 200);
  verify("profile bad age blocked", await operation(profile, "PATCH", alice.token,
    { age: { integerValue: "999" } }, ["age"]), 403);
  verify("profile deletion denied", await operation(profile, "DELETE", alice.token), 403);
  verify("unknown nested path denied", await operation(root + "goals/one/private/another",
    "PATCH", alice.token, { text: str("Synthetic") }), 403);
  for (const collection of ["moods", "goals", "sessions"]) {
    const name = root + collection + "/synthetic";
    verify("legacy-compatible " + collection, await operation(name, "PATCH",
      alice.token, { legacyField: str("Synthetic") }), 200);
    verify("cross-UID " + collection + " blocked",
      await operation(name, "GET", bob.token), 403);
  }
  console.log("PASS: isolated staging-only Rules matrix, no live Firebase access");
}
main().catch(error => {
  console.error("Staging Rules test failed:", error.message);
  process.exitCode = 1;
});
