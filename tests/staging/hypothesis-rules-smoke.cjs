#!/usr/bin/env node
"use strict";
/**
 * Non-billable, synthetic Auth+Firestore emulator check.
 * Only exact loopback endpoints + demo project IDs are allowed. Does not read
 * owner data or mutate deployed Firebase Rules, Hosting, Railway or xAI.
 *
 * Runs twice in CI: existing candidate Rules and existing hosted Rules.
 */
const assert = require("node:assert/strict");

const MODES = Object.freeze({
  candidate: {
    project: "demo-reflect-hypothesis-candidate",
    auth: "127.0.0.1:19199",
    firestore: "127.0.0.1:19181"
  },
  hosted: {
    project: "demo-reflect-hypothesis-hosted",
    auth: "127.0.0.1:19299",
    firestore: "127.0.0.1:19281"
  }
});
const mode = process.env.REFLECT_HYPOTHESIS_RULES_MODE;
const expected = MODES[mode];
if (!expected ||
    process.env.GCLOUD_PROJECT !== expected.project ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== expected.auth ||
    process.env.FIRESTORE_EMULATOR_HOST !== expected.firestore ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("STOP: isolated demo emulator identity/host mismatch");
}
const authUrl = "http://" + expected.auth +
  "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-only";
const root = "http://" + expected.firestore + "/v1/projects/" +
  expected.project + "/databases/(default)/documents/";
const txt = value => ({stringValue:value});
const map = fields => ({mapValue:{fields}});
const list = values => ({arrayValue:{values}});
const integer = number => ({integerValue:String(number)});
const timestamp = {timestampValue:"2026-11-14T00:00:00Z"};
const replyFields = {
  version:txt("reflect.interaction.v1"),
  insights:list([
    txt("Возможно, вы избегаете критики."),
    txt("Возможно, вам трудно определить минимальные критерии.")
  ]),
  recommendationCandidates:list([])
};
const history = list([
  map({role:txt("user"),id:txt("user-fixture"),content:txt("Я откладываю запуск.")}),
  map({role:txt("assistant"),id:txt("assistant-fixture"),
    content:txt("У меня есть две версии, давайте их проверим."),
    interaction:map(replyFields)})
]);
async function signUp() {
  const result = await fetch(authUrl, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({returnSecureToken:true}),
    signal:AbortSignal.timeout(20000)
  });
  assert.equal(result.status,200,"synthetic Auth sign-up");
  const body = await result.json();
  assert.ok(body.localId && body.idToken,"synthetic identity issued");
  return {uid:body.localId,token:body.idToken};
}
async function operation(path,{method="GET",token,fields,mask=[]}={}) {
  const url = new URL(root + path);
  for (const field of mask) url.searchParams.append("updateMask.fieldPaths",field);
  const headers = {};
  if (token) headers.authorization="Bearer "+token;
  if (fields) headers["content-type"]="application/json";
  const r = await fetch(url, {
    method,headers,body:fields?JSON.stringify({fields}):undefined,
    signal:AbortSignal.timeout(20000)
  });
  return {status:r.status,body:r.ok ? await r.json() : null};
}
function check(label,result,want) {
  assert.equal(result.status,want,label+" HTTP "+result.status);
  console.log("PASS: "+label);
}
const review = (index,grade,comment)=>map({
  assistantMessageId:txt("assistant-fixture"),
  hypothesisIndex:integer(index),
  grade:integer(grade),
  comment:txt(comment),
  reviewedAt:timestamp
});
function persistedReviewFields(reviews) {
  return {hypothesisReviews:map(reviews)};
}
function assertPreserved(data,expectedLength=2) {
  const fields=data.fields||{};
  assert.equal(fields.chatHistory.arrayValue.values.length,expectedLength,
    "old turns retained");
  const turns=fields.chatHistory.arrayValue.values;
  assert.equal(turns[0].mapValue.fields.content.stringValue,"Я откладываю запуск.");
  assert.equal(turns[1].mapValue.fields.interaction.mapValue.fields
    .insights.arrayValue.values.length,2,"AI hypotheses retained");
}
async function main(){
  const alice=await signUp(),bob=await signUp();
  assert.notEqual(alice.uid,bob.uid);
  const path="artifacts/reflect-8fdc8/users/"+alice.uid+"/sessions/fixture-hypotheses";
  check("owner creates synthetic two-turn session",await operation(path,{
    method:"PATCH",token:alice.token,
    fields:{title:txt("Рассуждение"),chatHistory:history,
      recommendations:list([]),exercises:list([]),createdAt:timestamp}
  }),200);
  let first=await operation(path,{
    method:"PATCH",token:alice.token,
    fields:persistedReviewFields({
      "h-assistant-fixture-0":review(0,0,"Нет, я не боюсь оценки.")
    }),
    mask:["hypothesisReviews"]
  });
  check("owner can grade a rejected hypothesis and comment",first,200);
  assertPreserved(first.body);
  assert.equal(first.body.fields.hypothesisReviews.mapValue.fields
    ["h-assistant-fixture-0"].mapValue.fields.grade.integerValue,"0");

  const reviews={
    "h-assistant-fixture-0":review(0,0,"Нет, я не боюсь оценки."),
    "h-assistant-fixture-1":review(1,4,"Это ближе к правде.")
  };
  const update=await operation(path,{
    method:"PATCH",token:alice.token,
    fields:persistedReviewFields(reviews),mask:["hypothesisReviews"]
  });
  check("owner adds a second review without deleting the first",update,200);
  assertPreserved(update.body);
  assert.equal(Object.keys(update.body.fields.hypothesisReviews.mapValue.fields).length,
    2,"both owner reviews exist");
  const readBack=await operation(path,{token:alice.token});
  check("owner reads back grades and intact chat history",readBack,200);
  assertPreserved(readBack.body);
  assert.equal(readBack.body.fields.hypothesisReviews.mapValue.fields
    ["h-assistant-fixture-1"].mapValue.fields.grade.integerValue,"4");

  check("other UID cannot read grades or history",
    await operation(path,{token:bob.token}),403);
  check("anonymous cannot read grades or history",
    await operation(path),403);
  check("other UID cannot overwrite feedback",
    await operation(path,{method:"PATCH",token:bob.token,
      fields:persistedReviewFields({"h-assistant-fixture-0":review(0,4,"forge")}),
      mask:["hypothesisReviews"]}),403);
  check("other UID cannot erase the saved session",
    await operation(path,{method:"DELETE",token:bob.token}),403);
  check("unknown app namespace cannot write a session",
    await operation("artifacts/other-app/users/"+alice.uid+"/sessions/forbidden",{
      method:"PATCH",token:alice.token,
      fields:{title:txt("Forbidden")}}),403);
  check("browser cannot access private server receipts",
    await operation("_reflectAiPrivate/hypothesis-fixture",{
      method:"PATCH",token:alice.token,
      fields:{attempt:txt("forbidden")}}),403);
  console.log("PASS: "+mode+" source-compatible feedback, owner isolation, unchanged Rules");
}
main().catch(error=>{
  console.error("Synthetic hypothesis Rules test FAILED:",error.message);
  process.exitCode=1;
});
