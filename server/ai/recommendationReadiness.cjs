"use strict";

/**
 * AI-01B / RECO-00 prototype. PURE and NOT runtime-wired.
 * Progress represents verified context COVERAGE, never the probability that
 * the proposed advice is correct, helpful, clinically safe or desired.
 *
 * Inputs MUST be constructed from authenticated, consent-scoped server-side
 * sources. Caller must NOT pass raw browser-provided "verified" signals.
 */
const DIMENSIONS = Object.freeze([
  "topic", "userOutcome", "relevantContext", "constraints"
]);
const REF = /^(sessionTurn|diaryEntry|approvedMemory|goal|bodyCheckin):[A-Za-z0-9_-]{1,128}$/;
const KEY = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_SIGNAL_COUNT = 24;
const CAPTURE_METHODS = new Set(["owner-confirmed", "server-source-extraction-v1"]);

const base = (status, score = 0, found = []) => Object.freeze({
  status, coveragePercent: score,
  coveredDimensions: Object.freeze([...found]),
  missingDimensions: Object.freeze(DIMENSIONS.filter(d => !found.includes(d))),
  canIncludeInNextReply: status === "ready",
  // A 100% value is *not* permission to invoke the provider again.
  extraPaidCallAllowed: false
});

/**
 * `enabled`, `consentGranted`, `providerBudgetReserved` and
 * `riskReviewed` must be asserted by trusted server logic.
 * A backend may include a candidate in the *same* approved AI response only
 * if `canIncludeInNextReply` is true and the model produces grounded output.
 */
function evaluateRecommendationReadiness({
  enabled = false, consentGranted = false, topicKey,
  selectedExcerpts = [], signals = [], nowMs,
  cooldownUntilMs = 0, providerBudgetReserved = false,
  riskReviewed = false
} = {}) {
  if (!enabled) return base("disabled");
  if (!consentGranted) return base("needs-consent");
  if (!riskReviewed) return base("needs-safety-review");
  if (typeof topicKey !== "string" || !KEY.test(topicKey) || !Number.isSafeInteger(nowMs) ||
      nowMs < 0 || !Array.isArray(selectedExcerpts) ||
      selectedExcerpts.length > 12 || !Array.isArray(signals) ||
      signals.length > MAX_SIGNAL_COUNT ||
      !Number.isSafeInteger(cooldownUntilMs) || cooldownUntilMs < 0) {
    return base("invalid-evidence");
  }

  const available = new Map();
  for (const item of selectedExcerpts) {
    if (!item || typeof item !== "object" || item.untrustedEvidence !== true ||
        typeof item.sourceKind !== "string" || typeof item.sourceId !== "string" ||
        !REF.test(item.sourceKind + ":" + item.sourceId) ||
        !["user", "user-confirmed"].includes(item.authoredBy) ||
        typeof item.excerpt !== "string" || !item.excerpt.trim()) continue;
    available.set(item.sourceKind + ":" + item.sourceId, item);
  }

  const covered = new Set();
  for (const evidence of signals) {
    if (!evidence || typeof evidence !== "object" ||
        !DIMENSIONS.includes(evidence.dimension) ||
        evidence.topicKey !== topicKey || evidence.verified !== true ||
        !CAPTURE_METHODS.has(evidence.verifier) ||
        typeof evidence.sourceRef !== "string" ||
        !available.has(evidence.sourceRef) ||
        !Number.isSafeInteger(evidence.capturedAt) ||
        evidence.capturedAt < 0 || evidence.capturedAt > nowMs) continue;
    covered.add(evidence.dimension);
  }
  const found = DIMENSIONS.filter(d => covered.has(d));
  const score = found.length * 25;
  if (score < 100) return base("needs-context", score, found);
  if (cooldownUntilMs > nowMs) return base("cooldown", score, found);
  if (!providerBudgetReserved) return base("awaiting-existing-request", score, found);
  return base("ready", score, found);
}

module.exports = { evaluateRecommendationReadiness, DIMENSIONS };
