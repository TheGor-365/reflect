"use strict";

/**
 * Cost-free provisional input planning. No calls, billing, writes or retries.
 * These are CONSERVATIVE byte-based estimates, not a tokenizer or a promise
 * of actual xAI usage. Existing Firestore quota reservation remains mandatory.
 */
const { LIMITS } = require("./policy.cjs");
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const canUse = r => r && typeof r === "object" &&
  typeof r.sourceId === "string" && ID.test(r.sourceId) &&
  typeof r.sourceKind === "string" && /^[A-Za-z]+$/.test(r.sourceKind) &&
  r.untrustedEvidence === true && typeof r.excerpt === "string";
const estimateTokens = text => Math.ceil(Buffer.byteLength(text, "utf8") / 2);
const empty = reason => Object.freeze({
  allowed: false, reason, selectedExcerpts: Object.freeze([]),
  estimatedInputTokens: 0
});

/** Do NOT call if source permissions were not verified by contextSelector. */
function planTokenBudget({
  currentMessage, excerpts = [],
  maxInputTokens = LIMITS.maxInputTokens,
  instructionReserveTokens = 220
} = {}) {
  if (typeof currentMessage !== "string" || !currentMessage.trim() ||
      !Array.isArray(excerpts) || excerpts.length > 12 ||
      !Number.isSafeInteger(maxInputTokens) || maxInputTokens < 1 ||
      maxInputTokens > LIMITS.maxInputTokens ||
      !Number.isSafeInteger(instructionReserveTokens) ||
      instructionReserveTokens < 180 ||
      instructionReserveTokens > maxInputTokens ||
      !excerpts.every(canUse)) return empty("invalid-input");

  const messageEstimate = estimateTokens(currentMessage.trim()) + 32;
  let estimated = instructionReserveTokens + messageEstimate;
  if (estimated > maxInputTokens) return empty("message-exceeds-budget");
  const selected = [];
  const seen = new Set();
  for (const entry of excerpts) {
    const key = entry.sourceKind + ":" + entry.sourceId;
    if (seen.has(key)) continue;
    seen.add(key);
    const cost = estimateTokens(entry.excerpt) + 32;
    if (estimated + cost > maxInputTokens) continue;
    selected.push(entry);
    estimated += cost;
  }
  return Object.freeze({
    allowed: true, reason: "planned-only",
    selectedExcerpts: Object.freeze(selected),
    estimatedInputTokens: estimated,
    maxOutputTokens: LIMITS.maxOutputTokens
  });
}
module.exports = { planTokenBudget };
