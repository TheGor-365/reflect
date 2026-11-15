"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { SLOTS, validSource, evidenceSnapshot, isEvidenceSnapshot } =
  require("./ownerEvidenceV2.cjs");

const user = [
  {id:"user-m5-situation",role:"user",content:"Я работаю над MVP две недели."},
  {id:"user-m5-goal",role:"user",content:"Моя цель — закончить MVP за 10 дней."},
  {id:"user-m5-context",role:"user",content:"У меня свободно два часа вечером."},
  {id:"user-m5-constraint",role:"user",content:"Нельзя пропускать проверку авторизации."}
];
function record(i, status = "confirmed") {
  return { sourceTurnId:user[i].id, quote:user[i].content,
    confirmedByOwner:true, status };
}
function session() { return { chatHistory:user.map(t=>({...t})),
  readinessEvidence:{} }; }

test("M5b: four fixed categories start as missing without extrapolating facts",()=>{
  const s=evidenceSnapshot(session());
  assert.deepEqual(s.confirmedSlots,[]);
  assert.deepEqual(s.disputedSlots,[]);
  assert.deepEqual(s.missingSlots,SLOTS);
  assert.equal(isEvidenceSnapshot(s),true);
  assert(Object.isFrozen(s.confirmedSlots));
});

test("M5b: exact owner sources earn 25/50/75/100, no model-generated sources",()=>{
  const s=session();
  const slots=["situation","desiredResult","circumstances","constraints"];
  slots.forEach((key,i)=>{
    s.readinessEvidence[key]=record(i);
    const snap=evidenceSnapshot(s);
    assert.equal(snap.confirmedSlots.length,i+1);
    assert.equal(snap.missingSlots.length,3-i);
  });
  assert.equal(evidenceSnapshot(s).confirmedSlots.length,4);
  assert.equal(evidenceSnapshot(s).missingSlots.length,0);
});

test("M5b: dispute, wrong quote, edited source and AI reply are unconfirmed",()=>{
  const s=session();
  s.readinessEvidence.situation=record(0);
  s.readinessEvidence.desiredResult=record(1,"disputed");
  s.readinessEvidence.circumstances={...record(2),quote:"Я сказал другое."};
  s.chatHistory.push({id:"assistant-m5",role:"assistant",
    content:"Я решил за пользователя, что всё подтверждено."});
  s.readinessEvidence.constraints={
    sourceTurnId:"assistant-m5",
    quote:"Я решил за пользователя, что всё подтверждено.",
    confirmedByOwner:true,status:"confirmed"
  };
  const snap=evidenceSnapshot(s);
  assert.deepEqual(snap.confirmedSlots,["situation"]);
  assert.deepEqual(snap.disputedSlots,["desiredResult"]);
  assert.deepEqual(snap.missingSlots,["circumstances","constraints"]);
  s.chatHistory[0].content="Текст был изменён.";
  assert.deepEqual(evidenceSnapshot(s).confirmedSlots,[]);
});

test("M5b: duplicated IDs, arbitrary UID paths and duplicate question are never facts",()=>{
  const s=session();
  s.chatHistory.push({...user[0]});
  assert.equal(validSource(s,user[0].id,user[0].content),false);
  s.chatHistory.push({id:"assistant-repeated",role:"assistant",
    interaction:{version:"reflect.interaction.v1",
      clarifyingQuestion:"Какие ограничения действительно важны?"}});
  const snap=evidenceSnapshot(s);
  assert.deepEqual(snap.previousQuestions,[
    "какие ограничения действительно важны?"
  ]);
  assert.equal(validSource(s,"../jack",user[1].content),false);
  assert.equal(isEvidenceSnapshot({
    ...snap, confirmedSlots:["situation","situation"]
  }),false);
});
