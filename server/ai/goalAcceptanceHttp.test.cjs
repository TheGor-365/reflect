"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { PATH, ORIGIN, createGoalAcceptanceHttpListener } = require("./goalAcceptanceHttp.cjs");
const body = { sessionId: "s1", sourceTurnId: "user-request-fixture-0001",
  assistantTurnId: "assistant-request-fixture-0001", candidateIndex: 0, confirmed: true,
  goalTitle: "Synthetic goal", goalPurpose: "", goalStep: "Step", goalCriteria: "Criteria" };
const goalId = "verified-" + "a".repeat(64);
function harness(options = {}) {
  const calls = [];
  const listener = createGoalAcceptanceHttpListener({
    verifyAuth: async () => { calls.push("auth"); if (options.badAuth) throw Error("private auth error"); return { uid: "alice" }; },
    verifyAppCheck: async () => { calls.push("app"); return {
      appId: options.appId ?? "1:599679789981:web:d4d8743dbff0fe40af1d74",
      alreadyConsumed: options.consumed ?? false }; },
    authorizeAccount: async () => { calls.push("entitlement"); return options.entitled ?? true; },
    checkEnabled: async () => { calls.push("enabled"); return options.enabled ?? true; },
    rateLimit: async uid => { calls.push("quota"); assert.equal(uid, "alice");
      if (options.limited) throw Object.assign(Error("private quota"), { code: "resource-exhausted" }); },
    accept: async (input, principal) => { calls.push("accept"); assert.deepEqual(principal, { uid: "alice" });
      assert.deepEqual(input, body);
      if (options.error) throw Object.assign(Error("PRIVATE SOURCE TEXT"), { code: options.error });
      return { goalId, status: "accepted", alreadyAccepted: false, privateField: "never expose" }; }
  });
  const req = Readable.from([Buffer.from(JSON.stringify(options.body ?? body))]);
  req.method = options.method ?? "POST"; req.url = options.path ?? PATH;
  req.headers = { origin: options.origin ?? ORIGIN, "content-type": "application/json",
    authorization: "Bearer " + "a".repeat(40), "x-firebase-appcheck": "b".repeat(40), ...options.headers };
  const res = { writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(raw) { this.data = raw ? JSON.parse(raw) : null; } };
  return { calls, async run() { await listener(req,res); return res; } };
}
test("authorized goal acceptance uses verified UID and returns only public fields", async () => {
  const h = harness(), res = await h.run();
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { goalId, status: "accepted", alreadyAccepted: false });
  assert.deepEqual(h.calls, ["auth","app","entitlement","enabled","quota","accept"]);
  assert.equal(res.headers["cache-control"], "no-store, private");
});
test("origin, method, exact route and preflight do not reach auth or storage", async () => {
  for (const [options,status] of [[{origin:"https://evil.invalid"},403],
    [{path:PATH+"?x=1"},404],[{method:"GET"},404],[{method:"OPTIONS"},204]]) {
    const h = harness(options); assert.equal((await h.run()).status,status);
    assert.deepEqual(h.calls,[]);
  }
});
test("forged UID, absent confirmation and oversized payload rejected before auth", async () => {
  for (const patch of [{uid:"bob"},{confirmed:false},{goalTitle:"x".repeat(9000)}]) {
    const h = harness({body:{...body,...patch}});
    assert.equal((await h.run()).status,400); assert.deepEqual(h.calls,[]);
  }
});
test("failed auth, consumed or wrong App Check never reach acceptance", async () => {
  for (const options of [{badAuth:true},{consumed:true},{appId:"other"}]) {
    const h = harness(options); assert.equal((await h.run()).status,401);
    assert.equal(h.calls.includes("entitlement"),false);
    assert.equal(h.calls.includes("accept"),false);
  }
});
test("entitlement, independent gate and quota fail closed before acceptance", async () => {
  for (const [options,status] of [[{entitled:false},403],[{enabled:false},503],[{limited:true},429]]) {
    const h = harness(options); assert.equal((await h.run()).status,status);
    assert.equal(h.calls.includes("accept"),false);
  }
});
test("source denial and internal errors are redacted; conflicts are bounded", async () => {
  for (const [error,status,publicCode] of [["unverified",403,"source-not-eligible"],
    ["invalid-source",403,"source-not-eligible"],["revoked",403,"source-not-eligible"],
    ["acceptance-conflict",409,"acceptance-conflict"],["private-sdk-error",503,"unavailable"]]) {
    const res = await harness({error}).run(); assert.equal(res.status,status);
    assert.deepEqual(res.data,{error:publicCode});
  }
});
