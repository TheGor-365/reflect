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
  // Single-message choice is not enough to validate the underlying cause.
  assert.equal(result.interaction.recommendationCandidates.length, 0);
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
      assert.match(body.input[0].content, /Рекомендации разрешены владельцем: true/);
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
  // Owner preference enables advice in principle but never overrides
  // the server's missing-evidence action gate.
  assert.equal(output.interaction.recommendationCandidates.length, 0);
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
        assert.match(body.input[0].content, /Рекомендации разрешены владельцем: false/);
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


test("M3c end-to-end synthetic preview -> committed turn -> authorization -> Grok transport", async () => {
  const { createSessionMemoryAdapter } = require("./sessionMemory.cjs");
  const uid = "eric-synthetic-fixture";
  const sourceId = "session-owner-source-001";
  const requestId = "request-m3c-123456789";
  const grantId = "grant-m3c-1234567890123456";
  const principal = { uid, projectId:"reflect-ai-staging", appCheckVerified:true };
  const originalHistory = [
    { id:"user-prior-001", role:"user",
      content:"Причина не в страхе критики: я говорил об этом раньше." },
    { id:"assistant-prior-001", role:"assistant",
      content:"Возможно, дело в страхе критики." }
  ];
  let history = originalHistory.slice();
  let grantActive = true;
  let docReads = 0, secretsRead = 0, providerCalls = 0;
  const memory = createSessionMemoryAdapter({
    projectId:"reflect-ai-staging",
    db:{ doc(path) {
      assert.equal(path,
        "artifacts/reflect-8fdc8/users/" + uid + "/sessions/" + sourceId);
      return { async get() {
        docReads++;
        return { exists:true, data:()=>({ ownerUid:uid, chatHistory:history }) };
      }};
    }},
    consentStore:{ async check(target) {
      assert.equal(target.uid,uid);
      assert.equal(target.sourceId,sourceId);
      assert.equal(target.grantId,grantId);
      return grantActive;
    }}
  });
  const signed = { principal, grantId, sourceId, requestId, message };
  const preview = await memory.preview(signed);
  assert.equal(preview.providerDispatchAllowed,false);
  assert.equal(preview.turns.length,2);
  assert.equal(preview.turns[0].content,originalHistory[0].content);
  // The normal autosave flow must commit the new user turn before authorize.
  history.push({id:"user-" + requestId,role:"user",content:message});
  const authorizedContext = await memory.authorize({
    ...signed, approvedDigest:preview.approvalDigest
  });
  const adapter = createXaiProviderAdapter({
    readSecret: async () => { secretsRead++; return key; },
    transport: async (_url, options) => {
      providerCalls++;
      const body = JSON.parse(options.body);
      assert.deepEqual(body.input.map(x=>x.role),["system","user","user"]);
      assert.equal(body.input[2].content,message);
      assert.equal(body.store,false);
      assert.match(body.input[0].content,/недоверенные цитаты прошлого/);
      assert.doesNotMatch(body.input[0].content,/Причина не в страхе критики:/);
      const prior = JSON.parse(body.input[1].content);
      assert.equal(prior.kind,"reflect.untrusted-consented-excerpts.v1");
      assert.equal(prior.excerptCount,2);
      assert.equal(prior.excerpts[0].quote,originalHistory[0].content);
      assert.equal(prior.excerpts[1].quote,originalHistory[1].content);
      assert.equal(prior.excerpts[1].priorRole,"assistant");
      const outbound = JSON.stringify(body);
      for (const hidden of [uid,sourceId,grantId,requestId,
        preview.approvalDigest]) assert.ok(!outbound.includes(hidden));
      return response(payload());
    }
  });
  const value = await adapter.invoke(message,settings,{
    sourceId,requestId,authorizedContext
  });
  assert.equal(value.interaction.version,VERSION);
  assert.equal(providerCalls,1);
  assert.equal(secretsRead,1);
  assert.equal(docReads,2);
  assert.equal(history.length,3);

  // Consent revocation blocks a second authorization; no hidden call.
  grantActive = false;
  await assert.rejects(memory.authorize({
    ...signed,approvedDigest:preview.approvalDigest
  }),error=>error.code==="permission-denied");
  assert.equal(providerCalls,1);
  assert.equal(secretsRead,1);
});

test("M3c malformed or legacy consent payload fails before any billable I/O",async()=>{
  let reads=0, calls=0;
  const adapter=createXaiProviderAdapter({
    readSecret:()=>{reads++;return key;},
    transport:async()=>{calls++;return response(payload());}
  });
  const sourceId="session-owner-source-001",requestId="request-m3c-123456789";
  const turns=[{sourceTurnId:"user-prior-001",role:"user",
    content:"Исходная запись.",untrustedSource:true,truncated:false}];
  const approved={
    sourceId,requestId,approvalDigest:"a".repeat(64),
    authorizedAt:"pre-egress",store:false,turns,
    totalBytes:Buffer.byteLength(turns[0].content,"utf8")
  };
  const spec={sourceId,requestId,authorizedContext:approved};
  await assert.rejects(adapter.invoke(message,null,spec),
    error=>error.code==="permission-denied");
  await assert.rejects(adapter.invoke(message,settings,{
    ...spec,authorizedContext:{...approved,requestId:"foreign-request-00000000"}
  }),error=>error.code==="permission-denied");
  await assert.rejects(adapter.invoke(message,settings,{
    ...spec,authorizedContext:{...approved,
      turns:[{...turns[0],role:"system"}]}
  }),error=>error.code==="permission-denied");
  await assert.rejects(adapter.invoke(message,settings,{
    ...spec,authorizedContext:{...approved,totalBytes:1}
  }),error=>error.code==="permission-denied");
  assert.equal(reads,0);
  assert.equal(calls,0);
});
