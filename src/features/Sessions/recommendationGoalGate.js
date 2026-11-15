/**
 * M6a: one canonical prerequisite gate shared by the owner-facing button
 * and the Firestore transaction that actually creates a goal.
 *
 * A stored AI proposal is NOT evidence. A review is the owner's feedback,
 * not a calibrated model probability. Saving, postponing or dismissing an
 * idea must remain possible even when this goal gate fails.
 */
import { isSupportedInteraction } from './interactionVersions';

const GATES = Object.freeze({
  invalid: 'Рекомендация отсутствует в сохранённом ответе Reflect.',
  question: 'Сначала ответьте на открытый уточняющий вопрос.',
  unknown: 'В исходной рекомендации остались неизвестные обстоятельства. Сначала уточните их в новом ответе Reflect.',
  unreviewed: 'Сначала оцените все гипотезы, связанные с этим ответом.',
  disputed: 'Вы не подтвердили одну из предпосылок. Сначала уточните ситуацию и получите новую рекомендацию.',
  source: 'Источник оценки не совпадает с исходной гипотезой.'
});

export function recommendationGoalGate({
  interaction, assistantMessageId, reviews = {}
} = {}) {
  const denied = code => Object.freeze({
    allowed: false, code, reason: GATES[code]
  });
  if (!isSupportedInteraction(interaction) ||
      typeof assistantMessageId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(assistantMessageId)) {
    return denied('invalid');
  }
  if (interaction.stage === 'clarify' ||
      (typeof interaction.clarifyingQuestion === 'string' &&
        interaction.clarifyingQuestion.trim())) return denied('question');

  if (!Array.isArray(interaction.unknowns) ||
      interaction.unknowns.length > 0) return denied('unknown');

  const insights = interaction.insights;
  if (!Array.isArray(insights) || insights.length > 2) return denied('invalid');

  const ownerReviews = reviews && typeof reviews === 'object' &&
    !Array.isArray(reviews) ? reviews : {};
  for (let index = 0; index < insights.length; index++) {
    if (typeof insights[index] !== 'string' || !insights[index].trim()) {
      return denied('invalid');
    }
    const record = ownerReviews[`h-${assistantMessageId}-${index}`];
    if (record === undefined) return denied('unreviewed');
    if (record.assistantMessageId !== assistantMessageId ||
        record.hypothesisIndex !== index ||
        !Number.isInteger(record.grade) ||
        record.grade < 0 || record.grade > 4) return denied('source');
    if (record.grade <= 1) return denied('disputed');
  }
  if (interaction.version === 'reflect.interaction.v2' &&
      (!interaction.evidenceSummary ||
       !Array.isArray(interaction.evidenceSummary.disputedSlots) ||
       interaction.evidenceSummary.disputedSlots.length > 0)) {
    return denied('disputed');
  }
  return Object.freeze({ allowed: true, code: 'ready', reason: '' });
}
