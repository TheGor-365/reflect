#!/usr/bin/env node
"use strict";

/**
 * PRIVATE, LOCAL, DEMO ONLY.
 * Preserve both Auth and Firestore when deliberately stopping synthetic QA.
 * Never point this utility at the restored 18080 Firestore or a live project.
 *
 * node tests/emulator/qa-state.cjs status
 * node tests/emulator/qa-state.cjs save
 * node tests/emulator/qa-state.cjs start
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const net = require("node:net");

const PROJECT = "demo-reflect-auth-qa";
const AUTH_PORT = 9099;
const FIRESTORE_PORT = 18081;
const CONFIG_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, "../..");
const METADATA = "firebase-export-metadata.json";

function defaultRoot(home = os.homedir()) {
  return path.join(home, ".local", "share", "reflect-qa", PROJECT);
}

function within(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
}

function assertPrivateRoot(root, repoRoot = REPO_ROOT) {
  const resolved = path.resolve(root);
  if (within(repoRoot, resolved) || within(resolved, repoRoot) ||
      path.basename(resolved) !== PROJECT ||
      path.basename(path.dirname(resolved)) !== "reflect-qa") {
    throw new Error("Snapshot path must be outside the repository under a private reflect-qa folder.");
  }
  return resolved;
}

function ensurePrivateDirs(root = defaultRoot()) {
  const checked = assertPrivateRoot(root);
  const home = path.resolve(checked, "../../../..");
  if (defaultRoot(home) !== checked) {
    throw new Error("Private QA snapshot root has an unexpected structure.");
  }
  const segments = [
    path.join(home, ".local"),
    path.join(home, ".local", "share"),
    path.dirname(checked),
    checked,
    path.join(checked, "snapshots")
  ];
  for (const dir of segments) {
    if (fs.existsSync(dir) || fs.lstatSync(dir, { throwIfNoEntry: false })) {
      const info = fs.lstatSync(dir);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error("Refusing symbolic link or non-directory in private QA storage.");
      }
    } else {
      fs.mkdirSync(dir, { mode: 0o700 });
    }
  }
  for (const dir of segments.slice(2)) fs.chmodSync(dir, 0o700);
  return path.join(checked, "snapshots");
}

function metadataValid(dir) {
  const manifestPath = path.join(dir, METADATA);
  try {
    const info = fs.lstatSync(dir);
    const file = fs.lstatSync(manifestPath);
    if (!info.isDirectory() || info.isSymbolicLink() ||
        !file.isFile() || file.isSymbolicLink()) return false;
    const meta = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return Boolean(meta && typeof meta.version === "string" &&
      meta.auth && typeof meta.auth === "object" &&
      meta.firestore && typeof meta.firestore === "object");
  } catch {
    return false;
  }
}

function latestSnapshot(root = defaultRoot()) {
  const folder = path.join(assertPrivateRoot(root), "snapshots");
  if (!fs.existsSync(folder)) return null;
  const names = fs.readdirSync(folder)
    .filter(name => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{10}$/.test(name))
    .sort();
  if (names.length === 0) return null;
  const newest = path.join(folder, names[names.length - 1]);
  if (!metadataValid(newest)) {
    throw new Error("Latest QA snapshot is incomplete: refusing silent empty start or overwrite.");
  }
  return newest;
}

/**
 * Check the actual import payload without reading or printing private account
 * data. A valid-looking manifest alone does not prove there are files to
 * restore. Path resolution is confined to the selected private export and
 * refuses symlinks at every component.
 */
function safeSnapshotMember(snapshot, member) {
  if (typeof member !== "string" || !member ||
      member.includes("\\") || path.isAbsolute(member)) {
    throw new Error("Invalid path in private QA export manifest.");
  }
  const target = path.resolve(snapshot, member);
  if (target === snapshot || !within(snapshot, target)) {
    throw new Error("Export manifest path escapes the private QA snapshot.");
  }
  let cursor = snapshot;
  for (const segment of path.relative(snapshot, target).split(path.sep)) {
    cursor = path.join(cursor, segment);
    let stat;
    try { stat = fs.lstatSync(cursor); }
    catch { throw new Error("Private QA snapshot payload is missing."); }
    if (stat.isSymbolicLink()) {
      throw new Error("Symlink inside private QA snapshot is not allowed.");
    }
  }
  return target;
}

function verifiedSnapshot(root = defaultRoot()) {
  const snapshot = latestSnapshot(root);
  if (!snapshot) {
    throw new Error("No private Auth + Firestore snapshot. Refusing an empty restore.");
  }
  const meta = JSON.parse(fs.readFileSync(path.join(snapshot, METADATA), "utf8"));
  const auth = safeSnapshotMember(snapshot, meta.auth?.path);
  const authStat = fs.lstatSync(auth);
  if (authStat.isDirectory()) {
    // Some CLI versions use an Auth export directory rather than a JSON file.
    const members = fs.readdirSync(auth);
    if (!members.length || !members.some(name => {
      const entry = safeSnapshotMember(snapshot, path.relative(snapshot, path.join(auth, name)));
      const stat = fs.lstatSync(entry);
      return stat.isFile() && stat.size > 0;
    })) {
      throw new Error("Private QA Auth export has no readable payload files.");
    }
  } else if (!authStat.isFile() || authStat.size === 0) {
    throw new Error("Private QA Auth export is incomplete.");
  }
  const firestore = safeSnapshotMember(snapshot, meta.firestore?.metadata_file);
  const fsStat = fs.lstatSync(firestore);
  if (!fsStat.isFile() || fsStat.size === 0) {
    throw new Error("Private QA Firestore export metadata is incomplete.");
  }
  // Only safe booleans are returned. Never expose Auth UIDs or note contents.
  return { snapshot, authReady: true, firestoreReady: true };
}

/**
 * Binding briefly to the exact local emulator addresses verifies both ports
 * are free before any firebase spawn. This does not touch live emulator data.
 */
function assertQaPortsFree() {
  return Promise.all([AUTH_PORT, FIRESTORE_PORT].map(port => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", error => reject(new Error(
      `QA port ${port} is occupied or unavailable (${error.code || "bind error"}). Stop only the existing QA emulator after a verified backup.`
    )));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(resolve);
    });
  })));
}

function newSnapshotPath(root = defaultRoot(), now = new Date(), random = randomBytes(5).toString("hex")) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return path.join(assertPrivateRoot(root), "snapshots", stamp + "-" + random);
}

function assertHubEmulators(mapping) {
  const auth = mapping && mapping.auth;
  const firestore = mapping && mapping.firestore;
  const loopback = value => value === "127.0.0.1" || value === "localhost" || value === "::1";
  if (!auth || !firestore || Number(auth.port) !== AUTH_PORT ||
      Number(firestore.port) !== FIRESTORE_PORT ||
      !loopback(auth.host) || !loopback(firestore.host)) {
    throw new Error("Refusing export: emulator hub does not belong to the designated QA ports.");
  }
}

function validateHubLocator(locator) {
  // Newer firebase-tools hub locator files contain {version, origins, pid}
  // without the legacy host/port fields. Accept only literal loopback HTTP.
  const origins = Array.isArray(locator?.origins) ? locator.origins : [];
  if (locator?.host && locator?.port) {
    origins.push(`http://${locator.host}:${locator.port}`);
  }
  for (const origin of origins) {
    let parsed;
    try { parsed = new URL(origin); } catch { continue; }
    const port = Number(parsed.port);
    if (parsed.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) &&
        Number.isInteger(port) && port >= 1024 && port <= 65535 &&
        (parsed.pathname === "/" || parsed.pathname === "")) {
      return `http://127.0.0.1:${port}`;
    }
  }
  throw new Error("Refusing non-local or invalid Firebase Emulator hub.");
}

async function saveRunningState({
  home = os.homedir(), temporaryDirectory = os.tmpdir(), fetchImpl = fetch
} = {}) {
  const root = defaultRoot(home);
  const snapshotFolder = ensurePrivateDirs(root);
  const locatorPath = path.join(temporaryDirectory, `hub-${PROJECT}.json`);
  const locatorInfo = fs.lstatSync(locatorPath, { throwIfNoEntry: false });
  if (!locatorInfo || !locatorInfo.isFile() || locatorInfo.isSymbolicLink()) {
    throw new Error("Dedicated demo Auth/Firestore hub not found. No export performed.");
  }
  const locator = JSON.parse(fs.readFileSync(locatorPath, "utf8"));
  const origin = validateHubLocator(locator);
  const response = await fetchImpl(origin + "/emulators", {
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("Could not verify local QA emulator hub.");
  assertHubEmulators(await response.json());
  const target = newSnapshotPath(root);
  if (!within(snapshotFolder, target) || fs.existsSync(target)) {
    throw new Error("Refusing to overwrite an existing snapshot.");
  }
  const exportResult = await fetchImpl(origin + "/_admin/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: target,
      initiatedBy: "reflect-qa-manual",
      targets: ["auth", "firestore"]
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!exportResult.ok || !metadataValid(target)) {
    throw new Error("Snapshot not confirmed complete. Current emulators must remain running.");
  }
  // Never claim a usable backup based on the manifest alone.
  // A partial export must leave the original emulator running.
  const checked = verifiedSnapshot(root);
  if (checked.snapshot !== target) {
    throw new Error("Latest private QA snapshot differs from freshly exported snapshot.");
  }
  fs.chmodSync(target, 0o700);
  // Do not log the contents: Auth exports may include hashed credentials,
  // Firestore exports can include private notes even in a demo project.
  return target;
}

function startArgs(root = defaultRoot(), { allowEmpty = false } = {}) {
  const latest = latestSnapshot(root);
  if (allowEmpty && latest) {
    throw new Error("Private QA snapshot exists; refusing a new empty emulator.");
  }
  if (!allowEmpty) verifiedSnapshot(root);
  const exportTarget = newSnapshotPath(root);
  const args = [
    "emulators:start", "--config", path.join(CONFIG_DIR, "firebase.json"),
    "--project", PROJECT, "--only", "auth,firestore"
  ];
  if (latest) args.push("--import", latest);
  args.push("--export-on-exit", exportTarget);
  return { args, latest, exportTarget };
}

async function startEmulators({ allowEmpty = false } = {}) {
  // Validate before any process is spawned or old emulator state is touched.
  const plan = startArgs(defaultRoot(), { allowEmpty });
  await assertQaPortsFree();
  ensurePrivateDirs();
  console.log(plan.latest
    ? "Importing verified private QA Auth + Firestore snapshot."
    : "EXPLICIT start-empty: starting new empty demo emulators.");
  console.log("Ctrl+C clean shutdown will export to another private snapshot.");
  const child = spawn("firebase", plan.args, {
    cwd: CONFIG_DIR, stdio: "inherit", env: process.env
  });
  // The terminal normally sends SIGINT to the whole foreground process group.
  // Do not kill or reset other Node/Firebase processes or the 18080 emulator.
  const onInterrupt = () => { /* Firebase child also receives terminal SIGINT. */ };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", () => child.kill("SIGINT"));
  child.on("error", error => {
    console.error("Firebase CLI could not start:", error.message);
    process.exitCode = 1;
  });
  child.on("exit", code => {
    process.removeListener("SIGINT", onInterrupt);
    if (metadataValid(plan.exportTarget)) {
      console.log("Private QA Auth + Firestore snapshot saved.");
    } else {
      console.error("No complete export-on-exit snapshot detected. Check emulator logs.");
      process.exitCode = 1;
    }
    if (code && code !== 130) process.exitCode = code;
  });
}

async function main(command) {
  if (!["status", "save", "start", "start-empty", "latest", "preflight"].includes(command)) {
    throw new Error("Usage: node tests/emulator/qa-state.cjs {status|save|preflight|start|start-empty|latest}");
  }
  if (command === "latest") {
    process.stdout.write(verifiedSnapshot().snapshot + "\n");
  } else if (command === "preflight") {
    verifiedSnapshot();
    console.log("PASS: local Auth and Firestore snapshot payloads exist; import not executed.");
    console.log("Next: stop only the original QA emulator after checking its fresh export.");
  } else if (command === "status") {
    const latest = latestSnapshot();
    if (latest) {
      verifiedSnapshot();
      console.log("Private Auth + Firestore snapshot payloads verified.");
    } else {
      console.log("No complete private QA snapshot found. Do not stop running emulators.");
    }
  } else if (command === "save") {
    await saveRunningState();
    console.log("Private QA Auth + Firestore saved. Verify before stopping existing emulators.");
  } else {
    await startEmulators({ allowEmpty: command === "start-empty" });
  }
}

module.exports = {
  PROJECT, AUTH_PORT, FIRESTORE_PORT, defaultRoot, assertPrivateRoot,
  metadataValid, latestSnapshot, verifiedSnapshot, safeSnapshotMember,
  assertQaPortsFree, newSnapshotPath, assertHubEmulators,
  validateHubLocator, saveRunningState, startArgs
};

if (require.main === module) {
  main(process.argv[2]).catch(error => {
    // Never emit sensitive Firebase response bodies, export content or OOB codes.
    console.error("QA state operation blocked:", error.message);
    process.exitCode = 1;
  });
}
