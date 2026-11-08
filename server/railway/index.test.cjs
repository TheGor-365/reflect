"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createRequestListener, createRuntime, STAGE_ORIGIN } = require("./index.cjs");
const { PolicyError } = require("../ai/policy.cjs");

const UID = "a".repeat(80), TOKEN = "x".repeat(90);
const payload = { requestId: "A".repeat(18), message: "Синтетический тест",
  consent: { granted: true, version: "2026-11-07", scope: "one-message" } };
const deps = (overrides = {}) => ({
  ready: () => true,
  verifyAuth: async () => ({ uid: UID }),
  verifyAppCheck: async () => ({
    app_id: "1:599679789981:web:d4d8743dbff0fe40af1d74",
    alreadyConsumed: false
  }),
  handleReply: async () => ({ text: "Ответ модели", model: "grok-4.3", actualUsdTicks: null }),
  ...overrides
});
async function withServer(options, fn) {
  const server = http.createServer(createRequestListener(options));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await fn("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const send = (url, options = {}) => fetch(url + "/v1/ai/reply", {
  ...options, method: "POST", headers: {
    origin: STAGE_ORIGIN, authorization: "Bearer " + TOKEN,
    "x-firebase-appcheck": TOKEN, "content-type": "application/json",
    ...options.headers
  }, body: JSON.stringify(payload)
});

test("AI defaults OFF; health does not depend on secrets", async () => {
  assert.equal(typeof createRuntime(), "function");
  await withServer(deps({ ready: () => false }), async url => {
    const health = await fetch(url + "/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "up", aiEnabled: false });
    assert.equal((await send(url)).status, 503);
  });
});
test("healthcheck accepts browser tracking query without an Origin header, not near-miss paths", async () => {
  await withServer(deps({ ready: () => false }), async url => {
    const response = await fetch(url + "/healthz?utm_source=chatgpt.com");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "up", aiEnabled: false });
    const invalid = await fetch(url + "/healthz-other?utm_source=chatgpt.com");
    assert.equal(invalid.status, 403);
    const method = await fetch(url + "/healthz?utm_source=chatgpt.com", { method: "POST" });
    assert.equal(method.status, 403);
  });
});
test("AI endpoint retains strict URL matching even with a query string", async () => {
  let calls = 0;
  await withServer(deps({ handleReply: async () => { calls++; return {}; } }), async url => {
    const response = await fetch(url + "/v1/ai/reply?utm_source=chatgpt.com", {
      method: "POST", headers: {
        origin: STAGE_ORIGIN, authorization: "Bearer " + TOKEN,
        "x-firebase-appcheck": TOKEN, "content-type": "application/json"
      }, body: JSON.stringify(payload)
    });
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  });
});
test("cross-project Origin is rejected before any token verification", async () => {
  let verified = 0;
  await withServer(deps({ verifyAuth: async () => { verified++; return { uid: UID }; } }), async url => {
    const response = await send(url, { headers: { origin: "https://reflect-three.vercel.app" } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
  assert.equal(verified, 0);
});
test("invalid or consumed App Check and missing tokens cannot reach model", async () => {
  let sent = 0;
  await withServer(deps({
    verifyAppCheck: async () => ({ app_id: "another-project", alreadyConsumed: true }),
    handleReply: async () => { sent++; return {}; }
  }), async url => {
    assert.equal((await send(url)).status, 401);
    assert.equal((await send(url, { headers: { authorization: "Bearer short" } })).status, 401);
  });
  assert.equal(sent, 0);
});
test("authenticated and attested one-message request reaches only injected handler", async () => {
  let calls = 0;
  await withServer(deps({ handleReply: async ({ data, auth }) => {
    calls++;
    assert.deepEqual(data, payload);
    assert.equal(auth.uid, UID);
    return { text: "Готово", model: "grok-4.3" };
  } }), async url => {
    const response = await send(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), STAGE_ORIGIN);
    assert.equal((await response.json()).text, "Готово");
  });
  assert.equal(calls, 1);
});
test("provider failures are redacted; quota errors are bounded", async () => {
  await withServer(deps({ handleReply: async () => { throw new PolicyError("resource-exhausted"); } }), async url => {
    const response = await send(url);
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: "resource-exhausted" });
  });
  await withServer(deps({ handleReply: async () => { throw Error("PRIVATE_PROVIDER_CONTENT"); } }), async url => {
    const response = await send(url);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "request-failed" });
  });
});
test("invalid content type never reaches provider", async () => {
  let calls = 0;
  await withServer(deps({ handleReply: async () => { calls++; } }), async url => {
    assert.equal((await send(url, { headers: { "content-type": "text/plain" } })).status, 400);
  });
  assert.equal(calls, 0);
});
test("CORS preflight only for approved staging origin", async () => {
  await withServer(deps(), async url => {
    const response = await fetch(url + "/v1/ai/reply", {
      method: "OPTIONS", headers: { origin: STAGE_ORIGIN }
    });
    assert.equal(response.status, 204);
  });
});