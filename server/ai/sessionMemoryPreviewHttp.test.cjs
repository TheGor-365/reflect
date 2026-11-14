"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const {
  PATH, ORIGIN, createSessionMemoryPreviewHttpListener, validatePreview
} = require("./sessionMemoryPreviewHttp.cjs");
const { SCOPE } = require("../privacy/contextConsent.cjs");
const { PolicyError } = require("./policy.cjs");
const command = Object.freeze({
  grantId: "grant-m3d-1234567890123456",
  sourceId: "synthetic-session-123", requestId: "request-m3d-123456789",
  message: "Это синтетический вопрос. Что нужно уточнить?", scope: SCOPE
});
const preview = Object.freeze({
  sourceId: command.sourceId, requestId: command.requestId,
  scope: SCOPE, approvalDigest: "a".repeat(64),
  turns: [{ sourceTurnId: "user-prior", role: "user",
    content: "Факт из вымышленной сессии",
    untrustedSource: true, truncated: false }],
  totalBytes: Buffer.byteLength("Факт из вымышленной сессии", "utf8"),
  truncated: false, providerDispatchAllowed: false
});
function harness({ body = command, tokenUsed = false, entitled = true,
    owner = "eric-synthetic", source = preview, deniedPreview = false,
    origin = ORIGIN, method = "POST" } = {}) {
  const calls = { auth: 0, app: 0, entitlement: 0, quota: 0, preview: 0 };
  const listener = createSessionMemoryPreviewHttpListener({
    verifyAuth: async () => { calls.auth++; return { uid: owner }; },
    verifyAppCheck: async () => {
      calls.app++;
      return { appId: "1:599679789981:web:d4d8743dbff0fe40af1d74",
        alreadyConsumed: tokenUsed };
    },
    authorizeAccount: async () => { calls.entitlement++; return entitled; },
    rateLimit: async uid => {
      calls.quota++;
      assert.equal(uid, owner);
    },
    preview: async args => {
      calls.preview++;
      assert.equal(args.principal.uid, owner);
      assert.equal(args.principal.appCheckVerified, true);
      assert.deepEqual(Object.keys(args).sort(),
        ["grantId", "sourceId", "requestId", "message", "scope", "principal"].sort());
      if (deniedPreview) throw new PolicyError("permission-denied");
      return source;
    }
  });
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = PATH;
  req.headers = {
    origin, "content-type": "application/json",
    authorization: "Bearer " + "a".repeat(44),
    "x-firebase-appcheck": "b".repeat(48)
  };
  const response = {
    status: null, headers: {}, payload: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(raw) { this.payload = JSON.parse(raw); }
  };
  return { calls, async run() { await listener(req, response); return response; } };
}

test("M3d signed preview exposes bounded owner excerpts only; no provider authorization", async () => {
  const h = harness();
  const response = await h.run();
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-store, private");
  assert.equal(response.payload.disclosureRequired, true);
  assert.equal(response.payload.providerDispatchAllowed, false);
  assert.equal(response.payload.approvalDigest, "a".repeat(64));
  assert.equal(response.payload.turns[0].role, "user");
  assert.equal(Object.hasOwn(response.payload, "uid"), false);
  assert.equal(Object.hasOwn(response.payload, "grantId"), false);
  assert.deepEqual(h.calls, { auth:1, app:1, entitlement:1, quota:1, preview:1 });
});

test("M3d consumed App Check or expired entitlement rejects before session read", async () => {
  for (const option of [{ tokenUsed: true }, { entitled: false }]) {
    const h = harness(option);
    const res = await h.run();
    assert.ok([401,403].includes(res.status));
    assert.equal(h.calls.preview, 0);
    assert.equal(h.calls.quota, 0);
  }
});

test("M3d revoked or foreign grant never leaks owner text", async () => {
  const h = harness({ deniedPreview: true });
  const res = await h.run();
  assert.equal(res.status, 403);
  assert.deepEqual(res.payload, { error: "permission-denied" });
  assert.equal(h.calls.quota, 1);
});

test("M3d rejects forged payload or origin before session read", async () => {
  for (const body of [{...command, uid: "jack"},
    {...command, history: []}, {...command, scope: "all-history"}]) {
    const h = harness({ body });
    const res = await h.run();
    assert.equal(res.status, 400);
    assert.equal(h.calls.auth, 0);
  }
  const h = harness({ origin: "https://evil.invalid" });
  const res = await h.run();
  assert.equal(res.status, 403);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
  assert.equal(h.calls.auth, 0);
});

test("M3d rejects altered, wrong-owner or oversized server preview", () => {
  for (const changed of [
    { ...preview, providerDispatchAllowed: true },
    { ...preview, turns: [{...preview.turns[0], content: "X".repeat(301)}] },
    { ...preview, approvalDigest: "not-a-digest" },
    { ...preview, sourceId: "other-session" }
  ]) {
    assert.throws(() => validatePreview(changed, command), e => e.code === "unavailable");
  }
});
