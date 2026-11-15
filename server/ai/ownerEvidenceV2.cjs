"use strict";

/**
 * M5b: SERVER-ONLY bounded summary from an already verified owner's
 * ONE saved session (the existing recovery.claim transaction).
 * These fields are not provider input or a diagnosis. Never promote
 * model generated text, stale quotes or disputed categories.
 */
const SLOTS = Object.freeze([
  "situation", "desiredResult", "circumstances", "constraints"
]);
const SOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const CTRL = /[\u0000-\u001f\u007f]/;

function validSource(session, sourceTurnId, quote) {
  if (!SOURCE.test(sourceTurnId || "") ||
      typeof quote !== "string" || quote.trim() !== quote ||
      quote.length < 4 || quote.length > 220 || CTRL.test(quote)) return false;
  const history = session?.chatHistory;
  if (!Array.isArray(history) || history.length > 1000) return false;
  // The entire turn ID must be unique, including across AI turns.
  const matching = history.filter(x => x?.id === sourceTurnId);
  return matching.length === 1 && matching[0].role === "user" &&
    typeof matching[0].content === "string" &&
    matching[0].content.includes(quote);
}
function evidenceSnapshot(session) {
  const records = session?.readinessEvidence;
  const evidence = records && typeof records === "object" &&
    !Array.isArray(records) ? records : {};
  const confirmed = [], disputed = [], missing = [];
  for (const slot of SLOTS) {
    const entry = evidence[slot];
    const valid = entry && typeof entry === "object" &&
      !Array.isArray(entry) && entry.confirmedByOwner === true &&
      (entry.status === "confirmed" || entry.status === "disputed") &&
      validSource(session, entry.sourceTurnId, entry.quote);
    if (valid && entry.status === "confirmed") confirmed.push(slot);
    else if (valid && entry.status === "disputed") disputed.push(slot);
    else missing.push(slot);
  }
  const askedQuestions = [];
  const turns = session?.chatHistory;
  if (Array.isArray(turns)) {
    for (const turn of turns.slice(-100)) {
      if (turn?.role !== "assistant") continue;
      const question = turn.interaction?.clarifyingQuestion;
      if (typeof question === "string" && question.length <= 220 &&
          question.endsWith("?")) {
        askedQuestions.push(question.replace(/\s+/g, " ").trim().toLowerCase());
      }
    }
  }
  return Object.freeze({
    confirmedSlots: Object.freeze(confirmed),
    disputedSlots: Object.freeze(disputed),
    missingSlots: Object.freeze(missing),
    previousQuestions: Object.freeze(askedQuestions.slice(-8))
  });
}
function isEvidenceSnapshot(x) {
  if (!x || typeof x !== "object" || Array.isArray(x) ||
      !Array.isArray(x.confirmedSlots) ||
      !Array.isArray(x.disputedSlots) ||
      !Array.isArray(x.missingSlots) ||
      !Array.isArray(x.previousQuestions)) return false;
  const all = [...x.confirmedSlots, ...x.disputedSlots, ...x.missingSlots];
  return all.length === 4 && new Set(all).size === 4 &&
    all.every(slot => SLOTS.includes(slot)) &&
    x.previousQuestions.length <= 8 &&
    x.previousQuestions.every(q => typeof q === "string" && q.length <= 220);
}

module.exports = { SLOTS, validSource, evidenceSnapshot, isEvidenceSnapshot };
