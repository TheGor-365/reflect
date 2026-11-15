"use strict";
/**
 * One signed, owner-scoped session only. These are LIMITS, never blanket
 * authorizations for diary, profile, other sessions or silent model access.
 * Legacy clients omit contextLevel and retain the original 4/1200 boundary,
 * so a rolling staging release cannot invalidate an existing approval.
 */
const { PolicyError } = require("./policy.cjs");
const WINDOWS = Object.freeze({
  optimal: Object.freeze({ maxTurns: 2, maxBytes: 400 }),
  detailed: Object.freeze({ maxTurns: 4, maxBytes: 800 }),
  deep: Object.freeze({ maxTurns: 6, maxBytes: 1100 })
});
const MAX_CONTEXT_TURNS = 6;
const MAX_CONTEXT_BYTES = 1200;
function contextWindow(contextLevel) {
  if (contextLevel === undefined) {
    return Object.freeze({ contextLevel: null, maxTurns: 4, maxBytes: 1200 });
  }
  if (typeof contextLevel !== "string" ||
      !Object.hasOwn(WINDOWS, contextLevel)) {
    throw new PolicyError("invalid-argument");
  }
  return Object.freeze({ contextLevel, ...WINDOWS[contextLevel] });
}
module.exports = {
  WINDOWS, MAX_CONTEXT_TURNS, MAX_CONTEXT_BYTES, contextWindow
};
