"use strict";

/**
 * AI-01K read-only staging context preview. Independent default-OFF endpoint.
 * Exact signed owner, consent and per-owner quota required. Never invokes Grok.
 */
const { createHash } = require("node:crypto");
const { PolicyError } = require("../ai/policy.cjs");
const { PROJECT_ID, SCOPE } = require("./contextConsent.cjs");

const PATH = "/v1/privacy/context-preview";
const ORIGIN = "https://reflect-ai-staging.web.app";
const APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const MAX_BODY = 512;
const MAX_AUTH_HEADER = 8192;
const GRANT_ID = /^[A-Za-z0-9_-]{16,80}$/;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ERROR_STATUS = Object.freeze({
  "invalid-argument": 400, "unauthenticated": 401,
  "reauthentication-required": 401, "permission-denied": 403,
  "not-found": 404, "resource-exhausted": 429,
  "unavailable": 503, "invalid-session-history": 422,
  "invalid-preview-quota": 503
});

const fail = code => { throw new PolicyError(code); };
const plain = x => x !== null && typeof x === "object" && !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
const exactKeys = (x, keys) => plain(x) && Object.keys(x).length === keys.length &&
  keys.every(k => Object.hasOwn(x, k));

function respond(res, status, value, origin = "") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, private",
    "pragma": "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "vary": "Origin",
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Authorization, X-Firebase-AppCheck, Content-Type",
      "access-control-max-age": "60"
    } : {})
  });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  if (req.headers["content-type"]?.split(";")[0]?.trim()?.toLowerCase() !==
      "application/json") fail("invalid-argument");
  const declared = req.headers["content-length"];
  if (declared !== undefined &&
      (!/^(0|[1-9][0-9]*)$/.test(String(declared)) ||
       Number(declared) > MAX_BODY)) fail("invalid-argument");

  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) fail("invalid-argument");
    parts.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { fail("invalid-argument"); }
  if (!exactKeys(body, ["grantId", "sourceId", "scope"]) ||
      typeof body.grantId !== "string" || !GRANT_ID.test(body.grantId) ||
      typeof body.sourceId !== "string" || !SOURCE_ID.test(body.sourceId) ||
      body.scope !== SCOPE) fail("invalid-argument");
  return Object.freeze(body);
}

/** Create only from server-side verifiers. Auth/UID cannot be provided in JSON. */
function createPreviewHttpListener({
  verifyAuth, verifyAppCheck, authorizeAccount, rateLimit, preview
}) {
  if ([verifyAuth, verifyAppCheck, authorizeAccount, rateLimit, preview]
    .some(fn => typeof fn !== "function")) fail("unsafe-environment");

  return async (req, res) => {
    if (req.headers.origin !== ORIGIN) {
      return respond(res, 403, { error: "forbidden" });
    }
    if (req.url !== PATH) return respond(res, 404, { error: "not-found" }, ORIGIN);
    if (req.method === "OPTIONS") return respond(res, 204, {}, ORIGIN);
    if (req.method !== "POST") return respond(res, 404, { error: "not-found" }, ORIGIN);

    const bearer = req.headers.authorization;
    const appCheck = req.headers["x-firebase-appcheck"];
    if (typeof bearer !== "string" || !bearer.startsWith("Bearer ") ||
        bearer.length < 30 || bearer.length > MAX_AUTH_HEADER ||
        typeof appCheck !== "string" || appCheck.length < 20 ||
        appCheck.length > MAX_AUTH_HEADER) {
      return respond(res, 401, { error: "unauthenticated" }, ORIGIN);
    }

    try {
      const command = await readBody(req);
      let auth;
      try { auth = await verifyAuth(bearer.slice(7)); }
      catch (error) {
        fail(error?.code === "auth/id-token-revoked"
          ? "reauthentication-required" : "unauthenticated");
      }
      let attestation;
      try { attestation = await verifyAppCheck(appCheck); }
      catch { fail("unauthenticated"); }
      if (typeof auth?.uid !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(auth.uid) ||
          attestation?.appId !== APP_ID ||
          attestation?.alreadyConsumed !== false) {
        fail("unauthenticated");
      }
      // Readable historical content needs the live paid/owner entitlement too.
      // No fallback to the account's client profile or consent alone.
      if (!(await authorizeAccount(auth))) fail("permission-denied");
      const principal = Object.freeze({
        uid: auth.uid, projectId: PROJECT_ID, appCheckVerified: true
      });

      // The quota is consumed BEFORE the privileged content read, even on
      // read failure, preventing repeated free probes of untrusted sources.
      await rateLimit(principal.uid);
      const value = await preview({ principal, ...command });
      if (!plain(value) || value.providerDispatchAllowed !== false ||
          value.disclosureRequired !== true ||
          value.sourceId !== command.sourceId || value.scope !== SCOPE ||
          !Array.isArray(value.turns) || value.turns.length < 1 ||
          value.turns.length > 4 || !Number.isSafeInteger(value.totalBytes) ||
          value.totalBytes < 1 || value.totalBytes > 2400 ||
          value.turns.some(t => !plain(t) ||
            !["user", "assistant"].includes(t.role) ||
            typeof t.content !== "string" || !t.content ||
            ![true, false].includes(t.truncated) ||
            t.untrustedSource !== true)) fail("unavailable");

      // SHA binds this review to the exact text and order. It is neither
      // persisted as transfer consent nor accepted by any provider endpoint.
      const previewData = {
        sourceId: value.sourceId, scope: SCOPE, turns: value.turns,
        totalBytes: value.totalBytes, sourceTurnCount: value.sourceTurnCount,
        truncated: value.truncated
      };
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(previewData), "utf8").digest("hex");
      return respond(res, 200, {
        ...previewData, previewHash: fingerprint,
        disclosureRequired: true, providerDispatchAllowed: false
      }, ORIGIN);
    } catch (error) {
      const code = error instanceof PolicyError && ERROR_STATUS[error.code]
        ? error.code : "request-failed";
      return respond(res, ERROR_STATUS[code] || 500,
        { error: code }, ORIGIN);
    }
  };
}

module.exports = { PATH, ORIGIN, createPreviewHttpListener };
