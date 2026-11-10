"use strict";

/**
 * Validate potential model-created interpretations BEFORE any user-visible
 * proposal can be considered. This module is intentionally NOT on the live
 * xAI response path. Grounding to selected source IDs does not prove that a
 * psychological inference is correct; separate review/safety tests are needed.
 */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TYPES = new Set(["insight", "action", "reflection"]);
const only = (item, keys) => Object.keys(item).every(key => keys.includes(key));
const validText = s => typeof s === "string" && s.trim() &&
  s.length <= 320 && Buffer.byteLength(s, "utf8") <= 800 &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
const validRef = s => typeof s === "string" &&
  /^(sessionTurn|diaryEntry|approvedMemory|goal|bodyCheckin):[A-Za-z0-9_-]{1,128}$/.test(s);

/**
 * Every accepted proposal must cite selected (already-granted) material;
 * drop guesses, unsupported refs, unknown commands and overlong payloads.
 * Never authoritatively save candidates or relabel them as user memories.
 */
function validateProposals({ candidates, selectedExcerpts } = {}) {
  const invalid = Object.freeze({ proposals: Object.freeze([]), rejected: 0 });
  if (!Array.isArray(candidates) || candidates.length > 10 ||
      !Array.isArray(selectedExcerpts) || selectedExcerpts.length > 12) return invalid;
  const allowed = new Set(selectedExcerpts
    .filter(x => x && x.untrustedEvidence === true &&
      typeof x.sourceKind === "string" && ID.test(x.sourceId || ""))
    .map(x => x.sourceKind + ":" + x.sourceId).filter(validRef));
  const proposals = [];
  let rejected = 0;
  for(const item of candidates) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        !only(item, ["kind", "text", "sourceRefs", "reviewState"]) ||
        !TYPES.has(item.kind) || !validText(item.text) ||
        item.reviewState !== "proposed" ||
        !Array.isArray(item.sourceRefs) ||
        item.sourceRefs.length < 1 || item.sourceRefs.length > 4 ||
        !item.sourceRefs.every(ref => validRef(ref) && allowed.has(ref))) {
      rejected += 1;
      continue;
    }
    if (proposals.length >= 3) { rejected += 1; continue; }
    proposals.push(Object.freeze({
      kind: item.kind, text: item.text.trim(),
      sourceRefs: Object.freeze([...new Set(item.sourceRefs)]),
      reviewState: "proposed"
    }));
  }
  return Object.freeze({ proposals: Object.freeze(proposals), rejected });
}
module.exports = { validateProposals };
