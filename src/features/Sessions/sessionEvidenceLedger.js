// M3a: read-only, deterministic evidence ledger from ONE owner's saved
// session. Does NOT infer facts, readiness, diagnosis, truth probabilities or
// permission to send prior turns to Grok. A grade means self-reported fit only.
import { hypothesisReviewKey } from './hypothesisReviewModel';

const idOk = id => typeof id === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(id);
const text = (value, limit = 500) =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';
const savedTurns = session =>
  Array.isArray(session?.chatHistory) ? session.chatHistory : [];
const reviewData = session =>
  session?.hypothesisReviews && typeof session.hypothesisReviews === 'object' &&
    !Array.isArray(session.hypothesisReviews)
    ? session.hypothesisReviews : {};

export function feedbackStatus(grade) {
  if (!Number.isInteger(grade) || grade < 0 || grade > 4) return 'unreviewed';
  if (grade <= 1) return 'user-disputed';
  if (grade === 2) return 'user-partial';
  return 'user-aligned';
}

export function buildSessionEvidenceLedger(session) {
  if (!session || typeof session !== 'object' || !idOk(session.id)) {
    return {
      sessionId: null, hypotheses: [], questions: [], metrics: {
        userTurns: 0, aiTurns: 0, hypotheses: 0,
        reviewed: 0, disputed: 0, partial: 0, aligned: 0,
        stillUnreviewed: 0, questionsRaised: 0
      },
      sourceScope: 'single-saved-session', providerContextSent: false
    };
  }
  const turns = savedTurns(session);
  const reviews = reviewData(session);
  const hypotheses = [];
  const questions = [];
  let lastUser = null;
  let userTurns = 0;
  let aiTurns = 0;

  for (const turn of turns) {
    if (turn?.role === 'user') {
      userTurns += 1;
      lastUser = idOk(turn.id) ? turn.id : null;
      continue;
    }
    if (turn?.role !== 'assistant') continue;
    aiTurns += 1;
    // Old plain-text replies are not retroactively treated as structured
    // facts, hypotheses or source-grounded assertions.
    if (!idOk(turn.id) ||
        turn.interaction?.version !== 'reflect.interaction.v1') continue;
    const record = turn.interaction;
    const alternatives = Array.isArray(record.insights)
      ? record.insights.slice(0, 2) : [];
    alternatives.forEach((value, index) => {
      const statement = text(value);
      if (!statement) return;
      const key = hypothesisReviewKey(turn.id, index);
      const source = reviews[key];
      // A review is valid only if its immutable source coordinates match.
      // Reject orphaned/forged unrelated review records from the ledger.
      const matched = source &&
        source.assistantMessageId === turn.id &&
        source.hypothesisIndex === index &&
        Number.isInteger(source.grade) && source.grade >= 0 &&
        source.grade <= 4;
      const grade = matched ? source.grade : null;
      hypotheses.push({
        id: key, assistantMessageId: turn.id,
        sourceUserMessageId: lastUser, index,
        statement, grade,
        status: feedbackStatus(grade),
        // Owner-authored corrections, not evidence that the model is right.
        ownerComment: matched ? text(source.comment, 500) : '',
        reviewedAt: matched ? source.reviewedAt ?? null : null
      });
    });
    const question = text(record.clarifyingQuestion, 300);
    if (question && record.stage === 'clarify') {
      questions.push({
        assistantMessageId: turn.id, sourceUserMessageId: lastUser,
        question,
        // No model-based guess that later text answered this question.
        answered: null
      });
    }
  }
  const reviewed = hypotheses.filter(h => h.status !== 'unreviewed').length;
  const disputed = hypotheses.filter(h => h.status === 'user-disputed').length;
  const partial = hypotheses.filter(h => h.status === 'user-partial').length;
  const aligned = hypotheses.filter(h => h.status === 'user-aligned').length;
  return {
    sessionId: session.id,
    hypotheses, questions,
    metrics: {
      userTurns, aiTurns, hypotheses: hypotheses.length,
      reviewed, disputed, partial, aligned,
      stillUnreviewed: hypotheses.length - reviewed,
      questionsRaised: questions.length
    },
    sourceScope: 'single-saved-session',
    providerContextSent: false
  };
}

/** A safe preview of the owner's EXACT saved words. Nothing is sent.
 * Only deliberate user selection may later place these into the composer;
 * not a consent grant, not a server history-read authorization.
 */
export function prepareOwnerContextDraft(session, selectedUserTurnIds, {
  maxTurns = 3, maxChars = 720
} = {}) {
  if (!idOk(session?.id) || !Array.isArray(selectedUserTurnIds) ||
      selectedUserTurnIds.length < 1 || selectedUserTurnIds.length > maxTurns ||
      new Set(selectedUserTurnIds).size !== selectedUserTurnIds.length ||
      !Number.isInteger(maxChars) || maxChars < 300 || maxChars > 1000) {
    return null;
  }
  const userTurns = savedTurns(session).filter(turn =>
    turn?.role === 'user' && idOk(turn.id));
  const selected = [];
  for (const id of selectedUserTurnIds) {
    if (!idOk(id)) return null;
    const found = userTurns.find(turn => turn.id === id);
    if (!found) return null;
    selected.push(found);
  }
  // Quotes are explicitly labelled as untrusted history; a model should
  // not be allowed to treat embedded instructions as system policy.
  const header = 'Контекст, который я сам выбрал из своих прошлых сообщений:\n';
  const lines = [];
  let used = header.length;
  for (const turn of selected) {
    const raw = text(turn.content, maxChars);
    const flat = raw.replace(/\s+/g, ' ');
    const prefix = '[' + turn.id + '] «';
    const suffix = '»';
    const budget = maxChars - used - prefix.length - suffix.length - 1;
    if (budget < 35) break;
    // Mark truncation explicitly; never imply the entire old turn was shown.
    const clipped = flat.length > budget;
    const excerpt = flat.slice(0, budget - (clipped ? 1 : 0)) +
      (clipped ? '…' : '');
    lines.push(prefix + excerpt + suffix);
    used += prefix.length + excerpt.length + suffix.length + 1;
  }
  if (!lines.length) return null;
  return (header + lines.join('\n')).slice(0, maxChars);
}
