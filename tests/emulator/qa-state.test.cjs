"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  PROJECT, defaultRoot, assertPrivateRoot, metadataValid, latestSnapshot,
  verifiedSnapshot, safeSnapshotMember, assertQaPortsFree,
  newSnapshotPath, assertHubEmulators, validateHubLocator, saveRunningState,
  startArgs
} = require("./qa-state.cjs");

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "reflect-qa-synthetic-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const root = defaultRoot(home);
  fs.mkdirSync(path.join(root, "snapshots"), { recursive: true, mode: 0o700 });
  return { home, root };
}

const name = "2026-11-06T00-15-20-000Z-abcdef1234";
const completeManifest = {
  version: "synthetic",
  auth: { path: "auth_export" },
  firestore: {
    path: "firestore_export",
    metadata_file: "firestore_export/firestore_export.overall_export_metadata"
  }
};
function writePayload(dir) {
  fs.mkdirSync(path.join(dir, "auth_export"), { recursive: true });
  fs.writeFileSync(path.join(dir, "auth_export", "accounts.json"), "[]");
  fs.mkdirSync(path.join(dir, "firestore_export"), { recursive: true });
  fs.writeFileSync(path.join(dir, "firestore_export",
    "firestore_export.overall_export_metadata"), "synthetic-binary-metadata");
}
function fakeSnapshot(root, leaf = name, manifest = completeManifest) {
  const dir = path.join(root, "snapshots", leaf);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, "firebase-export-metadata.json"), JSON.stringify(manifest));
  if (manifest === completeManifest) writePayload(dir);
  return dir;
}

test("private snapshot location never resolves inside or above repository", t => {
  const { root } = fixture(t);
  assert.equal(assertPrivateRoot(root), root);
  assert.throws(() => assertPrivateRoot(path.resolve(__dirname, "../..")),
    /outside the repository/);
  assert.throws(() => assertPrivateRoot(os.homedir()),
    /outside the repository/);
});

test("missing snapshot refuses ordinary start, explicit start-empty only in a fresh synthetic location", t => {
  const { root } = fixture(t);
  assert.throws(() => startArgs(root), /Refusing an empty restore/);
  const plan = startArgs(root, { allowEmpty: true });
  assert.equal(plan.latest, null);
  assert.ok(plan.args.includes("demo-reflect-auth-qa"));
  assert.ok(plan.args.includes("auth,firestore"));
  assert.equal(plan.args.includes("--import"), false);
  assert.ok(plan.args.includes("--export-on-exit"));
});

test("snapshot selection imports both Auth and Firestore only when manifest parses", t => {
  const { root } = fixture(t);
  const older = fakeSnapshot(root);
  assert.equal(metadataValid(older), true);
  assert.equal(latestSnapshot(root), older);
  assert.deepEqual(verifiedSnapshot(root), {
    snapshot: older, authReady: true, firestoreReady: true
  });
  assert.throws(() => startArgs(root, { allowEmpty: true }), /snapshot exists/);
  const plan = startArgs(root);
  const index = plan.args.indexOf("--import");
  assert.equal(plan.args[index + 1], older);
  assert.equal(plan.args.includes("reflect-8fdc8"), false);
});

test("incomplete most recent export refuses a destructive empty startup", t => {
  const { root } = fixture(t);
  fakeSnapshot(root);
  const bad = fakeSnapshot(root, "2026-11-06T01-00-00-000Z-abcdef1235", {});
  assert.equal(metadataValid(bad), false);
  assert.throws(() => latestSnapshot(root), /incomplete/);
});

test("emulator hub mapping must be the exact local project port pair", () => {
  const valid = {
    auth: { port: 9099, host: "127.0.0.1" },
    firestore: { port: 18081, host: "127.0.0.1" }
  };
  assert.doesNotThrow(() => assertHubEmulators(valid));
  assert.throws(() => assertHubEmulators({
    auth: valid.auth, firestore: { port: 18080, host: "127.0.0.1" }
  }), /designated QA ports/);
  assert.throws(() => assertHubEmulators({
    auth: { ...valid.auth, host: "firebase.googleapis.com" }, firestore: valid.firestore
  }), /designated QA ports/);
});

test("locator only accepts a loopback host and valid port", () => {
  assert.equal(validateHubLocator({ host: "127.0.0.1", port: 4401 }),
    "http://127.0.0.1:4401");
  assert.equal(validateHubLocator({
    version: "15.34.2", origins: ["http://127.0.0.1:4401", "http://[::1]:4401"], pid: 123
  }), "http://127.0.0.1:4401");
  assert.throws(() => validateHubLocator({ host: "example.com", port: 4401 }), /non-local/);
  assert.throws(() => validateHubLocator({ host: "localhost", port: 0 }), /invalid/);
});

test("save uses the correct project locator and private non-overwriting snapshot", async t => {
  const { home, root } = fixture(t);
  const temp = path.join(home, "temporary");
  fs.mkdirSync(temp);
  fs.writeFileSync(path.join(temp, "hub-" + PROJECT + ".json"),
    JSON.stringify({ version: "15.34.2", origins: ["http://127.0.0.1:4401"] }));
  let calls = 0;
  const mockFetch = async (url, options = {}) => {
    calls++;
    if (calls === 1) {
      assert.equal(url, "http://127.0.0.1:4401/emulators");
      return { ok: true, json: async () => ({
        auth: { host: "127.0.0.1", port: 9099 },
        firestore: { host: "127.0.0.1", port: 18081 }
      }) };
    }
    assert.equal(url, "http://127.0.0.1:4401/_admin/export");
    assert.equal(options.method, "POST");
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.targets, ["auth", "firestore"]);
    assert.equal(payload.initiatedBy, "reflect-qa-manual");
    assert.equal(path.dirname(payload.path), path.join(root, "snapshots"));
    assert.equal(fs.existsSync(payload.path), false);
    fs.mkdirSync(payload.path);
    fs.writeFileSync(path.join(payload.path, "firebase-export-metadata.json"),
      JSON.stringify(completeManifest));
    writePayload(payload.path);
    return { ok: true };
  };
  const result = await saveRunningState({
    home, temporaryDirectory: temp, fetchImpl: mockFetch
  });
  assert.equal(calls, 2);
  assert.equal(metadataValid(result), true);
  assert.equal(fs.statSync(path.join(root, "snapshots")).mode & 0o777, 0o700);
});

test("save aborts before export if the locator points to private restore emulator", async t => {
  const { home } = fixture(t);
  const temp = path.join(home, "temp");
  fs.mkdirSync(temp);
  fs.writeFileSync(path.join(temp, "hub-" + PROJECT + ".json"),
    JSON.stringify({ version: "15.34.2", origins: ["http://127.0.0.1:4401"] }));
  let calledExport = false;
  await assert.rejects(saveRunningState({
    home, temporaryDirectory: temp,
    fetchImpl: async url => {
      if (url.includes("_admin/export")) calledExport = true;
      return { ok: true, json: async () => ({
        auth: { port: 9099, host: "127.0.0.1" },
        firestore: { port: 18080, host: "127.0.0.1" }
      }) };
    }
  }), /designated QA ports/);
  assert.equal(calledExport, false);
});

test("export cannot accept a symbolic link for an Auth/Firestore snapshot", t => {
  const { root } = fixture(t);
  const real = fakeSnapshot(root);
  const sym = path.join(root, "snapshots", "2026-11-06T02-00-00-000Z-abcdef1236");
  fs.symlinkSync(real, sym);
  assert.equal(metadataValid(sym), false);
  assert.throws(() => latestSnapshot(root), /incomplete/);
});

test("preflight rejects manifest-only backups with missing Auth or Firestore payload", t => {
  const { root } = fixture(t);
  const snapshot = fakeSnapshot(root);
  fs.rmSync(path.join(snapshot, "auth_export", "accounts.json"));
  assert.equal(metadataValid(snapshot), true); // old manifest-only heuristic would pass
  assert.throws(() => verifiedSnapshot(root), /Auth export has no readable payload/);
  assert.throws(() => startArgs(root), /Auth export has no readable payload/);
  fs.writeFileSync(path.join(snapshot, "auth_export", "accounts.json"), "[]");
  fs.rmSync(path.join(snapshot, "firestore_export",
    "firestore_export.overall_export_metadata"));
  assert.throws(() => verifiedSnapshot(root), /payload is missing/);
});

test("preflight rejects path traversal and symlinks without exposing private files", t => {
  const { root } = fixture(t);
  const snapshot = fakeSnapshot(root);
  const manifestPath = path.join(snapshot, "firebase-export-metadata.json");
  const manifest = structuredClone(completeManifest);
  manifest.auth.path = "../outside";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => verifiedSnapshot(root), /escapes the private QA snapshot/);
  manifest.auth.path = "auth_export";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.rmSync(path.join(snapshot, "auth_export", "accounts.json"));
  fs.symlinkSync(path.join(snapshot, "firestore_export",
    "firestore_export.overall_export_metadata"), path.join(snapshot, "auth_export", "accounts.json"));
  assert.throws(() => verifiedSnapshot(root), /Symlink inside private QA snapshot/);
  assert.throws(() => safeSnapshotMember(snapshot, "/etc/passwd"), /Invalid path/);
});

test("preflight of a complete snapshot is read-only", t => {
  const { root } = fixture(t);
  const snapshot = fakeSnapshot(root);
  const manifest = path.join(snapshot, "firebase-export-metadata.json");
  const previous = fs.readFileSync(manifest);
  assert.equal(verifiedSnapshot(root).snapshot, snapshot);
  assert.deepEqual(fs.readFileSync(manifest), previous);
  assert.equal(fs.statSync(path.join(snapshot, "auth_export", "accounts.json")).size, 2);
});

test("QA port occupancy is diagnosed before starting a second emulator", async t => {
  const net = require("node:net");
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(9099, "127.0.0.1", resolve);
  });
  t.after(() => listener.close());
  await assert.rejects(assertQaPortsFree(), /QA port 9099 is occupied or unavailable/);
});
