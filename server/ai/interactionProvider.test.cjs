"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createXaiProviderAdapter } = require("./xaiProviderAdapter.cjs");
const { VERSION } = require("./interactionContract.cjs");
const { readOwnerSettings } = require("./hostedHandler.cjs");
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
      assert.equal(body.max_output_tokens, 1024);
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
    e => e instanceof PolicyError &&
      e.code === "invalid-provider-response" &&
      e.providerFailureStage === "interaction-contract" &&
      !Object.keys(e).includes("providerFailureStage"));
  assert.equal(calls, 1);
});

function fakeOwnerSettingsDb(uid, snapshot, visited) {
  const ref = {
    collection(name) { visited.push(["collection", name]); return this; },
    doc(name) { visited.push(["doc", name]); return this; },
    async get() { return snapshot; }
  };
  return ref;
}

test("M1 owner preferences survive Firestore -> provider prompt and candidate gate", async () => {
  const uid = "synthetic-owner-123";
  const visits = [];
  const ownerSettings = {
    ...settings,
    responseTone: "strategic",
    responseDepth: "deep",
    showContextIndicator: true
  };
  const raw = await readOwnerSettings(fakeOwnerSettingsDb(uid, {
    exists: true, data: () => ownerSettings
  }, visits), uid);
  assert.deepEqual(visits, [
    ["collection", "artifacts"], ["doc", "reflect-8fdc8"],
    ["collection", "users"], ["doc", uid],
    ["collection", "aiSettings"], ["doc", "preferences"]
  ]);
  assert.equal(raw.schemaVersion, 1);
  let calls = 0;
  const adapter = createXaiProviderAdapter({
    readSecret: async () => key,
    transport: async (_url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.match(body.input[0].content, /Тон: strategic; глубина: deep/);
      assert.match(body.input[0].content, /Рекомендации разрешены: true/);
      assert.equal(body.input.length, 2); // No owner history, profile or diary.
      return response(payload({
        stage: "synthesize", clarifyingQuestion: "",
        recommendationCandidates: [{
          title: "Сравнить критерии", rationale: "Опираемся на текущий вопрос.",
          sourceRefs: ["current-message"]
        }]
      }));
    }
  });
  const output = await adapter.invoke(message, raw);
  assert.equal(calls, 1);
  assert.equal(output.interaction.recommendationCandidates.length, 1);
  assert.equal(output.interaction.goalCandidates.length, 0);
});

test("M1 no/invalid/unavailable owner preferences stay structured and fail closed", async () => {
  const uid = "synthetic-owner-123";
  const reads = [
    { exists: false },
    { exists: true, data: () => ({ ...settings, responseTone: "inject" }) }
  ];
  for (const snapshot of reads) {
    const raw = await readOwnerSettings(fakeOwnerSettingsDb(uid, snapshot, []), uid);
    assert.ok(raw && typeof raw === "object");
    const adapter = createXaiProviderAdapter({
      readSecret: () => key,
      transport: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.text.format.name, "reflect_interaction_v1");
        assert.match(body.input[0].content, /Тон: analytical; глубина: balanced/);
        assert.match(body.input[0].content, /Рекомендации разрешены: false/);
        return response(payload());
      }
    });
    const output = await adapter.invoke(message, raw);
    assert.equal(output.interaction.version, VERSION);
    assert.equal(output.interaction.recommendationCandidates.length, 0);
  }
  const unavailable = await readOwnerSettings({
    collection() { throw Error("transient-store-unavailable"); }
  }, uid);
  assert.deepEqual(unavailable, {});
});

// Keep consented context boundary covered by Stage04F's explicitly enumerated
// server-only test invocation, without enabling provider dispatch or routes.
require("./sessionMemory.test.cjs");

// P0: exercise server-side reply recovery transactional fixtures in Stage04F.
require("./aiTurnRecovery.test.cjs");
