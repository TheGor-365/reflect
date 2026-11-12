"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createXaiProviderAdapter } = require("./xaiProviderAdapter.cjs");
const { VERSION } = require("./interactionContract.cjs");
const { PolicyError } = require("./policy.cjs");
const key = "xai-" + "X".repeat(40); // synthetic, never a credential
const message = "Не могу решить, менять ли работу с большей зарплатой.";
const settings = {
  schemaVersion: 1, responseDepth: "balanced", responseTone: "analytical",
  askClarifyingQuestions: true, recommendationsEnabled: true,
  autoSaveRecommendations: false, recommendationFrequency: "balanced"
};
const payload = overrides => ({
  version: VERSION, answer: "Сравните критерии работы, не решая за один день.",
  intent: "decide", stage: "clarify",
  clarifyingQuestion: "Какая неопределённость для вас приемлема?",
  insights: [], recommendationCandidates: [],
  goalCandidates: [], sourceRefs: ["current-message"],
  unknowns: ["Обязанности по новой должности"], safetyFlags: [],
  ...overrides
});
const response = data => new Response(JSON.stringify({
  model: "grok-4.3", status: "completed",
  output: [{ type: "message", role: "assistant", content: [
    { type: "output_text", text: JSON.stringify(data) }] }],
  usage: { input_tokens: 250, output_tokens: 160 }
}), { status: 200, headers: { "content-type": "application/json" } });
test("server-only V1: exactly one Responses call, validated UI projection, no hidden context", async () => {
  let calls = 0;
  const adapter = createXaiProviderAdapter({
    readSecret: async () => key,
    transport: async (url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.equal(url, "https://api.x.ai/v1/responses");
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.name, "reflect_interaction_v1");
      assert.equal(body.input[1].content, message);
      assert.equal(body.input.length, 2);
      assert.equal(body.store, false);
      assert.equal(body.reasoning.effort, "none");
      return response(payload());
    }
  });
  const output = await adapter.invoke(message, settings);
  assert.equal(calls, 1);
  assert.equal(output.text, payload().answer);
  assert.equal(output.interaction.stage, "clarify");
  assert.equal(output.interaction.goalCandidates.length, 0);
  assert.equal(output.usage.inputTokens, 250);
});
test("valid V1 structured envelope can exceed the legacy plain-text limit", async () => {
  let calls = 0;
  const structured = payload({
    stage: "synthesize", clarifyingQuestion: "",
    answer: "А".repeat(1050),
    insights: ["Б".repeat(220), "В".repeat(220)],
    unknowns: ["Г".repeat(150), "Д".repeat(150)],
    recommendationCandidates: [{
      title: "Обсудить критерии",
      rationale: "Р".repeat(330),
      sourceRefs: ["current-message"]
    }]
  });
  assert.ok(JSON.stringify(structured).length > 2400);
  const adapter = createXaiProviderAdapter({
    readSecret: () => key,
    transport: async () => { calls++; return response(structured); }
  });
  const result = await adapter.invoke(message, settings);
  assert.equal(calls, 1);
  assert.equal(result.text, structured.answer);
  assert.equal(result.interaction.recommendationCandidates.length, 1);
  assert.equal(result.interaction.goalCandidates.length, 0);
});

test("malformed structured output is rejected after one attempt, not exposed", async () => {
  let calls = 0;
  const adapter = createXaiProviderAdapter({
    readSecret: () => key,
    transport: async () => {
      calls++;
      return response(payload({ sourceRefs: ["fabricated-external-evidence"] }));
    }
  });
  await assert.rejects(adapter.invoke(message, settings),
    e => e instanceof PolicyError && e.code === "invalid-provider-response");
  assert.equal(calls, 1);
});
