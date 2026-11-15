"use strict";

/**
 * M3d.1: independent, default-OFF signed preview for ONE owner-scoped session.
 * Never grants model dispatch permission, calls xAI or writes a session.
 * The later send path MUST revalidate the exact digest after durable user-turn
 * persistence and immediately before provider dispatch.
 */
const { PolicyError } = require("./policy.cjs");
const { PROJECT_ID, SCOPE } = require("../privacy/contextConsent.cjs");
const { MAX_TURN_BYTES } = require("./sessionMemory.cjs");
const { contextWindow } = require("./contextLevels.cjs");

const PATH = "/v1/ai/session-memory-preview";
const ORIGIN = "https://reflect-ai-staging.web.app";
const APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const MAX_BODY = 2600;
const MAX_HEADER = 8192;
const SOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const GRANT = /^[A-Za-z0-9_-]{16,80}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ERROR_STATUS = Object.freeze({
  "invalid-argument": 400, "invalid-session-history": 422,
  "unauthenticated": 401, "reauthentication-required": 401,
  "permission-denied": 403, "not-found": 404,
  "resource-exhausted": 429, "unavailable": 503
});
const deny = code => { throw new PolicyError(code); };
const plain = x => Boolean(x) && typeof x === "object" &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const exact = (x, keys) => plain(x) && Object.keys(x).length === keys.length &&
  keys.every(key => Object.hasOwn(x, key));

function respond(res, status, payload, origin = "") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, private", "pragma": "no-cache",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
    "vary": "Origin",
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Authorization, X-Firebase-AppCheck, Content-Type",
      "access-control-max-age": "60"
    } : {})
  });
  res.end(JSON.stringify(payload));
}

async function readPayload(req) {
  if (req.headers["content-type"]?.split(";")[0]?.trim()?.toLowerCase() !==
      "application/json") deny("invalid-argument");
  const declared = req.headers["content-length"];
  if (declared !== undefined &&
      (!/^(0|[1-9][0-9]*)$/.test(String(declared)) ||
       Number(declared) > MAX_BODY)) deny("invalid-argument");
  const parts = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) deny("invalid-argument");
    parts.push(chunk);
  }
  let command;
  try { command = JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { deny("invalid-argument"); }
  const oldKeys = ["grantId", "sourceId", "requestId", "message", "scope"];
  if (!(exact(command, oldKeys) ||
        exact(command, [...oldKeys, "contextLevel"])) ||
      !GRANT.test(command.grantId || "") ||
      !SOURCE.test(command.sourceId || "") ||
      !REQUEST.test(command.requestId || "") ||
      typeof command.message !== "string" ||
      !command.message.trim() || Buffer.byteLength(command.message, "utf8") > 2000 ||
      command.scope !== SCOPE) deny("invalid-argument");
  contextWindow(command.contextLevel); // Reject unknown levels before a scoped read.
  return command;
}

function validatePreview(value, command) {
  const window = contextWindow(command.contextLevel);
  if (!plain(value) || value.providerDispatchAllowed !== false ||
      value.scope !== SCOPE || value.sourceId !== command.sourceId ||
      value.requestId !== command.requestId ||
      (command.contextLevel === undefined
        ? value.contextLevel !== undefined
        : value.contextLevel !== window.contextLevel) ||
      !DIGEST.test(value.approvalDigest || "") ||
      !Array.isArray(value.turns) || value.turns.length < 1 ||
      value.turns.length > window.maxTurns ||
      !Number.isSafeInteger(value.totalBytes) ||
      value.totalBytes < 1 || value.totalBytes > window.maxBytes ||
      typeof value.truncated !== "boolean") deny("unavailable");
  const seen = new Set();
  let sum = 0;
  for (const turn of value.turns) {
    if (!exact(turn, ["sourceTurnId", "role", "content", "untrustedSource", "truncated"]) ||
        !SOURCE.test(turn.sourceTurnId || "") || seen.has(turn.sourceTurnId) ||
        !["user", "assistant"].includes(turn.role) ||
        typeof turn.content !== "string" || !turn.content.trim() ||
        turn.untrustedSource !== true || typeof turn.truncated !== "boolean") {
      deny("unavailable");
    }
    seen.add(turn.sourceTurnId);
    const bytes = Buffer.byteLength(turn.content, "utf8");
    if (bytes > MAX_TURN_BYTES) deny("unavailable");
    sum += bytes;
  }
  if (sum !== value.totalBytes) deny("unavailable");
  // The response is strictly whitelisted; never include UID, grant internals
  // or other owner's text. This digest is NOT consent to provider egress.
  return Object.freeze({
    sourceId: command.sourceId, requestId: command.requestId,
    ...(command.contextLevel === undefined ? {} : { contextLevel: command.contextLevel }),
    scope: SCOPE, turns: value.turns, totalBytes: value.totalBytes,
    truncated: value.truncated, approvalDigest: value.approvalDigest,
    providerDispatchAllowed: false, disclosureRequired: true
  });
}

function createSessionMemoryPreviewHttpListener({
  verifyAuth, verifyAppCheck, authorizeAccount, rateLimit, preview
}) {
  if ([verifyAuth, verifyAppCheck, authorizeAccount, rateLimit, preview]
    .some(fn => typeof fn !== "function")) deny("unsafe-environment");
  return async (req, res) => {
    if (req.headers.origin !== ORIGIN) return respond(res, 403, { error: "forbidden" });
    if (req.url !== PATH) return respond(res, 404, { error: "not-found" }, ORIGIN);
    if (req.method === "OPTIONS") return respond(res, 204, {}, ORIGIN);
    if (req.method !== "POST") return respond(res, 404, { error: "not-found" }, ORIGIN);
    const bearer = req.headers.authorization || "";
    const token = req.headers["x-firebase-appcheck"] || "";
    if (typeof bearer !== "string" || !bearer.startsWith("Bearer ") ||
        bearer.length < 30 || bearer.length > MAX_HEADER ||
        typeof token !== "string" || token.length < 20 ||
        token.length > MAX_HEADER) {
      return respond(res, 401, { error: "unauthenticated" }, ORIGIN);
    }
    try {
      const command = await readPayload(req);
      let auth;
      try { auth = await verifyAuth(bearer.slice(7)); }
      catch (error) {
        deny(error?.code === "auth/id-token-revoked" ?
          "reauthentication-required" : "unauthenticated");
      }
      let app;
      try { app = await verifyAppCheck(token); }
      catch { deny("unauthenticated"); }
      if (typeof auth?.uid !== "string" || !SOURCE.test(auth.uid) ||
          app?.appId !== APP_ID || app?.alreadyConsumed !== false) {
        deny("unauthenticated");
      }
      if (!(await authorizeAccount(auth))) deny("permission-denied");
      // Quota is consumed before a privileged session read.
      await rateLimit(auth.uid);
      const principal = Object.freeze({
        uid: auth.uid, projectId: PROJECT_ID, appCheckVerified: true
      });
      return respond(res, 200, validatePreview(
        await preview({ ...command, principal }), command
      ), ORIGIN);
    } catch (error) {
      const code = error instanceof PolicyError && ERROR_STATUS[error.code]
        ? error.code : "internal";
      return respond(res, ERROR_STATUS[code] || 500,
        { error: code === "internal" ? "request-failed" : code }, ORIGIN);
    }
  };
}
module.exports = {
  PATH, ORIGIN, createSessionMemoryPreviewHttpListener, validatePreview
};
