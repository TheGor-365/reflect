"use strict";

/**
 * LOCAL OWNER-CONSENTED SINGLE LIVE xAI SMOKE CALL, NOT a deployed backend.
 * - Listens on 127.0.0.1 ONLY and accepts the local Vite Origin 3100 only.
 * - Uses a file (0600, owned by current user), NEVER env/browser/Git secrets.
 * - Calls the Responses API with FIXED synthetic text, NO user data.
 * - One attempt per process, no retries, even if provider/connection fails.
 * - Existing Firebase App Check / paid production workflow remains disabled.
 */
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSyntheticXaiRequest, extractXaiText, estimatePublishedUsd } =
  require("./xaiContract.cjs");
const { readProviderCharge } = require("./xaiCost.cjs");

const HOST = "127.0.0.1";
const PORT = 19107;
const ORIGIN = "http://127.0.0.1:3100";
const FIXED_PROMPT =
  "Это синтетический тест подключения Reflect. " +
  "Ответь ровно одним коротким предложением по-русски о пользе записи мыслей.";
// Only allow these owner-visible, synthetic examples; arbitrary session text
// and personal diary data are never accepted by the development proxy.
const SYNTHETIC_SCENARIOS = Object.freeze({
  reflection: FIXED_PROMPT,
  priorities: "Это тестовое сообщение Reflect. Помоги выбрать первый маленький шаг между двумя вымышленными задачами: чтение и прогулка. Ответь одним коротким предложением на русском.",
  clarity: "Это тестовое сообщение Reflect. Сформулируй один нейтральный вопрос для размышления о вымышленном рабочем дне, без психологических диагнозов."
});
const MAX_RESPONSE_BYTES = 96 * 1024;
const CREDENTIAL_PATH = path.join(os.homedir(), ".config", "reflect", "keys", "reflect-dev");
const RESPONSE_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});
function gateAllowed(env = process.env) {
  return env.REFLECT_XAI_DEV_ONLY === "enabled" &&
    env.REFLECT_XAI_ALLOW_ONE_LIVE_REQUEST === "approved" &&
    !env.FUNCTIONS_EMULATOR && !env.K_SERVICE &&
    !env.VERCEL && env.NODE_ENV !== "production";
}
function readPrivateKey(file = CREDENTIAL_PATH) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" && stat.uid !== process.getuid())) {
    throw new Error("private-key-file-invalid");
  }
  const key = fs.readFileSync(file, "utf8").trim();
  if (!/^xai-[A-Za-z0-9_-]{20,250}$/.test(key)) {
    throw new Error("private-key-format-invalid");
  }
  return key;
}
const json = (res, status, body, includeCors = true) => {
  const headers = { ...RESPONSE_HEADERS };
  if (includeCors) {
    headers["Access-Control-Allow-Origin"] = ORIGIN;
    headers["Vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
};
function makeLocalSmokeServer({
  env = process.env,
  loadKey = readPrivateKey,
  transport = fetch,
  oneShot = true
} = {}) {
  if (!gateAllowed(env)) throw new Error("local-smoke-disabled");
  let attempted = false;
  let pending = false;
  let outcome = null;
  const server = http.createServer(async (req, res) => {
    // Absolutely never honor remote websites or cross-origin requests.
    if (req.headers.origin !== ORIGIN) {
      json(res, 403, { error: "origin-denied" }, false);
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...RESPONSE_HEADERS,
        "Access-Control-Allow-Origin": ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Reflect-Smoke",
        "Access-Control-Max-Age": "0",
        "Vary": "Origin"
      });
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/status") {
      json(res, 200, {
        ready: !attempted && !pending, attempted, pending,
        live: true, promptKind: "fixed-synthetic-only",
        outcome
      });
      return;
    }
    if (req.method !== "POST" || req.url !== "/smoke") {
      json(res, 404, { error: "not-found" });
      return;
    }
    if (req.headers["x-reflect-smoke"] !== "explicit-one-shot" ||
        req.headers["content-type"] !== "application/json") {
      json(res, 403, { error: "intent-denied" });
      return;
    }
    // Never accept arbitrary prompt, provider model, API key or history.
    const chunks = [];
    let scenario = "reflection";
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 128) throw new Error("payload-too-large");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const keys = body && typeof body === "object" && !Array.isArray(body)
        ? Object.keys(body).sort().join(",") : "";
      if (body?.confirm !== "synthetic-only" ||
          !["confirm", "confirm,scenario"].includes(keys) ||
          (keys === "confirm,scenario" &&
           (typeof body.scenario !== "string" ||
            !Object.prototype.hasOwnProperty.call(SYNTHETIC_SCENARIOS, body.scenario)))) {
        json(res, 400, { error: "invalid-payload" });
        return;
      }
      if (keys === "confirm,scenario") scenario = body.scenario;
    } catch {
      json(res, 400, { error: "invalid-payload" });
      return;
    }
    if (attempted || pending || !oneShot) {
      json(res, 409, { error: "one-shot-already-used" });
      return;
    }
    pending = true; // lock synchronously, before any await or paid API call
    let secret;
    try {
      secret = loadKey();
    } catch {
      pending = false; // a missing/invalid key must not consume the attempt
      json(res, 412, { error: "key-file-missing-or-unsafe" });
      return;
    }
    attempted = true; // never repeat ambiguous paid requests
    try {
      const request = createSyntheticXaiRequest(SYNTHETIC_SCENARIOS[scenario]);
      const body = {
        ...request.body,
        max_output_tokens: 128,
        reasoning: { effort: "none" },
        temperature: 0.7,
        top_p: 0.95
      };
      const response = await transport(request.endpoint, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + secret,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(45000)
      });
      secret = undefined;
      if (!response.ok) {
        // Do not forward xAI error bodies, as they may contain request data.
        outcome = "api-error";
        json(res, 502, { error: "xai-http-error", providerHttpStatus: response.status });
        return;
      }
      if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) {
        outcome = "invalid-response";
        json(res, 502, { error: "provider-response-too-large" });
        return;
      }
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
        outcome = "invalid-response";
        json(res, 502, { error: "provider-response-too-large" });
        return;
      }
      const payload = JSON.parse(raw);
      const result = extractXaiText(payload);
      const charge = readProviderCharge(payload.usage);
      outcome = "success";
      json(res, 200, {
        mode: "xai-live-local-synthetic-smoke",
        scenario,
        model: "grok-4.3",
        reply: result.text,
        usage: result.usage,
        actualUsdTicks: charge.actualUsdTicks,
        actualUsd: charge.actualUsd,
        estimatedUsd: estimatePublishedUsd(
          result.usage.inputTokens, result.usage.outputTokens
        )
      });
    } catch {
      secret = undefined;
      outcome = "connection-or-validation-error";
      json(res, 502, { error: "xai-transport-or-response-invalid" });
    } finally {
      pending = false;
    }
  });
  return server;
}
function runServer() {
  const server = makeLocalSmokeServer();
  server.listen(PORT, HOST, () => {
    // No secrets, request payloads, responses or Auth identifiers logged.
    process.stdout.write(
      "Reflect xAI local smoke: 127.0.0.1:19107, one synthetic paid attempt maximum.\n"
    );
  });
}
if (require.main === module) runServer();
module.exports = {
  makeLocalSmokeServer, gateAllowed, readPrivateKey,
  FIXED_PROMPT, SYNTHETIC_SCENARIOS, CREDENTIAL_PATH, PORT, ORIGIN
};
