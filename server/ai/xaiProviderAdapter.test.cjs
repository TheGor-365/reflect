"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PolicyError } = require("./policy.cjs");
const { MODEL, ENDPOINT } = require("./xaiContract.cjs");
const {
  createXaiProviderAdapter, MAX_RESPONSE_BYTES, MAX_TIMEOUT_MS
} = require("./xaiProviderAdapter.cjs");

const FAKE_KEY = "xai-" + "A".repeat(40); // Generated fixture, not a credential.
const reply = (overrides = {}) => ({
  model: MODEL,
  status: "completed",
  output: [{
    type: "message", role: "assistant",
    content: [{ type: "output_text", text: "Задайте себе один вопрос." }]
  }],
  usage: { input_tokens: 210, output_tokens: 28 },
  ...overrides
});
const success = (payload = reply()) => new Response(JSON.stringify(payload), {
  status: 200, headers: { "content-type": "application/json; charset=utf-8" }
});
const denied = code => error =>
  error instanceof PolicyError && error.code === code &&
  error.message === "AI request rejected by server policy.";

test("requires explicitly injected server transport and secret reader", () => {
  for (const config of [
    {}, { transport: fetch }, { readSecret: () => FAKE_KEY },
    { transport: null, readSecret: () => FAKE_KEY },
    { transport: async () => success(), readSecret: () => FAKE_KEY,
      timeoutMs: MAX_TIMEOUT_MS + 1 },
    { transport: async () => success(), readSecret: () => FAKE_KEY,
      timeoutMs: -1 }
  ]) assert.throws(() => createXaiProviderAdapter(config),
    denied("unsafe-environment"));
});

test("one explicit message, locked model and provider endpoint; no history or tools", async () => {
  let calls = 0, keyReads = 0;
  const adapter = createXaiProviderAdapter({
    readSecret: () => { keyReads++; return FAKE_KEY; },
    transport: async (url, options) => {
      calls++;
      assert.equal(url, ENDPOINT);
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, "Bearer " + FAKE_KEY);
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.ok(options.signal instanceof AbortSignal);
      const body = JSON.parse(options.body);
      assert.equal(body.model, "grok-4.3");
      assert.equal(body.store, false);
      assert.equal(body.stream, false);
      assert.deepEqual(body.tools, []);
      assert.equal(body.tool_choice, "none");
      assert.equal(body.truncation, "disabled");
      assert.deepEqual(body.reasoning, { effort: "none" });
      assert.equal(body.max_output_tokens, 512);
      assert.deepEqual(body.input.map(item => item.role), ["system", "user"]);
      assert.equal(body.input[1].content, "Только одна мысль");
      for (const forbidden of [
        "uid", "providerKey", "diary", "history", "sessionId",
        "previous_response_id", "profile", "email"
      ]) {
        assert.equal(Object.hasOwn(body, forbidden), false);
      }
      return success();
    }
  });
  const result = await adapter.invoke(" Только одна мысль ");
  assert.equal(calls, 1);
  assert.equal(keyReads, 1);
  assert.deepEqual(result.usage, { inputTokens: 210, outputTokens: 28 });
  assert.equal(result.text, "Задайте себе один вопрос.");
  assert.equal(result.model, MODEL);
  assert.ok(result.estimatedUsdFromPublishedRates > 0);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(result).includes(FAKE_KEY), false);
});

test("invalid input fails before credential read or external transport", async () => {
  let keys = 0, requests = 0;
  const adapter = createXaiProviderAdapter({
    readSecret: () => { keys++; return FAKE_KEY; },
    transport: async () => { requests++; return success(); }
  });
  for (const message of ["", " ", "x".repeat(4001), "bad\u0000text",
    { message: "text", history: ["private"] }, null]) {
    await assert.rejects(adapter.invoke(message), denied("invalid-argument"));
  }
  assert.equal(keys, 0);
  assert.equal(requests, 0);
});

test("bad or unavailable server-owned secret never reaches transport", async () => {
  let requests = 0;
  for (const readSecret of [
    () => "", () => "abc", () => "xai-abc\nX-Injected: true",
    async () => { throw new Error("DO_NOT_EXPOSE_SECRET_PATH"); }
  ]) {
    const adapter = createXaiProviderAdapter({
      readSecret,
      transport: async () => { requests++; return success(); }
    });
    await assert.rejects(adapter.invoke("Тест"), error =>
      denied("unavailable")(error) &&
      !error.message.includes("DO_NOT_EXPOSE"));
  }
  assert.equal(requests, 0);
});

test("non-200 upstream errors are redacted and never retried", async () => {
  for (const status of [400, 401, 403, 404, 405, 415, 422, 429, 500, 503]) {
    let calls = 0;
    const adapter = createXaiProviderAdapter({
      readSecret: () => FAKE_KEY,
      transport: async () => {
        calls++;
        return new Response('{"error":"DO_NOT_EXPOSE_PROVIDER_BODY"}', {
          status, headers: { "content-type": "application/json" }
        });
      }
    });
    await assert.rejects(adapter.invoke("Тест"), error =>
      denied("unavailable")(error) &&
      error.upstreamHttpStatus === status &&
      !Object.keys(error).includes("upstreamHttpStatus") &&
      !JSON.stringify(error).includes("DO_NOT_EXPOSE"));
    assert.equal(calls, 1, "Must not retry provider HTTP " + status);
  }
});

test("transport errors are always generic and never retried", async () => {
  let calls = 0;
  const adapter = createXaiProviderAdapter({
    readSecret: () => FAKE_KEY,
    transport: async () => {
      calls++;
      throw new Error("PRIVATE_REQUEST_TEXT_OR_KEY");
    }
  });
  await assert.rejects(adapter.invoke("Тест"), error =>
    denied("unavailable")(error) &&
    !error.message.includes("PRIVATE_REQUEST"));
  assert.equal(calls, 1);
});

test("timeout abort is passed to transport, with no retry", async () => {
  let calls = 0;
  const adapter = createXaiProviderAdapter({
    readSecret: () => FAKE_KEY, timeoutMs: 10,
    transport: (_url, options) => {
      calls++;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(new Error("SENSITIVE_ABORT_DETAIL")), { once: true });
      });
    }
  });
  await assert.rejects(adapter.invoke("Тест"), denied("unavailable"));
  assert.equal(calls, 1);
});

test("response with wrong content-type or malformed JSON is refused", async () => {
  const inputs = [
    new Response("<html>SECRET</html>", { status: 200 }),
    new Response("{broken", {
      status: 200, headers: { "content-type": "application/json" }
    }),
    new Response("", {
      status: 200, headers: { "content-type": "application/json" }
    })
  ];
  for (const response of inputs) {
    const adapter = createXaiProviderAdapter({
      readSecret: () => FAKE_KEY,
      transport: async () => response
    });
    await assert.rejects(adapter.invoke("Тест"),
      denied("invalid-provider-response"));
  }
});

test("content-length over cap is denied before parsing", async () => {
  const response = new Response(JSON.stringify(reply()), {
    status: 200,
    headers: { "content-type": "application/json",
      "content-length": String(MAX_RESPONSE_BYTES + 1) }
  });
  const adapter = createXaiProviderAdapter({
    readSecret: () => FAKE_KEY, transport: async () => response
  });
  await assert.rejects(adapter.invoke("Тест"),
    denied("invalid-provider-response"));
});

test("streaming without content-length stops at capped bytes", async () => {
  let reads = 0;
  const body = new ReadableStream({
    pull(controller) {
      reads++;
      controller.enqueue(new Uint8Array(20000).fill(65));
      if (reads > 20) controller.close();
    }
  });
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  const adapter = createXaiProviderAdapter({
    readSecret: () => FAKE_KEY, transport: async () => response
  });
  await assert.rejects(adapter.invoke("Тест"),
    denied("invalid-provider-response"));
  assert.ok(reads <= 8, "Must stop reading promptly at the byte cap");
});

test("malformed model/usage or tool-call response cannot reach caller", async () => {
  for (const payload of [
    reply({ model: "other-model" }),
    reply({ usage: { input_tokens: 200, output_tokens: 10000 } }),
    reply({ output: [{ type: "function_call", arguments: "do_something" }] }),
    reply({ output: [{ type: "message", role: "assistant", content: [
      { type: "output_text", text: "x".repeat(5000) }
    ] }] })
  ]) {
    const adapter = createXaiProviderAdapter({
      readSecret: () => FAKE_KEY, transport: async () => success(payload)
    });
    await assert.rejects(adapter.invoke("Тест"),
      denied("invalid-provider-response"));
  }
});

test("redirected 200 and incorrectly shaped response are rejected", async () => {
  const adapter = createXaiProviderAdapter({
    readSecret: () => FAKE_KEY,
    transport: async () => ({ status: 200, ok: true, redirected: true })
  });
  await assert.rejects(adapter.invoke("Тест"),
    denied("invalid-provider-response"));
});

test("source contains no env credential fallback, default fetch, or real app wiring", () => {
  const source = require("node:fs").readFileSync(__dirname + "/xaiProviderAdapter.cjs", "utf8");
  assert.equal(source.includes("process.env.XAI_API_KEY"), false);
  assert.equal(source.includes("globalThis.fetch"), false);
  assert.equal(source.includes("console.log("), false);
  assert.equal(source.includes("getFirestore("), false);
  assert.equal(source.includes("getItem("), false);
  assert.equal(source.includes("import.meta.env"), false);
});
