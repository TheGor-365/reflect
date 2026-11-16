"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const v1 = require("./interactionContract.cjs");
const v2 = require("./interactionEvidenceV2.cjs");
const { evidenceSnapshot } = require("./ownerEvidenceV2.cjs");

const message = "Хочу выпустить MVP за десять дней, но работаю над ним только вечером.";
const sourceTurnId = "user-request-synthetic-123456";
const ownerTurns = [{
  id: "user-previous-situation", role: "user", content: "Работаю над MVP.",
}, {
  id: "user-previous-goal", role: "user", content: "Цель — выпустить MVP за десять дней."
}];
const ownerSession = () => ({ chatHistory: ownerTurns.map(x => ({ ...x })),
  readinessEvidence: {} });
const settings = {
  schemaVersion: 1, responseDepth: "balanced", responseTone: "analytical",
  askClarifyingQuestions: true, recommendationsEnabled: false,
  recommendationFrequency: "rare", autoSaveRecommendations: false,
  interactionMode: "coach"
};
const attempt = (snapshot = evidenceSnapshot(ownerSession())) => ({
  message, sourceTurnId, evidence: snapshot
});
function payload(patch = {}) {
  return JSON.stringify({
    version: v2.VERSION,
    answer: "Для следующего шага важны реальные ограничения.",
    intent: "plan", stage: "clarify",
    clarifyingQuestion: "Какое ограничение сильнее всего мешает выпуску MVP?",
    insights: [], recommendationCandidates: [], goalCandidates: [],
    sourceRefs: ["current-message"], unknowns: ["Время для тестирования"],
    safetyFlags: ["uncertain"],
    evidenceClaims: [{
      quote: "Хочу выпустить MVP за десять дней",
      sourceRef: "current-message"
    }],
    clarificationSlot: "constraints",
    ...patch
  });
}
function parse(patch = {}, arg = attempt(), given = message, prefs = settings) {
  const req = v2.buildRequest(given, prefs);
  return v2.parseInteraction(payload(patch), req.settings, req.classification, arg);
}
const denied = fn => assert.throws(fn,{code:"invalid-provider-response"});

test("M5b v2 is independent, strict and carries NO unapproved previous history",()=>{
  const request = v2.buildRequest(message,settings);
  assert.equal(request.body.text.format.name,"reflect_interaction_v2");
  assert.equal(request.body.text.format.schema.properties.version.const,v2.VERSION);
  assert.equal(request.body.text.format.schema.additionalProperties,false);
  assert.equal(request.body.store,false);
  assert.deepEqual(request.body.input.map(x=>x.role),["system","user"]);
  assert.equal(request.body.input[1].content,message);
  assert.equal(request.body.text.format.schema.properties.goalCandidates.maxItems,0);
  assert.equal(JSON.stringify(request.body).includes("user-previous-goal"),false);
  assert.equal(JSON.stringify(request.body).includes("Цель — выпустить"),false);
  assert.equal(v1.buildRequest(message,settings).body.text.format.name,"reflect_interaction_v1");
});

test("M5b T2: literal current-owner citation resolves trusted source ID server-side",()=>{
  const result=parse();
  assert.equal(result.version,v2.VERSION);
  assert.equal(result.evidenceClaims.length,1);
  assert.deepEqual(result.evidenceClaims[0],{
    quote:"Хочу выпустить MVP за десять дней",
    sourceRef:"current-message",sourceTurnId,
    provenance:"owner-stated-not-independently-verified"
  });
  assert.deepEqual(result.evidenceSummary.missingSlots,[
    "situation","desiredResult","circumstances","constraints"
  ]);
  assert.equal(result.evidenceSummary.completeCount,0);
  assert.equal(result.clarificationSlot,"constraints");
  assert.equal(result.goalCandidates.length,0);
});

test("M5b T2 25/50/75/100: verified saved categories govern remaining question slots",()=>{
  const s=ownerSession();
  const slots=[
    ["situation",0],["desiredResult",1]
  ];
  for(const [key,i] of slots) {
    s.readinessEvidence[key] = {
      sourceTurnId:ownerTurns[i].id, quote:ownerTurns[i].content,
      confirmedByOwner:true,status:"confirmed"
    };
    const result=parse({},attempt(evidenceSnapshot(s)));
    assert.equal(result.evidenceSummary.completeCount,i+1);
    assert.equal(result.evidenceSummary.missingSlots.includes(key),false);
  }
  // Any model attempt to interrogate an already owner-confirmed goal is denied.
  denied(()=>parse({clarificationSlot:"desiredResult"},
    attempt(evidenceSnapshot(s))));
  // Complete 4/4 cannot be forged using a stale quote.
  s.readinessEvidence.circumstances={
    sourceTurnId:ownerTurns[0].id,quote:"fabricated",confirmedByOwner:true,status:"confirmed"
  };
  assert.equal(evidenceSnapshot(s).confirmedSlots.length,2);
});

test("M5b cannot invent fact claims, source IDs, legacy status, scores or goals",()=>{
  for(const extra of [
    { evidenceClaims:[{quote:"Цитата отсутствует в сообщении",sourceRef:"current-message"}]},
    { evidenceClaims:[{quote:"Хочу выпустить MVP за десять дней",sourceRef:"previous-session"}]},
    { evidenceClaims:[{quote:"Хочу выпустить MVP за десять дней",sourceRef:"current-message",
      sourceTurnId:"user-other"}]},
    { evidenceClaims:[{quote:"Хочу выпустить MVP за десять дней",sourceRef:"current-message"},
      {quote:"Хочу выпустить MVP за десять дней",sourceRef:"current-message"}]},
    { contextReadiness:100 },
    { missingSlots:[] },
    { goalCandidates:[{title:"Актуальная цель",sourceRefs:["current-message"]}] },
    { version:v1.VERSION }
  ]) denied(()=>parse(extra));
  denied(()=>v2.parseInteraction(payload(),settings,
    v1.preflight(message),{ ...attempt(),sourceTurnId:"../jack" }));
  denied(()=>v2.parseInteraction(payload(),settings,
    v1.preflight(message),{ message,sourceTurnId }));
});

test("M5b no repeated question or already confirmed clarification target",()=>{
  const s=ownerSession();
  s.chatHistory.push({id:"assistant-old",role:"assistant",
    interaction:{version:v1.VERSION,
      clarifyingQuestion:"Какое ограничение сильнее всего мешает выпуску MVP?"}});
  denied(()=>parse({},attempt(evidenceSnapshot(s))));
  denied(()=>parse({clarificationSlot:"none"}));
  denied(()=>parse({stage:"synthesize",clarifyingQuestion:"",
    clarificationSlot:"constraints"}));
});

test("M5b T4 listening without forced question, recommendation or goal",()=>{
  const vent="Просто хочу выговориться: сегодня тяжело. Не предлагай решений.";
  const req=v2.buildRequest(vent, {...settings,interactionMode:"support"});
  assert.equal(req.classification.intent,"vent");
  const result=v2.parseInteraction(payload({
    answer:"Понимаю, что день был тяжёлым.",
    intent:"vent",stage:"synthesize",clarifyingQuestion:"",
    evidenceClaims:[],clarificationSlot:"none",unknowns:[],
    recommendationCandidates:[]
  }),req.settings,req.classification,
  {message:vent,sourceTurnId,evidence:evidenceSnapshot(ownerSession())});
  assert.equal(result.clarifyingQuestion,"");
  assert.equal(result.recommendationCandidates.length,0);
  assert.equal(result.evidenceClaims.length,0);
  denied(()=>v2.parseInteraction(payload({
    intent:"vent",clarificationSlot:"constraints"
  }),req.settings,req.classification,
  {message:vent,sourceTurnId,evidence:evidenceSnapshot(ownerSession())}));
});

test("M5b v2 cannot parse v1 as v2; v1 continues serving the old provider protocol",()=>{
  const req=v1.buildRequest(message,settings);
  const legacy=JSON.stringify({
    version:v1.VERSION,answer:"Совет",
    intent:"plan",stage:"synthesize",clarifyingQuestion:"",
    insights:[],recommendationCandidates:[],goalCandidates:[],
    sourceRefs:["current-message"],unknowns:[],safetyFlags:[]
  });
  assert.equal(v1.parseInteraction(legacy,req.settings,req.classification).version,v1.VERSION);
  denied(()=>v2.parseInteraction(legacy,req.settings,req.classification,attempt()));
});


test("Railway R1: evidence v2 inherits exact ty/vy and sentence guidance without budget change", () => {
  for (const addressForm of ["ty", "vy"]) {
    const request = v2.buildRequest(message, { ...settings, addressForm });
    const system = request.body.input[0].content;
    assert.match(system, /ОБЯЗАТЕЛЬНО: обращайся к человеку во втором лице/);
    assert.match(system, /Не обрывай слово/);
    assert.match(system, /желательно не более 180 символов/);
    assert.match(system, addressForm === "ty"
      ? /Форма обращения — «ты»/ : /Форма обращения — «вы»/);
    assert.match(system, /Не утверждай, что помнишь предыдущие сообщения/);
    assert.equal(request.body.max_output_tokens, 1024);
    assert.equal(request.body.text.format.schema.properties.insights.items.maxLength, 240);
    assert.equal(request.body.text.format.schema.properties.answer.maxLength, 1150);
    assert.deepEqual(request.body.input.map(x => x.role), ["system", "user"]);
    assert.equal(request.body.store, false);
    assert.equal(request.body.text.format.name, "reflect_interaction_v2");
  }
});
