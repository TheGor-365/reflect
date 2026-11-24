"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvenanceKeyring } = require("./recommendationProvenanceKeyring.cjs");
const { validateGoalAcceptanceSource: validate } = require("./goalAcceptanceSource.cjs");

function fixture() {
  const projectId = "reflect-ai-staging", uid = "owner-a", sessionId = "session-a";
  const requestId = "request-fixture-0001";
  const sourceTurnId = "user-" + requestId, assistantTurnId = "assistant-" + requestId;
  const keyring = createProvenanceKeyring({ activeKeyId: "fixture",
    keys: [{ keyId: "fixture", key: Buffer.alloc(32, 17) }] });
  const source = { id: sourceTurnId, role: "user", content: "Synthetic source" };
  const answer = { id: assistantTurnId, role: "assistant", sourceTurnId,
    content: "Synthetic answer", interaction: {
      version: "reflect.interaction.v1", stage: "synthesize", clarifyingQuestion: "",
      unknowns: [], insights: ["Synthetic hypothesis"],
      recommendationCandidates: [{ title: "First step", rationale: "Synthetic rationale",
        sourceRefs: ["current-message"] }]
    } };
  const session = { ownerUid: uid, chatHistory: [source, answer],
    hypothesisReviews: { ["h-" + assistantTurnId + "-0"]: {
      assistantMessageId: assistantTurnId, hypothesisIndex: 0, grade: 3
    } } };
  const receipt = { uid, sessionId, sourceTurnId, assistantTurnId, requestId,
    status: "persisted_reply" };
  const resign = () => { receipt.provenance = keyring.sign({ projectId, uid, sessionId,
    sourceTurnId, assistantTurnId, sourceText: source.content,
    assistantText: answer.content, interaction: answer.interaction }); };
  resign();
  return { args: { projectId, uid, sessionId, sourceTurnId, assistantTurnId,
    candidateIndex: 0, session, receipt, guard: null, keyring }, source, answer,
    session, receipt, resign };
}

test("attested source passes with explicit matching hypothesis review", () => {
  const { args, session } = fixture();
  session.chatHistory.splice(1, 0, { role: "user", id: "later-user", content: "Unrelated later turn" });
  const result = validate(args);
  assert.equal(result.allowed, true);
  assert.equal(result.sourceTurnId, args.sourceTurnId);
  assert.equal(result.recommendationKey, "r-" + args.assistantTurnId + "-0");
});

test("owner-mutated source or interaction cannot inherit attestation", () => {
  for (const mutate of [
    f => { f.source.content = "Changed"; },
    f => { f.answer.content = "Changed"; },
    f => { f.answer.interaction.insights = []; },
    f => { delete f.receipt.provenance; }
  ]) {
    const f = fixture(); mutate(f);
    assert.equal(validate(f.args).code, "unverified");
  }
});

test("even signed clarification, unknowns and malformed stage remain blocked", () => {
  for (const patch of [
    { stage: "clarify", clarifyingQuestion: "Why?" },
    { stage: "unexpected" }, { clarifyingQuestion: null }, { clarifyingQuestion: "Why?" }
  ]) {
    const f = fixture(); Object.assign(f.answer.interaction, patch); f.resign();
    assert.equal(validate(f.args).code, "question");
  }
  const f = fixture(); f.answer.interaction.unknowns = ["missing fact"]; f.resign();
  assert.equal(validate(f.args).code, "unknown");
});

test("missing, null, foreign and disputed owner reviews are denied", () => {
  for (const [record, expected] of [
    [undefined, "unreviewed"], [null, "invalid-review"],
    [{ assistantMessageId: "other", hypothesisIndex: 0, grade: 4 }, "invalid-review"]
  ]) {
    const f = fixture();
    f.session.hypothesisReviews["h-" + f.args.assistantTurnId + "-0"] = record;
    assert.equal(validate(f.args).code, expected);
  }
  const f = fixture();
  f.session.hypothesisReviews["h-" + f.args.assistantTurnId + "-0"].grade = 1;
  assert.equal(validate(f.args).code, "disputed");
});

test("v2 disputed or missing evidence summary blocks conversion", () => {
  const f = fixture(); f.answer.interaction.version = "reflect.interaction.v2"; f.resign();
  assert.equal(validate(f.args).code, "disputed");
  f.answer.interaction.evidenceSummary = { disputedSlots: ["situation"] }; f.resign();
  assert.equal(validate(f.args).code, "disputed");
});

test("revoked, archived, wrong owner, receipt mismatch and duplicate source fail closed", () => {
  for (const mutate of [
    f => { f.args.guard = { provenanceRevoked: true }; },
    f => { f.args.guard = undefined; },
    f => { f.session.archivedAt = 1; },
    f => { f.args.uid = "other-owner"; },
    f => { f.receipt.assistantTurnId = "other"; },
    f => { f.session.chatHistory.push({ ...f.source }); },
    f => { f.answer.sourceTurnId = "other"; }
  ]) {
    const f = fixture(); mutate(f);
    assert.equal(validate(f.args).allowed, false);
  }
});

test("candidate must be unique and refer only to current message", () => {
  for (const refs of [[], ["external"], ["current-message", "external"]]) {
    const f = fixture(); f.answer.interaction.recommendationCandidates[0].sourceRefs = refs; f.resign();
    assert.equal(validate(f.args).code, "invalid-candidate");
  }
  const f = fixture(); f.args.candidateIndex = 1;
  assert.equal(validate(f.args).allowed, false);
});
