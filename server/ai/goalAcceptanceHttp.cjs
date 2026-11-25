"use strict";

// Not registered in Railway runtime. Dependencies must be trusted server
// Auth verification (with revocation), consumed App Check, entitlement,
// independent feature gate and rate limiter. No provider dependency.
const PATH = "/v1/ai/goal-acceptance";
const ORIGIN = "https://reflect-ai-staging.web.app";
const APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const MAX_BYTES = 8192;
const FIELDS = "assistantTurnId,candidateIndex,confirmed,goalCriteria,goalPurpose,goalStep,goalTitle,sessionId,sourceTurnId";
const ID = /^[A-Za-z0-9_-]{1,128}$/;
function respond(res, status, data, cors = false) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, private", "x-content-type-options": "nosniff",
    vary: "Origin",
    ...(cors ? { "access-control-allow-origin": ORIGIN,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Authorization, X-Firebase-AppCheck, Content-Type" } : {})
  });
  res.end(status === 204 ? "" : JSON.stringify(data));
}
async function readBody(req) {
  if (req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json" ||
      Number(req.headers["content-length"]) > MAX_BYTES) throw Error("invalid-body");
  const chunks = []; let size = 0;
  for await (const part of req) {
    const chunk = Buffer.from(part); size += chunk.length;
    if (size > MAX_BYTES) throw Error("invalid-body");
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!data || Object.getPrototypeOf(data) !== Object.prototype ||
      Object.keys(data).sort().join(",") !== FIELDS || data.confirmed !== true) {
    throw Error("invalid-body");
  }
  return data;
}
function createGoalAcceptanceHttpListener({ verifyAuth, verifyAppCheck, authorizeAccount,
  checkEnabled, rateLimit, accept }) {
  if (![verifyAuth, verifyAppCheck, authorizeAccount, checkEnabled, rateLimit, accept]
      .every(fn => typeof fn === "function")) throw Error("unsafe-environment");
  return async (req, res) => {
    if (req.headers.origin !== ORIGIN) return respond(res, 403, { error: "forbidden" });
    if (req.url !== PATH || !["POST", "OPTIONS"].includes(req.method)) {
      return respond(res, 404, { error: "not-found" }, true);
    }
    if (req.method === "OPTIONS") return respond(res, 204, {}, true);
    const authHeader = req.headers.authorization;
    const appToken = req.headers["x-firebase-appcheck"];
    if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ") ||
        authHeader.length < 30 || authHeader.length > 8192 ||
        typeof appToken !== "string" || appToken.length < 20 || appToken.length > 8192) {
      return respond(res, 401, { error: "unauthenticated" }, true);
    }
    let body;
    try { body = await readBody(req); }
    catch { return respond(res, 400, { error: "invalid-argument" }, true); }
    let auth, app;
    try {
      auth = await verifyAuth(authHeader.slice(7));
      app = await verifyAppCheck(appToken);
    } catch { return respond(res, 401, { error: "unauthenticated" }, true); }
    if (typeof auth?.uid !== "string" || !ID.test(auth.uid) ||
        app?.appId !== APP_ID || app?.alreadyConsumed !== false) {
      return respond(res, 401, { error: "unauthenticated" }, true);
    }
    try {
      if (await authorizeAccount(auth) !== true) {
        return respond(res, 403, { error: "permission-denied" }, true);
      }
      if (await checkEnabled() !== true) {
        return respond(res, 503, { error: "unavailable" }, true);
      }
      await rateLimit(auth.uid);
      const result = await accept(body, { uid: auth.uid });
      if (result?.status !== "accepted" ||
          typeof result.goalId !== "string" || !/^verified-[a-f0-9]{64}$/.test(result.goalId) ||
          typeof result.alreadyAccepted !== "boolean") throw Error("invalid-result");
      return respond(res, 200, { goalId: result.goalId, status: "accepted",
        alreadyAccepted: result.alreadyAccepted }, true);
    } catch (error) {
      const code = error?.code;
      if (code === "invalid-argument") return respond(res, 400, { error: code }, true);
      if (code === "resource-exhausted") return respond(res, 429, { error: code }, true);
      if (["acceptance-conflict", "goal-no-longer-exists"].includes(code)) {
        return respond(res, 409, { error: code }, true);
      }
      if (["invalid-source", "unverified", "revoked", "archived", "question",
        "unknown", "unreviewed", "invalid-review", "disputed", "invalid-candidate"].includes(code)) {
        return respond(res, 403, { error: "source-not-eligible" }, true);
      }
      return respond(res, 503, { error: "unavailable" }, true);
    }
  };
}
module.exports = { PATH, ORIGIN, createGoalAcceptanceHttpListener };
