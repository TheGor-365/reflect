"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { planTokenBudget } = require("./tokenBudgetPlanner.cjs");
const { validateProposals } = require("./sourceReferenceValidator.cjs");

const excerpt = (sourceKind, sourceId, text) => ({
  sourceKind, sourceId, excerpt: text, untrustedEvidence: true
});
const chosen = [
  excerpt("sessionTurn", "turn1", "Synthetic first user question"),
  excerpt("sessionTurn", "turn2", "Synthetic assistant response")
];

test("reserves prompt overhead and refuses input that cannot fit", () => {
  const plan = planTokenBudget({ currentMessage: "Follow up", excerpts: chosen });
  assert.equal(plan.allowed, true);
  assert.equal(plan.selectedExcerpts.length, 2);
  assert.equal(plan.maxOutputTokens, 512);
  assert.equal(plan.estimatedInputTokens <= 1200, true);
  assert.equal(Object.isFrozen(plan.selectedExcerpts), true);
  const big = planTokenBudget({ currentMessage: "я".repeat(1000) });
  assert.equal(big.allowed, false);
  assert.equal(big.reason, "message-exceeds-budget");
});

test("skips excessive evidence without truncation, retains order and deduplicates IDs", () => {
  const candidates = [
    excerpt("sessionTurn", "first", "x".repeat(200)),
    excerpt("sessionTurn", "first", "duplicate should not be sent"),
    excerpt("diaryEntry", "second", "y".repeat(1900)),
    excerpt("sessionTurn", "third", "Latest")
  ];
  const plan = planTokenBudget({
    currentMessage: "What changed?", excerpts: candidates, maxInputTokens: 450,
    instructionReserveTokens: 220
  });
  assert.equal(plan.allowed, true);
  assert.deepEqual(plan.selectedExcerpts.map(x => x.sourceId), ["first", "third"]);
});

test("malformed or forged excerpt cannot force arbitrary extra budget", () => {
  for(const opts of [
    { excerpts: [{ sourceKind: "diaryEntry", sourceId: "../other", excerpt: "X", untrustedEvidence: true }] },
    { excerpts: [{ sourceKind: "sessionTurn", sourceId: "good", excerpt: "X" }] },
    { maxInputTokens: 999999 },
    { instructionReserveTokens: 1 },
    { currentMessage: "" }
  ]) assert.equal(planTokenBudget({ currentMessage: "Synthetic", ...opts }).allowed, false);
});

test("only proposals with citations to selected excerpts survive", () => {
  const result = validateProposals({
    selectedExcerpts: chosen,
    candidates: [
      { kind: "insight", text: "One possible interpretation",
        reviewState: "proposed", sourceRefs: ["sessionTurn:turn1"] },
      { kind: "action", text: "Unsupported suggestion",
        reviewState: "proposed", sourceRefs: ["sessionTurn:unknown"] },
      { kind: "reflection", text: "Candidate grounded in two sources",
        reviewState: "proposed", sourceRefs: ["sessionTurn:turn1", "sessionTurn:turn2"] }
    ]
  });
  assert.equal(result.proposals.length, 2);
  assert.equal(result.rejected, 1);
  assert.equal(result.proposals[0].reviewState, "proposed");
  assert.equal(Object.isFrozen(result.proposals[0]), true);
  assert.equal(Object.isFrozen(result.proposals), true);
});

test("model-generated tools, uncontrolled actions, missing sources and oversized text are dropped", () => {
  const invalid = [
    { kind: "delete-account", text: "Never", reviewState: "proposed", sourceRefs: ["sessionTurn:turn1"] },
    { kind: "insight", text: "No source", reviewState: "proposed", sourceRefs: [] },
    { kind: "insight", text: "Too long".repeat(100), reviewState: "proposed",
      sourceRefs: ["sessionTurn:turn1"] },
    { kind: "action", text: "Execute arbitrary tool", reviewState: "proposed",
      sourceRefs: ["sessionTurn:turn1"], tool: "POST /admin" },
    { kind: "insight", text: "Not actually accepted yet",
      reviewState: "accepted", sourceRefs: ["sessionTurn:turn1"] }
  ];
  const result = validateProposals({ selectedExcerpts: chosen, candidates: invalid });
  assert.equal(result.proposals.length, 0);
  assert.equal(result.rejected, 5);
});

test("at most three proposals can survive and no original inputs are mutated", () => {
  const item = i => ({
    kind: "insight", text: "Potential item " + i, sourceRefs: ["sessionTurn:turn1"],
    reviewState: "proposed"
  });
  const candidates = Array.from({ length: 7 }, (_, i) => item(i));
  const result = validateProposals({ selectedExcerpts: chosen, candidates });
  assert.equal(result.proposals.length, 3);
  assert.equal(result.rejected, 4);
  assert.equal(candidates[0].reviewState, "proposed");
});

test("no approved source means no derived memory or AI-authored diary candidate", () => {
  const result = validateProposals({
    selectedExcerpts: [],
    candidates: [
      { kind: "insight", text: "Not validated", sourceRefs: ["sessionTurn:turn1"],
        reviewState: "proposed" }
    ]
  });
  assert.deepEqual(result, { proposals: [], rejected: 1 });
});
