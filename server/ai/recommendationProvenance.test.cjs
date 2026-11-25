"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { attest, verify } = require("./recommendationProvenance.cjs");
const key = Buffer.alloc(32, 7); // synthetic fixture only
const source = {
  projectId: "demo-reflect-r139", uid: "owner-a", sessionId: "session-a",
  sourceTurnId: "user-a", assistantTurnId: "assistant-a",
  sourceText: "Показать прототип", assistantText: "Проверить результат",
  interaction: { version: "reflect.interaction.v2", stage: "synthesize",
    clarifyingQuestion: "", unknowns: [], insights: ["Гипотеза"],
    recommendationCandidates: [{ title: "Проверить", rationale: "Есть критерий",
      sourceRefs: ["current-message"] }],
    evidenceSummary: { disputedSlots: [] } }
};

test("R139 C3c canonical attestation is deterministic across object key order", () => {
  const receipt = attest(source, key);
  const reordered = { ...source, interaction: Object.fromEntries(
    Object.entries(source.interaction).reverse()) };
  assert.deepEqual(attest(reordered, key), receipt);
  assert.equal(verify(reordered, receipt, key), true);
  assert.deepEqual(Object.keys(receipt).sort(), ["mac", "version"]);
  assert(!JSON.stringify(receipt).includes(source.sourceText));
});

test("R139 C3c every source coordinate and both texts are bound", () => {
  const receipt = attest(source, key);
  for (const name of ["projectId", "uid", "sessionId", "sourceTurnId",
    "assistantTurnId", "sourceText", "assistantText"]) {
    assert.equal(verify({ ...source, [name]: "changed" }, receipt, key), false, name);
  }
});

test("R139 C3c changes to gate-relevant structured content invalidate attestation", () => {
  const receipt = attest(source, key);
  for (const [name, value] of Object.entries({
    stage: "clarify", clarifyingQuestion: "Какой срок?", unknowns: ["Срок"],
    insights: [], recommendationCandidates: [], evidenceSummary: { disputedSlots: ["situation"] }
  })) {
    assert.equal(verify({ ...source, interaction: { ...source.interaction,
      [name]: value } }, receipt, key), false, name);
  }
});

test("R139 C3c absent, forged, malformed receipts and wrong keys fail closed", () => {
  const receipt = attest(source, key);
  for (const invalid of [null, {}, { ...receipt, version: "legacy" },
    { ...receipt, mac: "0".repeat(64) }, { ...receipt, mac: "z".repeat(64) }]) {
    assert.equal(verify(source, invalid, key), false);
  }
  assert.equal(verify(source, receipt, Buffer.alloc(32, 8)), false);
  assert.equal(verify(source, receipt, Buffer.alloc(16)), false);
});

test("R139 C3c rejects unbounded or noncanonical input", () => {
  for (const interaction of [
    { version: "unknown" }, { ...source.interaction, invalid: undefined },
    { ...source.interaction, invalid: NaN }, { ...source.interaction, invalid: new Date() },
    { ...source.interaction, invalid: Array(2) },
    { ...source.interaction, invalid: "x".repeat(8193) },
    { ...source.interaction, invalid: Array(64).fill("x".repeat(1024)) }
  ]) assert.throws(() => attest({ ...source, interaction }, key), /invalid-provenance/);
  assert.throws(() => attest({ ...source, uid: "../owner" }, key), /invalid-provenance/);
  assert.throws(() => attest(source, Buffer.alloc(16)), /invalid-provenance-key/);
});
