"use strict";
/**
 * Explicit deterministic packaging for the separate Firebase codebase.
 * Copies vetted Node-only modules into the Functions source directory,
 * so Cloud Build never relies on parent paths absent from deployment ZIP.
 * No credential files, fixtures or user content are copied.
 */
const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "../../ai");
const target = path.resolve(__dirname, "../functions/lib");
const ALLOWED = Object.freeze([
  "policy.cjs", "xaiContract.cjs", "xaiCost.cjs", "interactionContract.cjs",
  "xaiProviderAdapter.cjs", "hostedBudget.cjs", "hostedHandler.cjs",
  "aiTurnRecovery.cjs", "providerSessionContext.cjs"
]);
fs.mkdirSync(target, { recursive: true, mode: 0o755 });
for (const filename of ALLOWED) {
  const input = path.join(source, filename);
  const info = fs.lstatSync(input);
  if (!info.isFile() || info.isSymbolicLink()) throw Error("Invalid source module");
  fs.copyFileSync(input, path.join(target, filename));
}
for (const item of fs.readdirSync(target)) {
  if (!ALLOWED.includes(item)) throw Error("Unexpected packaged module");
}
process.stdout.write("Reflect hosted AI library prepared (source-only, no secrets).\n");
