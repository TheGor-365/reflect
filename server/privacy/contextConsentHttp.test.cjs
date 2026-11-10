"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createConsentHttpListener, ORIGIN, PATH } = require("./contextConsentHttp.cjs");
const { CONSENT_VERSION, SCOPE } = require("./contextConsent.cjs");

const TOKEN = "x".repeat(90);
const UID = "synthetic-owner";
const APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const valid = { action: "grant", grantId: "grant-request-00001",
  scope: SCOPE, sourceId: "session-example-01",
  consentVersion: CONSENT_VERSION };

function harness(overrides = {}) {
  const calls = { auth: 0, app: 0, acl: 0, issue: 0, list: 0 };
  const options = {
    verifyAuth: async () => { calls.auth++; return { uid: UID }; },
    verifyAppCheck: async () => {
      calls.app++; return { appId: APP_ID, alreadyConsumed: false };
    },
    authorizeAccount: async () => { calls.acl++; return true; },
    execute: async (body, principal) => {
      calls.issue++; assert.equal(principal.uid, UID);
      assert.equal(principal.appCheckVerified, true);
      assert.equal(body.uid, undefined);
      return { status: body.action === "grant" ? "active" : "revoked",
        ...(body.action === "grant" ? { expiresAtMs: 1800000000000 } : {}) };
    },
    list: async principal => {
      calls.list++; assert.equal(principal.uid, UID);
      return { grants: [] };
    },
    ...overrides
  };
  return { calls, listener: createConsentHttpListener(options) };
}
async function withServer(listener, fn) {
  const server = http.createServer(listener);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await fn("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const send = async (url, { payload = valid, path = PATH, origin = ORIGIN,
  method = "POST", bearer = TOKEN, attestation = TOKEN,
  contentType = "application/json" } = {}) =>
  fetch(url + path, {
    method, headers: {
      Origin: origin, Authorization: "Bearer " + bearer,
      "X-Firebase-AppCheck": attestation, "Content-Type": contentType
    },
    ...(method === "POST" ? { body: typeof payload === "string"
      ? payload : JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(6000)
  });

test("signed, entitled owner can issue one consent, no provider call", async () => {
  const { calls, listener } = harness();
  await withServer(listener, async url => {
    const reply = await send(url);
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), {
      status: "active", expiresAtMs: 1800000000000
    });
    assert.equal(reply.headers.get("cache-control"), "no-store");
  });
  assert.deepEqual(calls, { auth: 1, app: 1, acl: 1, issue: 1, list: 0 });
});

test("authorization and attestation checked before any storage call", async () => {
  for (const override of [
    { verifyAuth: async () => { throw Error("token-invalid"); } },
    { verifyAppCheck: async () => { throw Error("bad-app-check"); } },
    { verifyAppCheck: async () => ({ appId: "another-app" }) },
    { verifyAppCheck: async () => ({ appId: APP_ID, alreadyConsumed: true }) },
    { verifyAuth: async () => ({ uid: "" }) },
    { authorizeAccount: async () => false }
  ]) {
    const { calls, listener } = harness(override);
    await withServer(listener, async url => {
      const response = await send(url);
      assert.equal(response.status, override.authorizeAccount ? 403 : 401);
    });
    assert.equal(calls.issue, 0);
    assert.equal(calls.list, 0);
  }
});

test("revoke and list are available after entitlement expiry but still require tokens", async () => {
  const { calls, listener } = harness({
    authorizeAccount: async () => { throw Error("should not be consulted"); }
  });
  await withServer(listener, async url => {
    assert.equal((await send(url, { payload: { action: "revoke",
      grantId: valid.grantId } })).status, 200);
    const listing = await send(url, { payload: { action: "list" } });
    assert.equal(listing.status, 200);
    assert.deepEqual(await listing.json(), { grants: [] });
  });
  assert.equal(calls.issue, 1);
  assert.equal(calls.list, 1);
  assert.equal(calls.acl, 0);
});

test("foreign Origin, near miss paths, GET and injected query strings never reach Auth", async () => {
  const { calls, listener } = harness();
  await withServer(listener, async url => {
    assert.equal((await send(url, { origin: "https://reflect-three.vercel.app" })).status, 403);
    assert.equal((await send(url, { path: PATH + "?other=true" })).status, 404);
    assert.equal((await send(url, { path: PATH + "/extra" })).status, 404);
    assert.equal((await send(url, { method: "GET" })).status, 404);
  });
  assert.equal(calls.auth, 0);
  assert.equal(calls.issue, 0);
});

test("grant refuses broad client payload, body overflow and non-JSON", async () => {
  const { calls, listener } = harness();
  await withServer(listener, async url => {
    for (const payload of [
      { ...valid, uid: "other-user" },
      { action: "list", privateHistory: true },
      "invalid-json",
      { action: "grant", text: "PRIVATE".repeat(500) }
    ]) {
      const response = await send(url, { payload });
      assert.equal(response.status, 400);
    }
    assert.equal((await send(url, { contentType: "text/plain" })).status, 400);
  });
  // These are boundary fixture calls, not a signed grant persistence test.
  assert.equal(calls.issue, 0);
});

test("missing credentials deny before reading payload; revoke errors are redacted", async () => {
  const { calls, listener } = harness({
    execute: async () => { throw Error("PRIVATE_SESSION_CONTENT"); }
  });
  await withServer(listener, async url => {
    assert.equal((await send(url, { bearer: "short" })).status, 401);
    const result = await send(url, { payload: { action: "revoke",
      grantId: valid.grantId } });
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), { error: "request-failed" });
  });
  assert.equal(calls.auth, 1);
});
