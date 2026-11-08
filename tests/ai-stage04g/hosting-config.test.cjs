"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("staging Hosting is explicitly pinned and can never deploy Functions or rules", () => {
  const config = JSON.parse(read("firebase.staging.json"));
  assert.deepEqual(Object.keys(config), ["hosting"]);
  assert.equal(config.hosting.site, "reflect-ai-staging");
  assert.equal(config.hosting.public, "dist");
  assert.ok(config.hosting.rewrites.some(
    x => x.source === "**" && x.destination === "/index.html"
  ));
  assert.equal(fs.existsSync(path.join(root, "firebase.json")), false);
  assert.equal(fs.existsSync(path.join(root, "functions/index.js")), false);
  assert.equal(JSON.stringify(config).includes("functions"), false);
  assert.equal(JSON.stringify(config).includes("firestore"), false);
});

test("local staging config is ignored and AI stays OFF while App Check initializes", () => {
  const env = read(".env.staging.example");
  const gitignore = read(".gitignore");
  const client = read("src/firebase/config.js");
  assert.match(gitignore, /^\.env\.\*\.local$/m);
  assert.match(env, /^VITE_ENABLE_STAGING_APP_CHECK=true$/m);
  assert.match(env, /^VITE_ENABLE_REFLECT_CLOUD_AI=false$/m);
  assert.match(env, /^VITE_AI_STAGING_PROJECT_ID=reflect-ai-staging$/m);
  assert.match(env, /^VITE_APP_ID=reflect-8fdc8$/m);
  assert.match(client, /export const stagingAppCheckEnabled = appCheckRequested && stagingConfigValid;/);
  assert.match(client, /export const hostedAiEnabled = hostedAiRequested && stagingConfigValid;/);
  assert.match(client, /if \(stagingAppCheckEnabled\) \{\s*initializeAppCheck\(app,/);
  assert.doesNotMatch(env, /^XAI_API_KEY=/m);
  assert.doesNotMatch(env, /^REFLECT_XAI_KEY=/m);
});

test("the public Firebase app config targets the new staging project only", () => {
  const env = read(".env.staging.example");
  const line = env.split("\n").find(x => x.startsWith("VITE_FIREBASE_CONFIG="));
  assert.ok(line);
  const raw = line.slice("VITE_FIREBASE_CONFIG=".length);
  const config = JSON.parse(raw.slice(1, -1));
  assert.equal(config.projectId, "reflect-ai-staging");
  assert.equal(config.appId, "1:599679789981:web:d4d8743dbff0fe40af1d74");
  assert.equal(config.authDomain, "reflect-ai-staging.firebaseapp.com");
  assert.notEqual(config.apiKey, "demo-only-key");
  assert.equal(Object.hasOwn(config, "secret"), false);
});

test("the separate Firebase Functions deploy remains fenced and unaffected", () => {
  const stagedServer = JSON.parse(read("server/hosted/firebase.json"));
  assert.equal(Object.hasOwn(stagedServer, "hosting"), false);
  assert.equal(stagedServer.functions[0].codebase, "reflect-ai-staging");
  assert.equal(stagedServer.firestore.rules, "firestore.rules");
});
