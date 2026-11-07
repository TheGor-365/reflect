"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MODEL, ENDPOINT, createSyntheticXaiRequest, extractXaiText,
  estimatePublishedUsd, simulateXai
} = require("./xaiContract.cjs");
const { PolicyError, LIMITS } = require("./policy.cjs");

process.env.REFLECT_XAI_FIXTURES_ONLY = "yes";
const denied = code => error => error instanceof PolicyError &&
  error.code === code &&
  error.message === "AI request rejected by server policy.";
const reply = (overrides = {}) => ({
  model: MODEL, status: "completed",
  output: [{
    type: "message", role: "assistant",
    content: [{ type: "output_text", text: "О чём вы хотите подумать?" }]
  }],
  usage: { input_tokens: 210, output_tokens: 28 },
  ...overrides
});

test("fixed provider model, HTTPS endpoint and no tools or stateful store", () => {
  const request = createSyntheticXaiRequest("Тестовый вопрос");
  assert.equal(request.endpoint, ENDPOINT);
  assert.equal(request.method, "POST");
  assert.equal(request.endpoint, "https://api.x.ai/v1/responses");
  assert.equal(request.body.model, "grok-4.3");
  assert.equal(request.body.store, false);
  assert.equal(request.body.max_output_tokens, LIMITS.maxOutputTokens);
  assert.deepEqual(request.body.tools, []);
  assert.equal(request.body.tool_choice, "none");
  assert.equal(request.body.truncation, "disabled");
  assert.deepEqual(request.body.input.map(item => item.role), ["system", "user"]);
  assert.equal(request.body.input[1].content, "Тестовый вопрос");
});

test("single explicit message only; no implicit diary, UID, history or keys", () => {
  const raw = JSON.stringify(createSyntheticXaiRequest("Тест").body);
  for (const forbidden of [
    "apiKey", "uid", "chatHistory", "diaryNotes", "email", "authorization",
    "profile", "previous_response_id"
  ]) assert.equal(raw.includes('"' + forbidden + '"'), false);
});

test("rejects empty, long, binary and multibyte oversized messages", () => {
  for (const value of ["", " ", "x".repeat(4001), "😀".repeat(4000),
    "test\u0000bad", undefined, {}, 100]) {
    assert.throws(() => createSyntheticXaiRequest(value),
      denied("invalid-argument"));
  }
});

test("only completed assistant text is accepted; reasoning is ignored", () => {
  const result = extractXaiText(reply({
    output: [
      { type: "reasoning", summary: [{ text: "synthetic thoughts" }] },
      { type: "message", role: "assistant",
        content: [{ type: "output_text", text: "  Подумайте о следующем шаге. " }] }
    ]
  }));
  assert.equal(result.text, "Подумайте о следующем шаге.");
  assert.deepEqual(result.usage, { inputTokens: 210, outputTokens: 28 });
  assert.equal(JSON.stringify(result).includes("synthetic thoughts"), false);
});

test("provider must return selected model and completed status", () => {
  for (const override of [
    { model: "latest" }, { status: "incomplete" },
    { status: "in_progress" }, { output: [] },
    { output: Array(21).fill({ type: "reasoning" }) }
  ]) {
    assert.throws(() => extractXaiText(reply(override)),
      denied("invalid-provider-response"));
  }
});

test("no tool/function calls or non-assistant messages can be dispatched", () => {
  for (const output of [
    [{ type: "function_call", name: "fetch_database", arguments: "{}" }],
    [{ type: "message", role: "system",
      content: [{ type: "output_text", text: "bad" }] }],
    [{ type: "message", role: "assistant",
      content: [{ type: "tool_call", text: "bad" }] }],
    [{ type: "reasoning" }],
    [{ type: "message", role: "assistant",
      content: [{ type: "output_text", text: "" }] }]
  ]) assert.throws(() => extractXaiText(reply({ output })),
    denied("invalid-provider-response"));
});

test("rejects missing/inconsistent/over-budget provider usage", () => {
  for (const usage of [
    undefined, null, {}, { input_tokens: -1, output_tokens: 2 },
    { input_tokens: 100, output_tokens: LIMITS.maxOutputTokens + 1 },
    { input_tokens: "10", output_tokens: 2 }
  ]) assert.throws(() => extractXaiText(reply({ usage })),
    denied("invalid-provider-response"));
});

test("published noncached token prices are a projection, not a billing cap", () => {
  assert.equal(estimatePublishedUsd(100000, 0), 0.125);
  assert.equal(estimatePublishedUsd(0, 100000), 0.25);
});

test("cost function accepts only nonnegative reasonable integer usage", () => {
  for (const count of [-1, 1.1, NaN, Infinity, null, 200001]) {
    assert.throws(() => estimatePublishedUsd(count, 10), denied("invalid-usage"));
  }
});

test("synthetic fixture executes without a network client or API key", async () => {
  let requests = 0;
  const data = await simulateXai({
    message: "Тестовый вопрос",
    fixture: async request => {
      requests++;
      assert.equal(request.endpoint, ENDPOINT);
      assert.equal(request.body.model, MODEL);
      return reply();
    }
  });
  assert.equal(requests, 1);
  assert.equal(data.mode, "synthetic-fixture");
  assert.match(data.text, /О чём/);
  assert.ok(data.estimatedUsdFromPublishedRates > 0);
});

test("fixture failure is redacted and does not leak synthetic secret", async () => {
  const secret = "PRIVATE_SYNTHETIC_TEST_TEXT";
  await assert.rejects(simulateXai({
    message: secret,
    fixture: async () => { throw new Error("ERROR:" + secret); }
  }), error => denied("unavailable")(error) &&
    !error.message.includes(secret));
});

test("missing fixture or absent fail-closed gate cannot issue requests", async () => {
  await assert.rejects(simulateXai({ message: "hello" }),
    denied("unsafe-environment"));
  const old = process.env.REFLECT_XAI_FIXTURES_ONLY;
  delete process.env.REFLECT_XAI_FIXTURES_ONLY;
  try {
    await assert.rejects(simulateXai({
      message: "hello",
      fixture: async () => reply()
    }), denied("unsafe-environment"));
  } finally {
    process.env.REFLECT_XAI_FIXTURES_ONLY = old;
  }
});

test("fixture cannot return hidden execution instructions or malformed text", async () => {
  await assert.rejects(simulateXai({
    message: "synthetic",
    fixture: async () => reply({ output: [{ type: "function_call",
      name: "shell", arguments: "rm -rf" }] })
  }), denied("invalid-provider-response"));
});

test("response larger than allowed content fails before reaching caller", () => {
  assert.throws(() => extractXaiText(reply({
    output: [{ type: "message", role: "assistant", content: [
      { type: "output_text", text: "a".repeat(3000) }
    ] }]
  })), denied("invalid-provider-response"));
});
