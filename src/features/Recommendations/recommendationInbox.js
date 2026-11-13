import { sessionDisplayTitle } from '../Diary/diaryPresentation';
import { readableSessionDate } from '../Sessions/sessionLibrary';

const V1 = 'reflect.interaction.v1';
const VALID_STATUS = new Set(['accepted', 'saved', 'postponed', 'dismissed']);
const STATUS_RANK = Object.freeze({
  pending: 0, saved: 1, postponed: 2, accepted: 3, dismissed: 4
});
const safeText = value => typeof value === 'string' ? value.trim() : '';
const refOk = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/**
 * Only show source-linked, already persisted model output. Legacy prose and
 * unrelated diary entries are never classified into fabricated actions.
 * Status sorting means "needs a decision", NOT a model-derived importance score.
 */
export function buildRecommendationInbox(sessions = []) {
  const recommendations = [];
  const clarifications = [];
  if (!Array.isArray(sessions)) return { recommendations, clarifications, pendingCount: 0 };

  for (const session of sessions) {
    if (!refOk(session?.id) || !Array.isArray(session.chatHistory)) continue;
    const title = sessionDisplayTitle(session);
    const history = session.chatHistory;
    const decisions = session.recommendationDecisions || {};
    for (let i = 0; i < history.length; i++) {
      const turn = history[i];
      const interaction = turn?.interaction;
      if (turn?.role !== 'assistant' || !refOk(turn.id) ||
          interaction?.version !== V1) continue;

      const preceding = history.slice(0, i).reverse().find(item =>
        item?.role === 'user' && refOk(item.id));
      if (!preceding) continue; // No provable owner-authored source turn.

      const date = readableSessionDate(turn.timestamp) ||
        readableSessionDate(session.updatedAt) ||
        readableSessionDate(session.createdAt);
      const hypotheses = Array.isArray(interaction.insights)
        ? interaction.insights.filter(item => safeText(item)).slice(0, 2) : [];
      const reviews = session.hypothesisReviews || {};
      const reviewed = hypotheses.reduce((count, _hypothesis, index) =>
        count + (Number.isInteger(reviews[`h-${turn.id}-${index}`]?.grade) ? 1 : 0), 0);
      const challenged = hypotheses.reduce((count, _hypothesis, index) => {
        const grade = reviews[`h-${turn.id}-${index}`]?.grade;
        return count + (Number.isInteger(grade) && grade <= 1 ? 1 : 0);
      }, 0);
      const base = {
        sessionId: session.id, sessionTitle: title,
        assistantMessageId: turn.id, sourceMessageId: preceding.id,
        hypothesisCount: hypotheses.length, reviewedCount: reviewed,
        challengedCount: challenged,
        contextScope: 'current-message',
        date, unknowns: Array.isArray(interaction.unknowns)
          ? interaction.unknowns.filter(x => safeText(x)).slice(0, 2) : []
      };

      const clarification = safeText(interaction.clarifyingQuestion);
      // A later user turn means the earlier prompt has been responded to or
      // superseded. Do not keep nagging from obsolete clarifications.
      const hasLaterUserTurn = history.slice(i + 1).some(next =>
        next?.role === 'user' && refOk(next.id));
      if (interaction.stage === 'clarify' && clarification && !hasLaterUserTurn) {
        clarifications.push({
          ...base, id: session.id + ':' + turn.id + ':clarify',
          question: clarification
        });
      }

      const candidates = Array.isArray(interaction.recommendationCandidates)
        ? interaction.recommendationCandidates.slice(0, 2) : [];
      candidates.forEach((item, index) => {
        if (!safeText(item?.title) || !safeText(item?.rationale) ||
            !Array.isArray(item.sourceRefs) ||
            !item.sourceRefs.includes('current-message')) return;
        const key = `r-${turn.id}-${index}`;
        const decision = decisions[key];
        const status = VALID_STATUS.has(decision?.status) ? decision.status : 'pending';
        recommendations.push({
          ...base, id: session.id + ':' + key,
          index, title: safeText(item.title), rationale: safeText(item.rationale),
          status, goalId: refOk(decision?.goalId) ? decision.goalId : null
        });
      });
    }
  }
  const mostRecent = (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
  recommendations.sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    mostRecent(a, b) || a.id.localeCompare(b.id));
  clarifications.sort((a, b) => mostRecent(a, b) || a.id.localeCompare(b.id));
  const pendingCount = recommendations.filter(x => x.status === 'pending').length +
    clarifications.length;
  return { recommendations, clarifications, pendingCount };
}
