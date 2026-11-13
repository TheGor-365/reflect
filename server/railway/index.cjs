"use strict";
/**
 * Stage04H: Railway STAGING-only bridge. Authentication and consumable Firebase
 * App Check tokens precede the existing transactional Firestore budget gate.
 * No private content, tokens, credentials or upstream error bodies are logged.
 */
const http = require("node:http");
const { PolicyError } = require("../ai/policy.cjs");
const { createHostedHandler } = require("../ai/hostedHandler.cjs");
const { createStagingEntitlementVerifier } = require("../ai/stagingEntitlement.cjs");
const { createXaiProviderProbe } = require("../ai/xaiProviderProbe.cjs");
const STAGE_PROJECT = "reflect-ai-staging";
const STAGE_APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const STAGE_ORIGIN = "https://reflect-ai-staging.web.app";
const MAX_HTTP_BYTES = 4096;
const MAX_AUTH_HEADER = 8192;
const ERROR_STATUS = Object.freeze({
  "invalid-argument": 400, "permission-denied": 403,
  "unauthenticated": 401, "already-exists": 409,
  "resource-exhausted": 429, "unavailable": 503,
  "reauthentication-required": 401, "auth-permission-missing": 503,
  "auth-verification-unavailable": 503,
  "attestation-unavailable": 503,
  // A complete HTTP 200 from xAI is NOT evidence of a valid JSON envelope.
  // Give the user a safe category, never provider body, prompt or secrets.
  "invalid-provider-response": 502
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

// Only stable error *codes* cross this boundary; no raw SDK messages, UID or tokens.
function mapAuthError(error) {
  switch (error?.code) {
    case "auth/id-token-revoked":
      return new PolicyError("reauthentication-required");
    case "auth/id-token-expired":
    case "auth/invalid-id-token":
    case "auth/argument-error":
    case "auth/user-disabled":
    case "auth/user-not-found":
      return new PolicyError("unauthenticated");
    case "auth/insufficient-permission":
      return new PolicyError("auth-permission-missing");
    default:
      return new PolicyError("auth-verification-unavailable");
  }
}

function createRequestListener({ ready, allowProvider, authorizeAccount, verifyAuth, verifyAppCheck, checkRuntime, checkProvider, handleReply }) {
  if (typeof ready !== "function" || typeof allowProvider !== "function" ||
      typeof authorizeAccount !== "function" || typeof checkRuntime !== "function" ||
      typeof checkProvider !== "function" ||
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
    const diagnostics = req.url === "/v1/ai/diagnostics";
    const providerDiagnostics = req.url === "/v1/ai/provider-diagnostics";
    if (req.method === "OPTIONS" &&
        (req.url === "/v1/ai/reply" || diagnostics || providerDiagnostics)) {
      return respond(res, 204, {}, origin);
    }
    if (req.method !== "POST" ||
        (req.url !== "/v1/ai/reply" && !diagnostics && !providerDiagnostics)) {
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
      if ((diagnostics || providerDiagnostics) &&
          (data === null || typeof data !== "object" ||
          Array.isArray(data) || Object.keys(data).length !== 0)) {
        throw new PolicyError("invalid-argument");
      }
      let auth;
      try {
        auth = await verifyAuth(bearer.slice(7));
      } catch (error) {
        throw mapAuthError(error);
      }
      let app;
      try {
        app = await verifyAppCheck(appCheckToken);
      } catch {
        throw new PolicyError("attestation-unavailable");
      }
      if (!auth?.uid || app?.appId !== STAGE_APP_ID || app?.alreadyConsumed !== false) {
        throw new PolicyError("unauthenticated");
      }
      // Current verified Firebase account + short-lived private entitlement;
      // no browser-supplied role or recurring Railway UID variable.
      if ((allowProvider() || diagnostics || providerDiagnostics) &&
          !(await authorizeAccount(auth))) {
        throw new PolicyError("permission-denied");
      }
      // This diagnostics route tests the same signed Auth, consumable App Check,
      // private account entitlement and Firestore runtime gate, but NEVER invokes
      // the paid provider or reserves a request ID. No diary or message body.
      if (diagnostics) {
        const privateEnabled = await checkRuntime();
        return respond(res, 200, {
          status: !privateEnabled ? "runtime-disabled" :
            !allowProvider() ? "outbound-disabled" : "ready",
          model: "grok-4.3"
        }, origin);
      }
      if (providerDiagnostics) {
        // Owner-authorized read-only xAI GET /models; never /responses.
        // The process caches the safe status, never model data or secrets.
        const privateEnabled = await checkRuntime();
        const status = privateEnabled ? await checkProvider() : "runtime-disabled";
        return respond(res, 200, { status, model: "grok-4.3" }, origin);
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
      // The provider adapter attaches only a numeric upstream HTTP status
      // as non-enumerable internal metadata. The exact user-facing category
      // is returned only after signed Auth + consumable App Check + ACL gate.
      // Never return raw xAI body, headers, prompts, secrets or internal trace.
      if (error instanceof PolicyError &&
          error.code === "unavailable" &&
          Number.isInteger(error.upstreamHttpStatus)) {
        const upstream = error.upstreamHttpStatus;
        const categories = Object.freeze({
          400: "xai-invalid-request", 401: "xai-unauthorized",
          403: "xai-forbidden", 404: "xai-endpoint-not-found",
          408: "xai-upstream-timeout", 413: "xai-request-too-large",
          422: "xai-invalid-request", 429: "xai-rate-limited"
        });
        const safe = categories[upstream] ||
          (upstream >= 500 ? "xai-upstream-error" : "xai-unavailable");
        // Numeric status only for the ambiguous request-shape failures.
        // The signed owner may inspect it in Network; no upstream body escapes.
        const requestStatus = upstream === 400 || upstream === 422
          ? { upstreamStatus: upstream } : {};
        return respond(res, 502, { error: safe, ...requestStatus }, origin);
      }
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
  // This is distinct from the paid Grok toggle and OFF unless explicitly approved.
  const consentEnabled = process.env.REFLECT_CONTEXT_CONSENT_API_ENABLED === "yes";
  // Separate read-only preview gate; OFF independently of consent grants.
  const previewEnabled = process.env.REFLECT_CONTEXT_PREVIEW_API_ENABLED === "yes";
  const valid = process.env.REFLECT_AI_APPROVED_PROJECT === STAGE_PROJECT &&
    process.env.REFLECT_AI_APP_CHECK_APP_ID === STAGE_APP_ID &&
    process.env.REFLECT_AI_ALLOWED_ORIGIN === STAGE_ORIGIN;
  if (enabled && !valid) throw Error("Stage04H refuses unsafe Firebase project/app/origin");
  if (outboundEnabled && (!enabled || !valid)) throw Error("Stage04H refuses xAI egress without trusted staging runtime");
  if (consentEnabled && (!enabled || !valid)) {
    throw Error("Context consent API requires isolated, authenticated staging runtime");
  }
  if (previewEnabled && (!enabled || !valid || !consentEnabled)) {
    throw Error("Context preview API requires trusted staging and active consent API");
  }
  let verifyAuth = async () => { throw new Error("AI disabled"); };
  let verifyAppCheck = async () => { throw new Error("AI disabled"); };
  let authorizeAccount = async () => false;
  let checkRuntime = async () => false;
  let checkProvider = async () => "provider-unavailable";
  let handleReply = async () => { throw new Error("AI disabled"); };
  let consentRoute = null;
  let previewRoute = null;
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
      readSecret: () => providerKey, transport: fetch,
      // Separate default-OFF staging flag; existing Grok stays operational.
      interactionEnabled: process.env.REFLECT_AI_INTERACTION_V1_ENABLED === "yes"
    });
    authorizeAccount = createStagingEntitlementVerifier({
      db, projectId: STAGE_PROJECT, getUser: uid => getAuth(app).getUser(uid)
    });
    checkProvider = createXaiProviderProbe({ readSecret: () => providerKey, transport: fetch });
    checkRuntime = async () => {
      const snapshot = await db.collection("_reflectAiPrivate")
        .doc("reflect-8fdc8").collection("runtimeFlags").doc("ai").get();
      return snapshot.exists && snapshot.data()?.enabled === true;
    };
    verifyAuth = token => getAuth(app).verifyIdToken(token, true);
    // A shared atomic Firestore replay ledger protects all Railway endpoints,
    // independently of Firebase's consumed marker. Never store the raw token.
    const { createAppCheckReplayGuard } = require("./appCheckReplayGuard.cjs");
    const replayGuard = createAppCheckReplayGuard({
      db, projectId: STAGE_PROJECT
    });
    verifyAppCheck = async token => {
      const result = await getAppCheck(app).verifyToken(token, { consume: true });
      if (result.alreadyConsumed !== false) return result;
      const firstUse = await replayGuard.consume(token, result);
      // Preserve the SDK response shape; every route checks this marker.
      return firstUse ? result : { ...result, alreadyConsumed: true };
    };
    handleReply = handler;
    // No new API exists unless the owner deliberately opts into an isolated
    // staging deployment AND sets the dedicated server-only feature flag.
    // The existing AI reply handler remains strictly one-message-only.
    if (consentEnabled) {
      const { createContextConsentStore } = require("../privacy/contextConsent.cjs");
      const { createConsentHttpListener } = require("../privacy/contextConsentHttp.cjs");
      const consentStore = createContextConsentStore({ db, projectId: STAGE_PROJECT });
      consentRoute = createConsentHttpListener({
        verifyAuth, verifyAppCheck, authorizeAccount,
        execute: (command, principal) => consentStore.execute(command, principal),
        list: principal => consentStore.list(principal)
      });
      if (previewEnabled) {
        const { createSessionContextPreview } = require("../privacy/sessionContextPreview.cjs");
        const { createPreviewQuota } = require("../privacy/contextPreviewQuota.cjs");
        const { createPreviewHttpListener } = require("../privacy/contextPreviewHttp.cjs");
        const bounded = createSessionContextPreview({
          db, consentStore, projectId: STAGE_PROJECT
        });
        const quota = createPreviewQuota({ db, projectId: STAGE_PROJECT });
        previewRoute = createPreviewHttpListener({
          verifyAuth, verifyAppCheck, authorizeAccount,
          rateLimit: uid => quota.consume(uid),
          preview: args => bounded.preview(args)
        });
      }
    }
    ready = true;
  }
  const aiRoute = createRequestListener({
    ready: () => ready, allowProvider: () => outboundEnabled,
    authorizeAccount, checkRuntime, checkProvider,
    verifyAuth, verifyAppCheck, handleReply
  });
  return (req, res) => {
    // Exact route match; no wildcard routes, query strings, or fallthrough.
    if (consentRoute && req.url === "/v1/privacy/context-consent") {
      return consentRoute(req, res);
    }
    if (previewRoute && req.url === "/v1/privacy/context-preview") {
      return previewRoute(req, res);
    }
    return aiRoute(req, res);
  };
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
