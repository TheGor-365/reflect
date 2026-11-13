// Pure owner-input vocabulary and validation. Neither AI confidence nor
// calibrated probability is inferred from this self-reported five-step scale.
export const HYPOTHESIS_GRADES = Object.freeze([
  'Совсем мимо', 'Скорее мимо', 'Частично похоже',
  'Близко', 'Очень точно'
]);
const idOk = value => typeof value === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function hypothesisReviewKey(messageId, index) {
  if (!idOk(messageId) || !Number.isInteger(index) || index < 0 || index > 1) {
    throw new Error('Некорректный источник гипотезы.');
  }
  return `h-${messageId}-${index}`;
}
export function validateHypothesisReview({ grade, comment = '' }) {
  if (!Number.isInteger(grade) || grade < 0 ||
      grade >= HYPOTHESIS_GRADES.length ||
      typeof comment !== 'string' || comment.length > 500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(comment)) {
    throw new Error('Оцените гипотезу и проверьте длину комментария.');
  }
  return { grade, comment: comment.trim() };
}
