"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializePrivacyFirebaseClients } = require("./privacyFirebaseSdk.cjs");

const PROJECT = "reflect-ai-staging";
const NAME = "reflect-r139-privacy-staging";
const credential = Object.freeze({
  type: "service_account", project_id: PROJECT,
  client_email: "synthetic@reflect-ai-staging.iam.gserviceaccount.com",
  private_key: "SYNTHETIC_NOT_A_REAL_PRIVATE_KEY"
});
const args = (extra = {}) => ({
  locallyEnabled: true, projectId: PROJECT, credential, env: {}, ...extra
});

function fakeSdk(options = {}) {
  const calls = { created: 0, deleted: [], cert: 0, fields: 0 };
  const app = options.badApp || { name: NAME, options: { projectId: PROJECT } };
  const sdk = {
    app: {
      getApps: () => options.existing || [],
      cert: value => { calls.cert++; assert.equal(value, credential); return { credential: value }; },
      initializeApp: (_options, name) => {
        calls.created++;
        assert.equal(name, NAME);
        assert.equal(_options.projectId, PROJECT);
        if (options.initializeThrows) throw Error("LEAK_SDK_INIT_SECRET");
        return app;
      },
      deleteApp: async target => {
        calls.deleted.push(target);
        if (options.deleteThrows) throw Error("LEAK_SDK_DELETE_SECRET");
      }
    },
    auth: {
      getAuth: () => {
        if (options.authThrows) throw Error("LEAK_SDK_AUTH_SECRET");
        return { app: options.foreignAuth ? {} : app, verifyIdToken() {}, getUser() {} };
      }
    },
    appCheck: {
      getAppCheck: () => ({
        app: options.foreignAppCheck ? {} : app, verifyToken() {}
      })
    },
    firestore: {
      getFirestore: () => {
        if (options.firestoreThrows) throw Error("LEAK_SDK_FIRESTORE_SECRET");
        return {
          projectId: options.foreignDb ? "other-project" : PROJECT,
          doc() {}, collection() {}, runTransaction() {}, batch() {}
        };
      },
      FieldValue: { delete: () => { calls.fields++; return { marker: "delete" }; } }
    }
  };
  return { sdk, calls, app };
}

test("default off is lazy even with unsafe env and unavailable SDK; no provider calls", async () => {
  let loaded = 0;
  const loadSdk = () => { loaded++; throw Error("SDK_MUST_NOT_LOAD"); };
  assert.equal(await initializePrivacyFirebaseClients({
    locallyEnabled: false, projectId: "wrong", env: {
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:9999"
    }, loadSdk
  }), null);
  assert.equal(loaded, 0);
  await assert.rejects(initializePrivacyFirebaseClients({
    locallyEnabled: "yes", loadSdk
  }), /^Error: privacy-sdk-unavailable$/);
  assert.equal(loaded, 0);
});

test("rejects wrong project, missing or malformed service account before SDK loading", async () => {
  let loads = 0;
  const loadSdk = () => { loads++; throw Error("MUST_NOT_LOAD"); };
  const cyclic = { ...credential };
  cyclic.self = cyclic;
  for (const invalid of [
    { credential: cyclic },
    { projectId: "other-project" }, { credential: undefined },
    { credential: { ...credential, project_id: "other-project" } },
    { credential: { ...credential, type: "authorized_user" } },
    { credential: { ...credential, private_key: "" } },
    { credential: { ...credential, client_email: "" } },
    { credential: "not-a-service-account" },
    { credential: { ...credential, private_key: "x".repeat(66000) } }
  ]) {
    await assert.rejects(initializePrivacyFirebaseClients(args({
      ...invalid, loadSdk
    })), /^Error: privacy-sdk-unavailable$/);
  }
  assert.equal(loads, 0);
});

test("blocks emulator redirects, foreign project hints and implicit Firebase config", async () => {
  let loads = 0;
  for (const env of [
    { FIRESTORE_EMULATOR_HOST: "localhost:19381" },
    { FIREBASE_AUTH_EMULATOR_HOST: "localhost:19399" },
    { FIREBASE_APPCHECK_DEBUG_TOKEN: "debug" },
    { FIREBASE_STORAGE_EMULATOR_HOST: "localhost:9199" },
    { FIREBASE_CONFIG: '{"projectId":"another"}' },
    { GOOGLE_CLOUD_PROJECT: "other" }, { GCLOUD_PROJECT: "other" },
    { FIREBASE_PROJECT_ID: "other" }
  ]) {
    await assert.rejects(initializePrivacyFirebaseClients(args({
      env, loadSdk: () => { loads++; throw Error("MUST_NOT_LOAD"); }
    })), /^Error: privacy-sdk-unavailable$/);
  }
  assert.equal(loads, 0);
});

test("creates named Admin App, Auth, App Check, Firestore and FieldValue.delete", async () => {
  const { sdk, calls, app } = fakeSdk();
  const clients = await initializePrivacyFirebaseClients(args({
    env: { GCLOUD_PROJECT: PROJECT }, loadSdk: () => sdk
  }));
  assert.equal(clients.auth.app, app);
  assert.equal(clients.appCheck.app, app);
  assert.equal(clients.db.projectId, PROJECT);
  assert.deepEqual(clients.deleteField(), { marker: "delete" });
  assert.equal(calls.cert, 1);
  assert.equal(calls.fields, 1);
  assert.equal(calls.created, 1);
  assert.deepEqual(calls.deleted, []);
  await clients.dispose();
  await clients.dispose();
  assert.deepEqual(calls.deleted, [app]);
});

test("never reuses or deletes an existing named SDK app", async () => {
  const existing = { name: NAME, options: { projectId: PROJECT } };
  const { sdk, calls } = fakeSdk({ existing: [existing] });
  await assert.rejects(initializePrivacyFirebaseClients(args({
    loadSdk: () => sdk
  })), /^Error: privacy-sdk-unavailable$/);
  assert.equal(calls.cert, 0);
  assert.equal(calls.created, 0);
  assert.deepEqual(calls.deleted, []);
});

test("fails closed and deletes a newly initialized app with unexpected metadata", async () => {
  const badApp = { name: "foreign", options: { projectId: "foreign" } };
  const { sdk, calls } = fakeSdk({ badApp });
  await assert.rejects(initializePrivacyFirebaseClients(args({
    loadSdk: () => sdk
  })), /^Error: privacy-sdk-unavailable$/);
  assert.equal(calls.created, 1);
  assert.deepEqual(calls.deleted, [badApp]);
});

test("rejects cross-app Auth/AppCheck and foreign Firestore; cleans up only own app", async () => {
  for (const fault of ["foreignAuth", "foreignAppCheck", "foreignDb"]) {
    const { sdk, calls, app } = fakeSdk({ [fault]: true });
    await assert.rejects(initializePrivacyFirebaseClients(args({
      loadSdk: () => sdk
    })), /^Error: privacy-sdk-unavailable$/);
    assert.deepEqual(calls.deleted, [app]);
  }
});

test("redacts SDK client failures and cleans up partially created app", async () => {
  for (const fault of ["authThrows", "firestoreThrows", "deleteThrows"]) {
    const { sdk, calls, app } = fakeSdk({
      [fault]: true, ...(fault === "deleteThrows" ? { authThrows: true } : {})
    });
    await assert.rejects(initializePrivacyFirebaseClients(args({
      loadSdk: () => sdk
    })), error => {
      assert.equal(error.message, "privacy-sdk-unavailable");
      assert.equal(String(error).includes("LEAK_"), false);
      return true;
    });
    assert.deepEqual(calls.deleted, [app]);
  }
});

test("unavailable/malformed SDK does not fall back to ADC or an existing app", async () => {
  for (const loadSdk of [
    () => { throw Error("LEAK_IMPORT_SECRET"); }, () => ({}),
    () => ({ app: { getApps() { return []; } } })
  ]) {
    await assert.rejects(initializePrivacyFirebaseClients(args({
      loadSdk
    })), /^Error: privacy-sdk-unavailable$/);
  }
});

test("cleanup failures expose only a bounded error and never retry implicitly", async () => {
  const { sdk, calls, app } = fakeSdk({ deleteThrows: true });
  const clients = await initializePrivacyFirebaseClients(args({
    loadSdk: () => sdk
  }));
  await assert.rejects(clients.dispose(), /^Error: privacy-sdk-dispose-unavailable$/);
  await clients.dispose();
  assert.deepEqual(calls.deleted, [app]);
});
