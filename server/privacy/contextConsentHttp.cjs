"use strict";

/**
 * AI-01G: explicit, staging-only, default-OFF consent management route.
 * This listener is not a provider route. It never reads session transcripts,
 * makes xAI calls, or authorizes memory retrieval from /v1/ai/reply.
 */
const { PolicyError } = require("../ai/policy.cjs");
const { PROJECT_ID } = require("./contextConsent.cjs");

const ORIGIN = "https://reflect-ai-staging.web.app";
const APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const PATH = "/v1/privacy/context-consent";
const MAX_BODY = 512;
const MAX_HEADER = 8192;
const SAFE_ERRORS = Object.freeze({
  "invalid-argument": 400,
  "unauthenticated": 401,
  "permission-denied": 403,
  "not-found": 404,
  "already-exists": 409,
  "resource-exhausted": 429,
  "unavailable": 503,
  "reauthentication-required": 401
});
const reject = code => { throw new PolicyError(code); };
const plain = x => x !== null && typeof x === "object" &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

function reply(res, status, data, origin = "") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "vary": "Origin",
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Authorization, X-Firebase-AppCheck, Content-Type",
      "access-control-max-age": "60"
    } : {})
  });
  res.end(JSON.stringify(data));
}

async function readPayload(req) {
  const contentType = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") reject("invalid-argument");
  const n = Number(req.headers["content-length"]);
  if (req.headers["content-length"] !== undefined &&
      (!Number.isSafeInteger(n) || n < 0 || n > MAX_BODY)) reject("invalid-argument");

  const parts = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) reject("invalid-argument");
    parts.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!plain(parsed)) reject("invalid-argument");
    return parsed;
  } catch {
    reject("invalid-argument");
  }
}

/**
 * Inject only REAL server-only verifiers. Never allow the browser to supply
 * uid/projectId/appCheckVerified/entitlement booleans in the request JSON.
 */
function createConsentHttpListener({
  verifyAuth, verifyAppCheck, authorizeAccount, execute, list
}) {
  if ([verifyAuth, verifyAppCheck, authorizeAccount, execute, list]
    .some(fn => typeof fn !== "function")) reject("unsafe-environment");

  return async (req, res) => {
    if (req.headers.origin !== ORIGIN) return reply(res, 403, { error: "forbidden" });
    if (req.url !== PATH) return reply(res, 404, { error: "not-found" }, ORIGIN);
    if (req.method === "OPTIONS") return reply(res, 204, {}, ORIGIN);
    if (req.method !== "POST") return reply(res, 404, { error: "not-found" }, ORIGIN);

    const bearer = req.headers.authorization || "";
    const appCheckToken = req.headers["x-firebase-appcheck"] || "";
    if (typeof bearer !== "string" || !bearer.startsWith("Bearer ") ||
        bearer.length < 30 || bearer.length > MAX_HEADER ||
        typeof appCheckToken !== "string" || appCheckToken.length < 20 ||
        appCheckToken.length > MAX_HEADER) {
      return reply(res, 401, { error: "unauthenticated" }, ORIGIN);
    }
    try {
      const body = await readPayload(req);
      if (body.action === "list" && Object.keys(body).length !== 1) {
        reject("invalid-argument");
      }
      let auth;
      try { auth = await verifyAuth(bearer.slice(7)); }
      catch (error) {
        if (error?.code === "auth/id-token-revoked") reject("reauthentication-required");
        reject("unauthenticated");
      }
      let check;
      try { check = await verifyAppCheck(appCheckToken); }
      catch { reject("unauthenticated"); }
      if (!auth?.uid || check?.appId !== APP_ID || check?.alreadyConsumed === true) {
        reject("unauthenticated");
      }
      // Only issuance requires paid-account entitlement. Listing and revoking
      // remain possible when an entitlement expires or is later withdrawn.
      if (body.action === "grant" && !(await authorizeAccount(auth))) {
        reject("permission-denied");
      }
      const principal = {
        uid: auth.uid, projectId: PROJECT_ID, appCheckVerified: true
      };
      if (body.action === "list") {
        return reply(res, 200, await list(principal), ORIGIN);
      }
      // This strict operation handles grant/revoke with server-owned UID.
      const result = await execute(body, principal);
      return reply(res, 200, result, ORIGIN);
    } catch (error) {
      const code = error instanceof PolicyError && SAFE_ERRORS[error.code]
        ? error.code : "internal";
      return reply(res, SAFE_ERRORS[code] || 500, {
        error: code === "internal" ? "request-failed" : code
      }, ORIGIN);
    }
  };
}

module.exports = { createConsentHttpListener, PATH, ORIGIN };
