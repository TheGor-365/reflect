"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createXaiProviderProbe } = require("./xaiProviderProbe.cjs");
const KEY = "xai-" + "Q".repeat(40);
const ENDPOINT = "https://api.x.ai/v1/models/grok-4.3";
test("never generates text; authenticates one read-only model GET and caches outcome", async () => {
  let calls = 0;
  const probe = createXaiProviderProbe({
    readSecret: () => KEY,
    transport: async (url, opts) => {
      calls++;
      assert.equal(url, ENDPOINT);
      assert.equal(opts.method, "GET");
      assert.equal(opts.redirect, "error");
      assert.equal(opts.headers.Authorization, "Bearer " + KEY);
      assert.equal("body" in opts, false);
      assert.ok(opts.signal instanceof AbortSignal);
      return { status: 200, redirected: false };
    }
  });
  assert.equal(await probe(), "model-accessible");
  assert.equal(await probe(), "model-accessible");
  assert.equal(calls, 1);
});
test("read-only GET returns sanitized status categories, never a raw response", async () => {
  const cases = [[400,"credentials-rejected"],[401,"credentials-rejected"],
    [403,"access-denied"],[404,"model-unavailable"],
    [429,"provider-rate-limited"],[500,"provider-unavailable"],
    [503,"provider-unavailable"]];
  for (const [status,category] of cases) {
    const probe = createXaiProviderProbe({ readSecret: () => KEY,
      transport: async () => ({ status, redirected:false,
        body:{ cancel: async () => { } } }) });
    assert.equal(await probe(),category);
  }
});
test("bad credentials never reach provider", async () => {
  for (const readSecret of [() => "", () => "PRIVATE", () => "xai-bad",
    async () => { throw Error("SECRET"); }]) {
    let calls = 0;
    const probe = createXaiProviderProbe({ readSecret,
      transport: async () => { calls++; } });
    assert.equal(await probe(), "credentials-unavailable");
    assert.equal(calls,0);
  }
});
test("transport failures, redirects and malformed responses are redacted", async () => {
  for(const transport of [
    async () => { throw Error("SENSITIVE_TOKEN"); },
    async () => ({ status: 200, redirected:true }),
    async () => ({ status:"200",redirected:false })
  ]) {
    const probe = createXaiProviderProbe({readSecret:()=>KEY,transport});
    assert.equal(await probe(),"provider-unavailable");
  }
});
test("never serializes model body or credential when response cancel fails", async () => {
  const probe=createXaiProviderProbe({readSecret:()=>KEY,
    transport:async()=>({status:403,redirected:false,
      body:{cancel:async()=>{throw Error("SECRET");}}})});
  const status=await probe();
  assert.equal(status,"access-denied");
  assert.equal(JSON.stringify(status).includes(KEY),false);
});
