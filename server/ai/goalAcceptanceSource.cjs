"use strict";

// R139 C3c.3a: pure validation, no writes or runtime route.
// All snapshots must be read by a future authenticated server transaction
// from the exact owner paths. Owner reviews express consent, not factual truth.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const valid = x => typeof x === "string" && ID.test(x);
const plain = x => x !== null && typeof x === "object" &&
  Object.getPrototypeOf(x) === Object.prototype;
const textOk = (x, n) => typeof x === "string" && x.trim().length > 0 &&
  x.length <= n && !/[\u0000-\u001f\u007f]/.test(x);
const denied = code => Object.freeze({ allowed: false, code });
const archived = x => x?.archivedAt != null;

function validateGoalAcceptanceSource({ projectId, uid, sessionId, sourceTurnId,
  assistantTurnId, candidateIndex, session, receipt, guard, keyring } = {}) {
  if (projectId !== "reflect-ai-staging" ||
      ![uid, sessionId, sourceTurnId, assistantTurnId].every(valid) ||
      !/^user-[A-Za-z0-9_-]{12,80}$/.test(sourceTurnId) ||
      candidateIndex !== 0 || !plain(session) || !plain(receipt) ||
      (session.ownerUid != null && session.ownerUid !== uid) ||
      (session.uid != null && session.uid !== uid)) return denied("invalid-source");
  if (archived(session)) return denied("archived");
  if (guard !== null && (!plain(guard) || guard.provenanceRevoked !== false)) {
    return denied("revoked");
  }
  if (receipt.uid !== uid || receipt.sessionId !== sessionId ||
      receipt.sourceTurnId !== sourceTurnId || receipt.assistantTurnId !== assistantTurnId ||
      receipt.status !== "persisted_reply" ||
      !/^[A-Za-z0-9_-]{12,80}$/.test(receipt.requestId || "") ||
      assistantTurnId !== "assistant-" + receipt.requestId) return denied("invalid-source");
  const history = session.chatHistory;
  if (!Array.isArray(history) || history.length > 1000) return denied("invalid-source");
  const sources = history.filter(t => t?.id === sourceTurnId);
  const answers = history.filter(t => t?.id === assistantTurnId);
  if (sources.length !== 1 || answers.length !== 1) return denied("invalid-source");
  const [source] = sources, [answer] = answers;
  if (source.role !== "user" || answer.role !== "assistant" ||
      answer.sourceTurnId !== sourceTurnId ||
      history.indexOf(source) >= history.indexOf(answer)) return denied("invalid-source");
  const interaction = answer.interaction;
  if (!plain(interaction) ||
      !["reflect.interaction.v1", "reflect.interaction.v2"].includes(interaction.version) ||
      !keyring || typeof keyring.verify !== "function") return denied("invalid-source");
  try {
    if (keyring.verify({ projectId, uid, sessionId, sourceTurnId, assistantTurnId,
      sourceText: source.content, assistantText: answer.content, interaction },
      receipt.provenance) !== true) return denied("unverified");
  } catch { return denied("unverified"); }
  if (interaction.stage !== "synthesize" || typeof interaction.clarifyingQuestion !== "string" ||
      interaction.clarifyingQuestion.trim()) return denied("question");
  if (!Array.isArray(interaction.unknowns) || interaction.unknowns.length !== 0) {
    return denied("unknown");
  }
  const insights = interaction.insights;
  if (!Array.isArray(insights) || insights.length > 2) return denied("invalid-source");
  for (let i = 0; i < insights.length; i++) {
    if (typeof insights[i] !== "string" || !insights[i].trim() ||
        insights[i].length > 240) return denied("invalid-source");
    const review = session.hypothesisReviews?.["h-" + assistantTurnId + "-" + i];
    if (review === undefined) return denied("unreviewed");
    if (!plain(review) || review.assistantMessageId !== assistantTurnId ||
        review.hypothesisIndex !== i || !Number.isInteger(review.grade) ||
        review.grade < 0 || review.grade > 4) return denied("invalid-review");
    if (review.grade <= 1) return denied("disputed");
  }
  if (interaction.version === "reflect.interaction.v2" &&
      (!plain(interaction.evidenceSummary) ||
       !Array.isArray(interaction.evidenceSummary.disputedSlots) ||
       interaction.evidenceSummary.disputedSlots.length !== 0)) return denied("disputed");
  const candidates = interaction.recommendationCandidates;
  const candidate = Array.isArray(candidates) && candidates.length === 1 ? candidates[0] : null;
  if (!plain(candidate) || !textOk(candidate.title, 120) ||
      !textOk(candidate.rationale, 350) || !Array.isArray(candidate.sourceRefs) ||
      candidate.sourceRefs.length !== 1 || candidate.sourceRefs[0] !== "current-message") {
    return denied("invalid-candidate");
  }
  const recommendationKey = "r-" + assistantTurnId + "-0";
  if (archived(session.recommendationDecisions?.[recommendationKey])) return denied("archived");
  return Object.freeze({ allowed: true, code: "ready", recommendationKey,
    sourceTurnId, assistantTurnId, candidateIndex, title: candidate.title,
    promptVersion: interaction.version });
}
module.exports = { validateGoalAcceptanceSource };
