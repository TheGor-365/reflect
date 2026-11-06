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
  const home = os.homedir();
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
  const host = locator && locator.host;
  const port = Number(locator && locator.port);
  if (!["127.0.0.1", "localhost", "::1"].includes(host) ||
      !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Refusing non-local or invalid Firebase Emulator hub.");
  }
  return \`http://127.0.0.1:\${port}\`;
}

async function saveRunningState({
  home = os.homedir(), temporaryDirectory = os.tmpdir(), fetchImpl = fetch
} = {}) {
  const root = defaultRoot(home);
  const snapshotFolder = ensurePrivateDirs(root);
  const locatorPath = path.join(temporaryDirectory, \`hub-\${PROJECT}.json\`);
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
  fs.chmodSync(target, 0o700);
  // Do not log the contents: Auth exports may include hashed credentials,
  // Firestore exports can include private notes even in a demo project.
  return target;
}

function startArgs(root = defaultRoot()) {
  const latest = latestSnapshot(root);
  const exportTarget = newSnapshotPath(root);
  const args = [
    "emulators:start", "--config", path.join(CONFIG_DIR, "firebase.json"),
    "--project", PROJECT, "--only", "auth,firestore"
  ];
  if (latest) args.push("--import", latest);
  args.push("--export-on-exit", exportTarget);
  return { args, latest, exportTarget };
}

function startEmulators() {
  ensurePrivateDirs();
  const plan = startArgs();
  console.log(plan.latest
    ? "Importing latest private QA Auth + Firestore snapshot."
    : "No private QA snapshot exists. Starting NEW empty synthetic emulators.");
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
  if (!["status", "save", "start"].includes(command)) {
    throw new Error("Usage: node tests/emulator/qa-state.cjs {status|save|start}");
  }
  if (command === "status") {
    const latest = latestSnapshot();
    console.log(latest ? "Private Auth + Firestore snapshot available." :
      "No complete private QA snapshot found.");
  } else if (command === "save") {
    await saveRunningState();
    console.log("Private QA Auth + Firestore saved. Verify before stopping existing emulators.");
  } else {
    startEmulators();
  }
}

module.exports = {
  PROJECT, AUTH_PORT, FIRESTORE_PORT, defaultRoot, assertPrivateRoot,
  metadataValid, latestSnapshot, newSnapshotPath, assertHubEmulators,
  validateHubLocator, saveRunningState, startArgs
};

if (require.main === module) {
  main(process.argv[2]).catch(error => {
    // Never emit sensitive Firebase response bodies, export content or OOB codes.
    console.error("QA state operation blocked:", error.message);
    process.exitCode = 1;
  });
}
