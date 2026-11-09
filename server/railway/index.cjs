"use strict";
/**
 * Stage04H: Railway STAGING-only bridge. Authentication and consumable Firebase
 * App Check tokens precede the existing transactional Firestore budget gate.
 * No private content, tokens, credentials or upstream error bodies are logged.
 */
const http = require("node:http");
const { PolicyError } = require("../ai/policy.cjs");
const { createHostedHandler } = require("../ai/hostedHandler.cjs");
const STAGE_PROJECT = "reflect-ai-staging";
const STAGE_APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const STAGE_ORIGIN = "https://reflect-ai-staging.web.app";
const MAX_HTTP_BYTES = 4096;
const MAX_AUTH_HEADER = 8192;
const ERROR_STATUS = Object.freeze({
  "invalid-argument": 400, "permission-denied": 403,
  "unauthenticated": 401, "already-exists": 409,
  "resource-exhausted": 429, "unavailable": 503
});

function respond(res, status, data, origin = "") {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "vary": "Origin",
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Authorization, X-Firebase-AppCheck, Content-Type",
      "access-control-max-age": "300"
    } : {})
  });
  res.end(JSON.stringify(data));
}

async function readSmallJson(req) {
  const length = Number(req.headers["content-length"]);
  if ((Number.isFinite(length) && length > MAX_HTTP_BYTES) ||
      req.headers["content-type"]?.split(";")[0]?.trim()?.toLowerCase() !== "application/json") {
    throw new PolicyError("invalid-argument");
  }
  let lengthRead = 0;
  const chunks = [];
  for await (const chunk of req) {
    lengthRead += chunk.length;
    if (lengthRead > MAX_HTTP_BYTES) throw new PolicyError("invalid-argument");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PolicyError("invalid-argument");
  }
}

function createRequestListener({ ready, allowProvider, authorizeOwner, verifyAuth, verifyAppCheck, handleReply }) {
  if (typeof ready !== "function" || typeof allowProvider !== "function" ||
      typeof authorizeOwner !== "function" ||
      typeof verifyAuth !== "function" ||
      typeof verifyAppCheck !== "function" || typeof handleReply !== "function") {
    throw Error("Stage04H requires explicit injected server dependencies");
  }
  return async (req, res) => {
    const origin = req.headers.origin;
    // GET health endpoints may carry tracking/query parameters added by a
    // browser link. Only health uses pathname; AI routes stay exact-match.
    const pathname = (req.url || "").split("?", 1)[0];
    if (req.method === "GET" && pathname === "/healthz") {
      return respond(res, 200, { status: "up", aiEnabled: ready() && allowProvider() });
    }
    if (origin !== STAGE_ORIGIN) {
      return respond(res, 403, { error: "forbidden" });
    }
    if (req.method === "OPTIONS" && req.url === "/v1/ai/reply") {
      return respond(res, 204, {}, origin);
    }
    if (req.method !== "POST" || req.url !== "/v1/ai/reply") {
      return respond(res, 404, { error: "not-found" }, origin);
    }
    if (!ready()) {
      return respond(res, 503, { error: "ai-disabled" }, origin);
    }
    const bearer = req.headers.authorization || "";
    const appCheckToken = req.headers["x-firebase-appcheck"] || "";
    if (typeof bearer !== "string" || !bearer.startsWith("Bearer ") ||
        bearer.length > MAX_AUTH_HEADER || bearer.length < 30 ||
        typeof appCheckToken !== "string" ||
        appCheckToken.length < 20 || appCheckToken.length > MAX_AUTH_HEADER) {
      return respond(res, 401, { error: "unauthenticated" }, origin);
    }
    try {
      const data = await readSmallJson(req);
      const auth = await verifyAuth(bearer.slice(7));
      const app = await verifyAppCheck(appCheckToken);
      if (!auth?.uid || app?.appId !== STAGE_APP_ID || app?.alreadyConsumed === true) {
        throw new PolicyError("unauthenticated");
      }
      // The browser can create Firebase anonymous accounts. Before any
      // billable traffic, restrict staging to the single owner-approved UID.
      if (allowProvider() && !authorizeOwner(auth.uid)) {
        throw new PolicyError("permission-denied");
      }
      // A second independent, default-OFF egress gate protects real
      // credentials even if a private Firestore runtime flag were mis-set.
      // Only verified Firebase Auth + consumable App Check can reach here.
      if (!allowProvider()) {
        return respond(res, 503, { error: "provider-disabled" }, origin);
      }
      const output = await handleReply({
        auth: { uid: auth.uid },
        app: { appId: app.appId, alreadyConsumed: app.alreadyConsumed },
        data
      });
      return respond(res, 200, output, origin);
    } catch (error) {
      const code = error instanceof PolicyError && ERROR_STATUS[error.code]
        ? error.code : "internal";
      return respond(res, ERROR_STATUS[code] || 500,
        { error: code === "internal" ? "request-failed" : code }, origin);
    }
  };
}

function createRuntime() {
  const enabled = process.env.REFLECT_AI_ENABLED === "yes";
  const outboundEnabled = process.env.REFLECT_XAI_OUTBOUND_ENABLED === "yes";
  const ownerUid = process.env.REFLECT_AI_ALLOWED_UID || "";
  const valid = process.env.REFLECT_AI_APPROVED_PROJECT === STAGE_PROJECT &&
    process.env.REFLECT_AI_APP_CHECK_APP_ID === STAGE_APP_ID &&
    process.env.REFLECT_AI_ALLOWED_ORIGIN === STAGE_ORIGIN;
  if (enabled && !valid) throw Error("Stage04H refuses unsafe Firebase project/app/origin");
  if (outboundEnabled && (!enabled || !valid)) throw Error("Stage04H refuses xAI egress without trusted staging runtime");
  if (outboundEnabled && (!/^[A-Za-z0-9_-]{6,128}$/.test(ownerUid))) {
    throw Error("Stage04H requires one explicitly allowlisted staging Firebase UID");
  }
  let verifyAuth = async () => { throw new Error("AI disabled"); };
  let verifyAppCheck = async () => { throw new Error("AI disabled"); };
  let handleReply = async () => { throw new Error("AI disabled"); };
  let ready = false;
  if (enabled) {
    const secretJson = process.env.REFLECT_FIREBASE_SERVICE_ACCOUNT_JSON || "";
    const providerKey = process.env.REFLECT_XAI_KEY || "";
    if (!secretJson || !providerKey) throw Error("Stage04H missing required server-only credentials");
    const credentialJson = JSON.parse(secretJson);
    if (credentialJson.project_id !== STAGE_PROJECT ||
        credentialJson.type !== "service_account") {
      throw Error("Stage04H rejects credentials for any other Firebase project");
    }
    const { initializeApp, cert } = require("firebase-admin/app");
    const { getAuth } = require("firebase-admin/auth");
    const { getAppCheck } = require("firebase-admin/app-check");
    const { getFirestore } = require("firebase-admin/firestore");
    const app = initializeApp({
      credential: cert(credentialJson), projectId: STAGE_PROJECT
    });
    const db = getFirestore(app);
    const handler = createHostedHandler({
      db, projectId: STAGE_PROJECT, appId: STAGE_APP_ID,
      readSecret: () => providerKey, transport: fetch
    });
    verifyAuth = token => getAuth(app).verifyIdToken(token);
    verifyAppCheck = token => getAppCheck(app).verifyToken(token, { consume: true });
    handleReply = handler;
    ready = true;
  }
  return createRequestListener({
    ready: () => ready, allowProvider: () => outboundEnabled,
    authorizeOwner: uid => uid === ownerUid,
    verifyAuth, verifyAppCheck, handleReply
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw Error("Invalid PORT");
  }
  const server = http.createServer(createRuntime());
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write("Reflect Stage04H staging API listening; no request bodies logged.\n");
  });
}
module.exports = { createRequestListener, createRuntime, STAGE_ORIGIN };
