/**
 * M5a: explicitly confirmed owner statements in ONE saved session.
 * Not a psychological score, not provider output, not proof of objective
 * truth and never a condition to provide a general helpful answer.
 *
 * Sources are validated against literal owner-authored chat turns each time
 * the screen renders. Invalid/edited sources and disputed slots score ZERO.
 * AI-generated text and saved hypotheses are never valid sources.
 */
export const READINESS_SLOTS = Object.freeze([
  Object.freeze({ id: 'situation', label: 'Ситуация',
    hint: 'Что произошло или с чем вы столкнулись?' }),
  Object.freeze({ id: 'desiredResult', label: 'Желаемый результат',
    hint: 'Что именно вы хотите получить или изменить?' }),
  Object.freeze({ id: 'circumstances', label: 'Обстоятельства',
    hint: 'Какие реальные условия важно учесть?' }),
  Object.freeze({ id: 'constraints', label: 'Ограничения и условия',
    hint: 'Что невозможно, нежелательно или не относится к задаче?' })
]);
export const SLOT_IDS = Object.freeze(READINESS_SLOTS.map(s => s.id));
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const TEXT_CONTROL = /[\u0000-\u001f\u007f]/;
const VENT = /не (?:нужн\w*|хочу) (?:мне )?(?:совет\w*|решени\w*|рекомендац\w*)|не нужно (?:давать|предлагать) (?:мне )?(?:совет\w*|решени\w*)|просто хочу (?:выговориться|записать)|не предлагай (?:совет|решени)/i;

export function exactOwnerSource(session, sourceTurnId, quote) {
  if (!ID.test(sourceTurnId || '') || typeof quote !== 'string' ||
      quote.trim() !== quote || quote.length < 4 || quote.length > 220 ||
      TEXT_CONTROL.test(quote)) return null;
  const history = session?.chatHistory;
  if (!Array.isArray(history) || history.length > 1000) return null;
  const matched = history.filter(turn =>
    turn?.id === sourceTurnId && turn.role === 'user' &&
    typeof turn.content === 'string' &&
    turn.content.includes(quote)
  );
  // Duplicate user turns / ambiguous IDs are not evidence.
  if (matched.length !== 1 ||
      history.filter(turn => turn?.id === sourceTurnId).length !== 1) return null;
  return matched[0];
}
export function validatedReadiness(session) {
  const stored = session?.readinessEvidence;
  const source = stored && typeof stored === 'object' &&
    !Array.isArray(stored) ? stored : {};
  let completeCount = 0;
  const slots = READINESS_SLOTS.map(({ id, label, hint }) => {
    const entry = source[id];
    const valid = entry && typeof entry === 'object' &&
      !Array.isArray(entry) && entry.confirmedByOwner === true &&
      ['confirmed', 'disputed'].includes(entry.status) &&
      exactOwnerSource(session, entry.sourceTurnId, entry.quote);
    const confirmed = Boolean(valid && entry.status === 'confirmed');
    if (confirmed) completeCount++;
    return Object.freeze({
      id, label, hint, state: confirmed ? 'confirmed'
        : valid ? 'disputed' : entry ? 'unverified' : 'missing',
      ...(valid ? { sourceTurnId: entry.sourceTurnId, quote: entry.quote } : {})
    });
  });
  return Object.freeze({
    applicable: true, confirmedSlots: completeCount, totalSlots: 4,
    percentage: completeCount * 25, slots: Object.freeze(slots)
  });
}
export function isReadinessApplicable(session, effectiveMode, currentDraft = '') {
  if (!['coach','analytic'].includes(effectiveMode)) return false;
  const history = session?.chatHistory;
  const turns = Array.isArray(history) ? history : [];
  const ownerIndex = turns.findLastIndex(t => t?.role === 'user');
  const aiIndex = turns.findLastIndex(t => t?.role === 'assistant' &&
    t?.interaction?.version === 'reflect.interaction.v1');
  const prior = ownerIndex >= 0 ? turns[ownerIndex] : null;
  const latestAssessedIntent = aiIndex > ownerIndex
    ? turns[aiIndex]?.interaction?.intent : null;
  // Only the latest completed AI response can classify the current topic.
  // An earlier venting turn must not hide facts after a NEW plan request.
  if (VENT.test(currentDraft) || VENT.test(prior?.content || '') ||
      latestAssessedIntent === 'vent') return false;
  return true;
}
