"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateRecommendationReadiness, DIMENSIONS } = require("./recommendationReadiness.cjs");

const nowMs = Date.parse("2026-11-10T19:00:00Z");
const topicKey = "topic_synthetic_1";
const excerpts = DIMENSIONS.map((dimension, i) => ({
  sourceKind: "sessionTurn", sourceId: "turn" + (i + 1),
  excerpt: "Owner-authored synthetic context for " + dimension,
  authoredBy: "user", untrustedEvidence: true
}));
const signals = DIMENSIONS.map((dimension, i) => ({
  dimension, topicKey, verified: true, verifier: "server-source-extraction-v1",
  sourceRef: "sessionTurn:turn" + (i + 1), capturedAt: nowMs - 1000
}));
const inputs = {
  enabled: true, consentGranted: true, riskReviewed: true,
  providerBudgetReserved: true, nowMs, topicKey, excerpts: undefined,
  selectedExcerpts: excerpts, signals
};

test("disabled by default and no source consent: zero context sent or simulated", () => {
  const result = evaluateRecommendationReadiness({ ...inputs, enabled: false });
  assert.equal(result.status, "disabled");
  assert.equal(result.coveragePercent, 0);
  assert.equal(result.canIncludeInNextReply, false);
  assert.equal(result.extraPaidCallAllowed, false);
  assert.equal(evaluateRecommendationReadiness({
    ...inputs, consentGranted: false
  }).status, "needs-consent");
});

test("each verified dimension adds 25 points; 100 means readiness only", () => {
  for (let length = 0; length <= 4; length++) {
    const r = evaluateRecommendationReadiness({
      ...inputs, signals: signals.slice(0, length)
    });
    assert.equal(r.coveragePercent, length * 25);
    assert.equal(r.missingDimensions.length, 4 - length);
    assert.equal(r.canIncludeInNextReply, length === 4);
    assert.equal(r.extraPaidCallAllowed, false);
  }
  assert.deepEqual(evaluateRecommendationReadiness(inputs).coveredDimensions,
    DIMENSIONS);
});

test("AI-only claims, unverified evidence and missing sources never complete readiness", () => {
  const result = evaluateRecommendationReadiness({
    ...inputs,
    selectedExcerpts: [
      ...excerpts.slice(0, 3),
      { ...excerpts[3], authoredBy: "assistant" }
    ]
  });
  assert.equal(result.coveragePercent, 75);
  assert.equal(result.canIncludeInNextReply, false);

  const missing = evaluateRecommendationReadiness({
    ...inputs,
    signals: [signals[0], { ...signals[1], verified: false },
      { ...signals[2], sourceRef: "sessionTurn:foreign" },
      { ...signals[3], topicKey: "other_topic" }]
  });
  assert.equal(missing.coveragePercent, 25);
});

test("no 100 percent from fabricated extraction, invalid time or unknown topic", () => {
  const invalid = [
    { ...signals[0], verifier: "model-said-so" },
    { ...signals[0], capturedAt: nowMs + 10000 },
    { ...signals[0], topicKey: "other_topic" },
    { ...signals[0], sourceRef: "diaryEntry:secret" }
  ];
  for (const item of invalid) {
    const r = evaluateRecommendationReadiness({
      ...inputs, signals: [item, ...signals.slice(1)]
    });
    assert.equal(r.coveragePercent, 75);
  }
  assert.equal(evaluateRecommendationReadiness({
    ...inputs, topicKey: "../invalid"
  }).status, "invalid-evidence");
  assert.equal(evaluateRecommendationReadiness({
    ...inputs, signals: Array(25).fill(signals[0])
  }).canIncludeInNextReply, false);
});

test("100 percent coverage cannot override safety review, cooldown or cost gate", () => {
  assert.deepEqual([
    evaluateRecommendationReadiness({ ...inputs, riskReviewed: false }).status,
    evaluateRecommendationReadiness({
      ...inputs, cooldownUntilMs: nowMs + 1000
    }).status,
    evaluateRecommendationReadiness({
      ...inputs, providerBudgetReserved: false
    }).status
  ], ["needs-safety-review", "cooldown", "awaiting-existing-request"]);
  for (const variation of [
    { riskReviewed: false },
    { cooldownUntilMs: nowMs + 1000 },
    { providerBudgetReserved: false }
  ]) {
    const r = evaluateRecommendationReadiness({ ...inputs, ...variation });
    assert.equal(r.canIncludeInNextReply, false);
    assert.equal(r.extraPaidCallAllowed, false);
  }
});

test("all returned metadata is small, immutable and never contains diary text", () => {
  const r = evaluateRecommendationReadiness(inputs);
  assert.equal(Object.isFrozen(r), true);
  assert.equal(Object.isFrozen(r.coveredDimensions), true);
  assert.equal(JSON.stringify(r).includes("Owner-authored synthetic"), false);
  assert.deepEqual(Object.keys(r).sort(), [
    "canIncludeInNextReply", "coveragePercent", "coveredDimensions",
    "extraPaidCallAllowed", "missingDimensions", "status"
  ]);
});
