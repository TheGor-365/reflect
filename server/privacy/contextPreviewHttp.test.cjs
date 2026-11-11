"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createPreviewHttpListener, PATH, ORIGIN } = require("./contextPreviewHttp.cjs");
const { PolicyError } = require("../ai/policy.cjs");
const { SCOPE, PROJECT_ID } = require("./contextConsent.cjs");

const TOKEN = "signed-firebase-token-synthetic-".padEnd(80, "x");
const APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const BODY = {
  grantId: "synthetic-grant-id-00001",
  sourceId: "synthetic-session-1",
  scope: SCOPE
};

function context() {
  return {
    sourceId: BODY.sourceId, scope: SCOPE,
    turns: [{
      role: "user",
      content: "Тестовая история 🙂",
      truncated: false,
      untrustedSource: true
    }],
    totalBytes: Buffer.byteLength("Тестовая история 🙂", "utf8"),
    sourceTurnCount: 1,
    truncated: false,
    disclosureRequired: true,
    providerDispatchAllowed: false,
    notAnAllowedResponse: "SECRET_FROM_BACKEND"
  };
}

function fixture(overrides = {}) {
  const calls = { auth: 0, app: 0, account: 0, rate: 0, preview: 0 };
  const listen = createPreviewHttpListener({
    verifyAuth: async () => {
      calls.auth++; return { uid: "owner-A" };
    },
    verifyAppCheck: async () => {
      calls.app++; return { appId: APP_ID, alreadyConsumed: false };
    },
    authorizeAccount: async () => { calls.account++; return true; },
    rateLimit: async uid => { calls.rate++; assert.equal(uid, "owner-A"); },
    preview: async x => {
      calls.preview++;
      assert.deepEqual(x, {
        principal: {
          uid: "owner-A", projectId: PROJECT_ID, appCheckVerified: true
        },
        ...BODY
      });
      return context();
    },
    ...overrides
  });
  return { listen, calls };
}

async function withServer(handler, action) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    return await action("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

const request = (url, {
  origin = ORIGIN, path = PATH, method = "POST", command = BODY,
  bearer = TOKEN, appToken = TOKEN, contentType = "application/json"
} = {}) => fetch(url + path, {
  method,
  headers: {
    Origin: origin,
    Authorization: "Bearer " + bearer,
    "X-Firebase-AppCheck": appToken,
    "Content-Type": contentType
  },
  ...(method === "POST" ? {
    body: typeof command === "string" ? command : JSON.stringify(command)
  } : {}),
  signal: AbortSignal.timeout(7000)
});

test("signed owner sees only bounded exact preview and review hash, never UID/secret", async () => {
  const { listen, calls } = fixture();
  await withServer(listen, async url => {
    const r = await request(url);
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.deepEqual(data.turns, context().turns);
    assert.equal(data.providerDispatchAllowed, false);
    assert.equal(data.disclosureRequired, true);
    assert.match(data.previewHash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(data).includes("SECRET_FROM_BACKEND"), false);
    assert.equal(JSON.stringify(data).includes("owner-A"), false);
    assert.match(r.headers.get("cache-control"), /no-store/);
    assert.equal(r.headers.get("pragma"), "no-cache");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
  });
  assert.deepEqual(calls, { auth: 1, app: 1, account: 1, rate: 1, preview: 1 });
});

test("invalid browser Origin, near-miss path and GET cause no principal lookup", async () => {
  const { listen, calls } = fixture();
  await withServer(listen, async url => {
    assert.equal((await request(url, { origin: "https://production.example" })).status, 403);
    assert.equal((await request(url, { path: PATH + "?debug=true" })).status, 404);
    assert.equal((await request(url, { path: PATH + "/oops" })).status, 404);
    assert.equal((await request(url, { method: "GET" })).status, 404);
  });
  assert.equal(calls.auth, 0);
  assert.equal(calls.preview, 0);
});

test("unsigned, forged, replayed or unconsumed tokens never read session", async () => {
  const denial = [
    { bearer: "short" },
    { appToken: "short" },
    { verifyAuth: async () => { throw Error("token-invalid"); } },
    { verifyAppCheck: async () => { throw Error("App Check invalid"); } },
    { verifyAppCheck: async () => ({ appId: "foreign-project", alreadyConsumed: false }) },
    { verifyAppCheck: async () => ({ appId: APP_ID, alreadyConsumed: true }) },
    { verifyAppCheck: async () => ({ appId: APP_ID }) },
    { verifyAppCheck: async () => ({ appId: APP_ID, alreadyConsumed: "false" }) }
  ];
  for (const entry of denial) {
    const overrides = Object.fromEntries(Object.entries(entry)
      .filter(([k]) => k.startsWith("verify")));
    const { listen, calls } = fixture(overrides);
    await withServer(listen, async url => {
      const res = await request(url, {
        ...(entry.bearer ? { bearer: entry.bearer } : {}),
        ...(entry.appToken ? { appToken: entry.appToken } : {})
      });
      assert.equal(res.status, 401);
      assert.ok(["unauthenticated", "reauthentication-required"].includes(
        (await res.json()).error
      ));
    });
    assert.equal(calls.preview, 0);
    assert.equal(calls.rate, 0);
  }
});

test("entitlement revoked denies preview despite active grant", async () => {
  const { listen, calls } = fixture({ authorizeAccount: async () => false });
  await withServer(listen, async url => {
    const r = await request(url);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, "permission-denied");
  });
  assert.equal(calls.rate, 0);
  assert.equal(calls.preview, 0);
});

test("only exact grantId/sourceId/scope are accepted before any database operation", async () => {
  const { listen, calls } = fixture();
  await withServer(listen, async url => {
    for (const command of [
      { ...BODY, uid: "foreign" },
      { ...BODY, scope: "all-history" },
      { ...BODY, sourceId: "../../foreign" },
      { ...BODY, grantId: "short" },
      "not json",
      { ...BODY, fake: "x".repeat(1000) }
    ]) {
      const r = await request(url, { command });
      assert.equal(r.status, 400);
      assert.equal((await r.json()).error, "invalid-argument");
    }
    assert.equal((await request(url, { contentType: "text/plain" })).status, 400);
  });
  assert.equal(calls.auth, 0);
  assert.equal(calls.rate, 0);
});

test("quota denial or revocation before/during read fail closed, never leak text", async () => {
  for (const overrides of [
    { rateLimit: async () => { throw new PolicyError("resource-exhausted"); } },
    { preview: async () => { throw new PolicyError("permission-denied"); } },
    { preview: async () => { throw new Error("PERSONAL_PRIVATE_TEXT"); } },
    { preview: async () => ({ ...context(), providerDispatchAllowed: true }) }
  ]) {
    const { listen, calls } = fixture(overrides);
    await withServer(listen, async url => {
      const r = await request(url);
      assert.notEqual(r.status, 200);
      const raw = await r.text();
      assert.equal(raw.includes("PERSONAL_PRIVATE_TEXT"), false);
      assert.equal(raw.includes("Тестовая история"), false);
    });
    if (overrides.rateLimit) assert.equal(calls.preview, 0);
  }
});

test("revoked Firebase Auth reports safe error, no history read", async () => {
  const { listen, calls } = fixture({
    verifyAuth: async () => {
      throw Object.assign(Error("revoked token"), { code: "auth/id-token-revoked" });
    }
  });
  await withServer(listen, async url => {
    const r = await request(url);
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error, "reauthentication-required");
  });
  assert.equal(calls.preview, 0);
});
