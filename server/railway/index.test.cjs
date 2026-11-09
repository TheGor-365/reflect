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
  allowProvider: () => true,
  authorizeAccount: async auth => auth.uid === UID,
  checkRuntime: async () => true,
  verifyAuth: async () => ({ uid: UID }),
  verifyAppCheck: async () => ({
    // Actual Firebase Admin verifyToken() response uses appId at the top
    // level, not app_id (which is nested in the decoded token).
    appId: "1:599679789981:web:d4d8743dbff0fe40af1d74",
    token: { app_id: "1:599679789981:web:d4d8743dbff0fe40af1d74" },
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
test("with valid signed tokens the independent xAI egress switch remains OFF", async () => {
  let calls = 0;
  await withServer(deps({
    allowProvider: () => false,
    handleReply: async () => { calls++; return {}; }
  }), async url => {
    const health = await fetch(url + "/healthz?utm_source=chatgpt.com");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "up", aiEnabled: false });
    const response = await send(url);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "provider-disabled" });
  });
  assert.equal(calls, 0);
});
test("a different signed staging user cannot spend provider credits", async () => {
  let providerCalls = 0;
  await withServer(deps({
    authorizeAccount: async auth => auth.uid === "approved-uid-only",
    handleReply: async () => { providerCalls++; return {}; }
  }), async url => {
    const result = await send(url);
    assert.equal(result.status, 403);
    assert.deepEqual(await result.json(), { error: "permission-denied" });
  });
  assert.equal(providerCalls, 0);
});
test("missing private entitlement is rejected before provider egress", async () => {
  let calls = 0;
  await withServer(deps({
    authorizeAccount: async () => false,
    handleReply: async () => { calls++; return {}; }
  }), async url => {
    const response = await send(url);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "permission-denied" });
  });
  assert.equal(calls, 0);
});
test("private Auth/Firestore lookup outage is safely redacted", async () => {
  let calls = 0;
  await withServer(deps({
    authorizeAccount: async () => { throw Error("PRIVATE_ACCOUNT_LOOKUP_FAILURE"); },
    handleReply: async () => { calls++; return {}; }
  }), async url => {
    const response = await send(url);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "request-failed" });
  });
  assert.equal(calls, 0);
});

test("signed diagnostics probes Auth, App Check, private entitlement and runtime only", async () => {
  let calls = 0, checks = 0;
  await withServer(deps({
    checkRuntime: async () => { checks++; return true; },
    handleReply: async () => { calls++; throw Error("must-not-reach-provider"); }
  }), async url => {
    const reply = await fetch(url + "/v1/ai/diagnostics", {
      method: "POST",
      headers: {
        origin: STAGE_ORIGIN, authorization: "Bearer " + TOKEN,
        "x-firebase-appcheck": TOKEN, "content-type": "application/json"
      },
      body: "{}"
    });
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { status: "ready", model: "grok-4.3" });
  });
  assert.equal(calls, 0);
  assert.equal(checks, 1);
});
test("diagnostics do not spend when provider switch is off or private flag is off", async () => {
  for (const options of [
    { allowProvider: () => false, checkRuntime: async () => true, status: "outbound-disabled" },
    { allowProvider: () => true, checkRuntime: async () => false, status: "runtime-disabled" }
  ]) {
    let calls = 0;
    await withServer(deps({
      allowProvider: options.allowProvider, checkRuntime: options.checkRuntime,
      handleReply: async () => { calls++; }
    }), async url => {
      const result = await fetch(url + "/v1/ai/diagnostics", {
        method: "POST", headers: {
          origin: STAGE_ORIGIN, authorization: "Bearer " + TOKEN,
          "x-firebase-appcheck": TOKEN, "content-type": "application/json"
        }, body: "{}"
      });
      assert.equal(result.status, 200);
      assert.equal((await result.json()).status, options.status);
    });
    assert.equal(calls, 0);
  }
});
test("revoked account token returns reauthentication-required without a provider call", async () => {
  let calls = 0, attested = 0;
  await withServer(deps({
    verifyAuth: async () => { throw Object.assign(Error("SECRET"), { code: "auth/id-token-revoked" }); },
    verifyAppCheck: async () => { attested++; },
    handleReply: async () => { calls++; }
  }), async url => {
    const reply = await send(url);
    assert.equal(reply.status, 401);
    assert.deepEqual(await reply.json(), { error: "reauthentication-required" });
  });
  assert.equal(attested, 0);
  assert.equal(calls, 0);
});
test("missing Firebase Auth privileges returns specific redacted service error", async () => {
  let calls = 0;
  await withServer(deps({
    verifyAuth: async () => {
      throw Object.assign(Error("PRIVATE_CREDENTIALS"), { code: "auth/insufficient-permission" });
    },
    handleReply: async () => { calls++; }
  }), async url => {
    const reply = await fetch(url + "/v1/ai/diagnostics", {
      method: "POST", headers: {
        origin: STAGE_ORIGIN, authorization: "Bearer " + TOKEN,
        "x-firebase-appcheck": TOKEN, "content-type": "application/json"
      }, body: "{}"
    });
    assert.equal(reply.status, 503);
    assert.deepEqual(await reply.json(), { error: "auth-permission-missing" });
  });
  assert.equal(calls, 0);
});
test("diagnostics require exactly empty JSON, signed tokens and approved origin", async () => {
  let calls = 0, authCalls = 0;
  await withServer(deps({
    verifyAuth: async () => { authCalls++; return { uid: UID }; },
    handleReply: async () => { calls++; }
  }), async url => {
    const headers = {
      origin: STAGE_ORIGIN, authorization: "Bearer " + TOKEN,
      "x-firebase-appcheck": TOKEN, "content-type": "application/json"
    };
    for (const [body, status] of [['{"message":"private"}',400],['[]',400]]) {
      const result = await fetch(url + "/v1/ai/diagnostics", {
        method: "POST", headers, body
      });
      assert.equal(result.status, status);
    }
    const cross = await fetch(url + "/v1/ai/diagnostics", {
      method:"POST", headers:{...headers,origin:"https://reflect-three.vercel.app"},body:"{}"
    });
    assert.equal(cross.status,403);
  });
  assert.equal(calls,0);
  assert.equal(authCalls,0);
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
    verifyAppCheck: async () => ({ appId: "another-project", alreadyConsumed: true }),
    handleReply: async () => { sent++; return {}; }
  }), async url => {
    assert.equal((await send(url)).status, 401);
    assert.equal((await send(url, { headers: { authorization: "Bearer short" } })).status, 401);
  });
  assert.equal(sent, 0);
});
test("App Check claim app_id alone is not the SDK response and must be rejected", async () => {
  let calls = 0;
  await withServer(deps({
    verifyAppCheck: async () => ({
      app_id: "1:599679789981:web:d4d8743dbff0fe40af1d74",
      alreadyConsumed: false
    }),
    handleReply: async () => { calls++; return {}; }
  }), async url => {
    assert.equal((await send(url)).status, 401);
  });
  assert.equal(calls, 0);
});
test("consumed SDK App Check response is rejected even with a matching appId", async () => {
  let calls = 0;
  await withServer(deps({
    verifyAppCheck: async () => ({
      appId: "1:599679789981:web:d4d8743dbff0fe40af1d74",
      alreadyConsumed: true
    }),
    handleReply: async () => { calls++; return {}; }
  }), async url => {
    assert.equal((await send(url)).status, 401);
  });
  assert.equal(calls, 0);
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