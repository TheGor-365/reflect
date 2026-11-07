"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const {
  makeLocalSmokeServer, gateAllowed, FIXED_PROMPT, ORIGIN
} = require("./localXaiSmoke.cjs");

const ENV = {
  REFLECT_XAI_DEV_ONLY: "enabled",
  REFLECT_XAI_ALLOW_ONE_LIVE_REQUEST: "approved"
};
const KEY = "xai-" + "X".repeat(80); // NEVER a real provider credential
const fixture = {
  model: "grok-4.3",
  status: "completed",
  output: [{
    type: "message", role: "assistant",
    content: [{ type: "output_text", text: "Запись мыслей помогает увидеть связи." }]
  }],
  usage: { input_tokens: 120, output_tokens: 25 }
};
async function setup(t, { response, loadKey, env } = {}) {
  let count = 0;
  let recorded = null;
  const server = makeLocalSmokeServer({
    env: env || ENV,
    loadKey: loadKey || (() => KEY),
    transport: async (url, options) => {
      count++;
      recorded = { url, options };
      if (response) return response(url, options);
      return new Response(JSON.stringify(fixture), {
        status: 200, headers: { "Content-Type": "application/json" }
      });
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const send = (options = {}) => fetch(base + "/smoke", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Reflect-Smoke": "explicit-one-shot",
      Origin: ORIGIN
    },
    body: JSON.stringify({ confirm: "synthetic-only" }),
    ...options
  });
  return { base, send, calls: () => count, request: () => recorded };
}
test("server disabled unless owner explicitly approves local one-shot", () => {
  for (const env of [
    {}, { ...ENV, FUNCTIONS_EMULATOR: "true" },
    { ...ENV, K_SERVICE: "prod" },
    { ...ENV, NODE_ENV: "production" },
    { ...ENV, REFLECT_XAI_ALLOW_ONE_LIVE_REQUEST: "no" }
  ]) {
    assert.equal(gateAllowed(env), false);
    assert.throws(() => makeLocalSmokeServer({ env }), /local-smoke-disabled/);
  }
  assert.equal(gateAllowed(ENV), true);
});
test("one synthetic in-app action produces one POST to pinned xAI endpoint", async t => {
  const s = await setup(t);
  const r = await s.send();
  assert.equal(r.status, 200);
  const value = await r.json();
  assert.equal(value.mode, "xai-live-local-synthetic-smoke");
  assert.equal(value.reply, "Запись мыслей помогает увидеть связи.");
  assert.ok(value.estimatedUsd > 0);
  const req = s.request();
  assert.equal(req.url, "https://api.x.ai/v1/responses");
  assert.equal(req.options.method, "POST");
  assert.equal(req.options.headers.Authorization, "Bearer " + KEY);
  const body = JSON.parse(req.options.body);
  assert.deepEqual(body.input.map(x => x.role), ["system", "user"]);
  assert.equal(body.input[1].content, FIXED_PROMPT);
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, []);
  assert.equal(body.model, "grok-4.3");
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.equal(body.max_output_tokens, 128);
  assert.equal(s.calls(), 1);
  const repeat = await s.send();
  assert.equal(repeat.status, 409);
  assert.equal(s.calls(), 1);
});
test("cross-site and unexpected body cannot trigger even a mock provider call", async t => {
  const s = await setup(t);
  const denied = await s.send({
    headers: {
      Origin: "https://example.com",
      "Content-Type": "application/json",
      "X-Reflect-Smoke": "explicit-one-shot"
    }
  });
  assert.equal(denied.status, 403);
  const malformed = await s.send({
    body: JSON.stringify({
      confirm: "synthetic-only",
      message: "private journal content should be rejected"
    })
  });
  assert.equal(malformed.status, 400);
  const missing = await s.send({
    headers: { Origin: ORIGIN, "Content-Type": "application/json" }
  });
  assert.equal(missing.status, 403);
  assert.equal(s.calls(), 0);
});
test("missing key is reported safely with no provider traffic", async t => {
  const s = await setup(t, { loadKey: () => { throw new Error("missing"); } });
  const result = await s.send();
  assert.equal(result.status, 412);
  assert.deepEqual(await result.json(), { error: "key-file-missing-or-unsafe" });
  assert.equal(s.calls(), 0);
});
test("upstream denied key is shown as status only and never retried", async t => {
  const s = await setup(t, {
    response: async () => new Response(
      JSON.stringify({ error: "secret private error must not leave server" }),
      { status: 403 }
    )
  });
  const result = await s.send();
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(),
    { error: "xai-http-error", providerHttpStatus: 403 });
  assert.equal(s.calls(), 1);
  const retry = await s.send();
  assert.equal(retry.status, 409);
  assert.equal(s.calls(), 1);
});
test("failed/invalid provider JSON is not leaked to browser", async t => {
  const s = await setup(t, {
    response: async () => new Response(
      JSON.stringify({ ...fixture, output: [
        { type: "function_call", name: "read_private_history" }
      ] }),
      { status: 200 }
    )
  });
  const r = await s.send();
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(),
    { error: "xai-transport-or-response-invalid" });
});
test("concurrent clicks are limited to one paid call", async t => {
  const s = await setup(t, {
    response: async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return new Response(JSON.stringify(fixture), { status: 200 });
    }
  });
  const [a,b] = await Promise.all([s.send(), s.send()]);
  assert.deepEqual([a.status,b.status].sort(), [200,409]);
  assert.equal(s.calls(), 1);
});
test("health status is restricted to the local approved origin", async t => {
  const s = await setup(t);
  const blocked = await fetch(s.base + "/status");
  assert.equal(blocked.status, 403);
  const ok = await fetch(s.base + "/status", {
    headers: { Origin: ORIGIN }
  });
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.ready, true);
  assert.equal(data.promptKind, "fixed-synthetic-only");
});
