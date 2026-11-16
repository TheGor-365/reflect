import React, { useState } from 'react';
import { BookmarkPlus, CalendarClock, CheckCircle2, CircleX,
  Goal, Lightbulb, MessageCircle, MessageSquareReply, Target, Undo2,
  SlidersHorizontal, ShieldQuestion, Check, ArrowRight } from 'lucide-react';
import { HYPOTHESIS_GRADES } from './hypothesisReviewModel';
import SmoothDisclosure from '../../components/common/SmoothDisclosure';
import AnimatedCollapse from '../../components/common/AnimatedCollapse';
import { recommendationGoalGate } from './recommendationGoalGate';
import { isSupportedInteraction, INTERACTION_V2, EVIDENCE_SLOT_LABELS }
  from './interactionVersions';

// Structured AI proposals remain suggestions until a human explicitly chooses
// an action. No Firestore access or background writes occur in this component.
export default function InteractionResult({
  interaction, messageId, isSaved = false, decisions = {},
  onCompose, onDecision, onOpenGoals, onOpenRecommendations,
  reviews = {}, onHypothesisReview, onFocusTurn
}) {
  const [editingGoal, setEditingGoal] = useState(null);
  const [reconsiderIndex, setReconsiderIndex] = useState(null);
  const [goalDraft, setGoalDraft] = useState({ title: '', purpose: '', step: '', dueDay: '', criteria: '' });
  const [busyIndex, setBusyIndex] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [reviewIndex, setReviewIndex] = useState(null);
  const [reviewGrade, setReviewGrade] = useState(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');
  if (!isSupportedInteraction(interaction)) return null;
  const isV2 = interaction.version === INTERACTION_V2;
  const claims = isV2 && Array.isArray(interaction.evidenceClaims)
    ? interaction.evidenceClaims.filter(item =>
      typeof item?.quote === 'string' &&
      item.sourceRef === 'current-message' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(item.sourceTurnId || '')
    ) : [];
  const evidence = isV2 && interaction.evidenceSummary &&
    typeof interaction.evidenceSummary === 'object' &&
    Array.isArray(interaction.evidenceSummary.confirmedSlots) &&
    Array.isArray(interaction.evidenceSummary.missingSlots)
    ? interaction.evidenceSummary : null;
  const question = typeof interaction.clarifyingQuestion === 'string'
    ? interaction.clarifyingQuestion : '';
  const candidates = Array.isArray(interaction.recommendationCandidates)
    ? interaction.recommendationCandidates : [];
  const insights = Array.isArray(interaction.insights) ? interaction.insights : [];
  const needsClarification = interaction.stage === 'clarify';
  const reviewedCount = insights.filter((_, index) =>
    Number.isInteger(reviews[`h-${messageId}-${index}`]?.grade)).length;
  const goalGate = recommendationGoalGate({
    interaction, assistantMessageId: messageId, reviews
  });
  const oldRecommendationWithOpenHypotheses =
    candidates.length > 0 && !goalGate.allowed;
  const openReview = index => {
    const existing = reviews[`h-${messageId}-${index}`];
    setReviewGrade(Number.isInteger(existing?.grade) ? existing.grade : null);
    setReviewComment(typeof existing?.comment === 'string' ? existing.comment : '');
    setReviewError('');
    setReviewIndex(index === reviewIndex ? null : index);
  };
  const saveReview = async event => {
    event.preventDefault();
    if (!isSaved || !onHypothesisReview || reviewSaving ||
        !Number.isInteger(reviewGrade) || reviewIndex === null) return;
    setReviewSaving(true); setReviewError('');
    try {
      await onHypothesisReview(reviewIndex, reviewGrade, reviewComment);
      // The owner-scoped session transaction has committed. Collapse the
      // editor; source-of-truth snapshot / scoped echo paints the saved chip.
      setReviewIndex(null);
    } catch {
      setReviewError('Отклик не подтверждён сервером. Текст остался на экране — повторите сохранение.');
    } finally { setReviewSaving(false); }
  };
  const decide = async (index, action, draft = {}) => {
    if (!isSaved || typeof onDecision !== 'function' || busyIndex !== null ||
        (action === 'goal' && !goalGate.allowed)) return;
    setBusyIndex(index);
    setFeedback('');
    setError('');
    try {
      await onDecision(index, action, draft);
      setEditingGoal(null);
      setFeedback(action === 'goal'
        ? 'Цель подтверждена и связана с сеансом.'
        : action === 'saved' ? 'Идея сохранена.'
          : action === 'postponed' ? 'Предложение отложено.' : 'Предложение отклонено.');
    } catch (failure) {
      // Keep the editable goal draft on failure; no silent second attempt.
      setError(failure?.message || 'Решение не сохранилось. Проверьте соединение.');
    } finally {
      setBusyIndex(null);
    }
  };
  return (
    <div className="reflect-interaction-result" aria-label="Структурированный ответ Reflect">
      <details className="reflect-interaction-readiness">
        <summary className="reflect-readiness-compact">
          <ShieldQuestion size={14} aria-hidden="true"/>
          <span>Проработка · предварительная</span>
          <output>{reviewedCount}/{insights.length} оценено</output>
        </summary>
        <div className="reflect-readiness-expanded">
          <p>Выводы основаны на текущем сообщении. Гипотезы не являются
            доказанными причинами. История используется только по разрешению.</p>
          <div className="reflect-hypothesis-evidence" aria-label="Проверяемые показатели">
            <span>История по разрешению</span>
            <span>Ваши оценки: {reviewedCount} из {insights.length} гипотез</span>
            <span>Открытых вопросов: {needsClarification ? 1 : 0}</span>
          </div>
          <p>Оценки показывают только ваше согласие с гипотезами,
            а не объективную вероятность их истинности.</p>
          {onOpenRecommendations && (candidates.length > 0 || needsClarification) &&
            <button type="button" onClick={onOpenRecommendations}>
              <Lightbulb size={14} aria-hidden="true"/> Рекомендации и уточнения
            </button>}
        </div>
      </details>
      {isV2 && <section className="reflect-interaction-section"
        aria-label="Источники и неизвестное — версия 2">
        <strong>Что подтверждено вами, а что ещё неизвестно</strong>
        <p>Дословные цитаты ниже — только ваши слова из текущего сообщения.
          Это не независимая проверка их достоверности и не мнение специалиста.</p>
        {claims.length ? (
          <ul aria-label="Слова владельца с источниками">
            {claims.map((item, i) => (
              <li key={i}>
                <q>{item.quote}</q>{' '}
                {onFocusTurn && <button type="button"
                  onClick={() => onFocusTurn(item.sourceTurnId)}>
                  Показать исходное сообщение
                </button>}
              </li>
            ))}
          </ul>
        ) : <p>В этом ответе нет дословно выделенных фактов.</p>}
        {evidence && <>
          <p>По состоянию на момент ответа подтверждено категорий:
            {' '}{evidence.completeCount} из 4. Это показатель заполненности
            ваших сведений, а не вероятность правильного совета.</p>
          {evidence.missingSlots.length > 0 && (
            <p>Ещё требуют вашего подтверждения:
              {' '}{evidence.missingSlots
                .filter(slot => EVIDENCE_SLOT_LABELS[slot])
                .map(slot => EVIDENCE_SLOT_LABELS[slot]).join(', ')}.</p>
          )}
          {Array.isArray(evidence.disputedSlots) &&
            evidence.disputedSlots.length > 0 && (
              <p>Вы оспорили:
                {' '}{evidence.disputedSlots
                  .filter(slot => EVIDENCE_SLOT_LABELS[slot])
                  .map(slot => EVIDENCE_SLOT_LABELS[slot]).join(', ')}.</p>
            )}
        </>}
        {question && interaction.clarificationSlot &&
          EVIDENCE_SLOT_LABELS[interaction.clarificationSlot] && (
            <p>Тема уточнения:
              {' '}{EVIDENCE_SLOT_LABELS[interaction.clarificationSlot]}.</p>
          )}
      </section>}
      {insights.length > 0 && <section className="reflect-interaction-section"
        aria-label="Непроверенные гипотезы Reflect">
        <strong>Возможные объяснения — пока гипотезы</strong>
        <p>Я могу ошибаться. Оцените, насколько каждое объяснение соответствует вашей ситуации:
          от «совсем мимо» до «очень точно». Это ваш отклик, не вероятность.</p>
        {insights.map((insight, index) => {
          const existing = reviews[`h-${messageId}-${index}`];
          return <div className="reflect-hypothesis-card" key={index}>
            <p><small>Гипотеза {index+1}</small> {insight}</p>
            {Number.isInteger(existing?.grade) && (
              <div className="reflect-hypothesis-saved" role="status">
                <span className="reflect-hypothesis-saved-grade"
                  data-grade={existing.grade}>
                  <Check size={13} aria-hidden="true"/>
                  {HYPOTHESIS_GRADES[existing.grade]}
                </span>
                {existing.comment && (
                  <SmoothDisclosure label="Ваш комментарий"
                    iconKind="information" className="reflect-hypothesis-saved-comment">
                    <p>{existing.comment}</p>
                  </SmoothDisclosure>
                )}
              </div>
            )}
            {onHypothesisReview && isSaved && (
              <div className="reflect-hypothesis-controls">
                <button type="button" aria-expanded={reviewIndex === index}
                  onClick={() => openReview(index)}>
                  <SlidersHorizontal size={13} aria-hidden="true"/>
                  {existing ? 'Изменить оценку' : 'Оценить гипотезу'}
                </button>
              </div>
            )}
            {onHypothesisReview && isSaved && (
              <AnimatedCollapse open={reviewIndex === index}
                className="reflect-hypothesis-editor">
              <form className="reflect-hypothesis-feedback" onSubmit={saveReview}>
                <div role="group" aria-label={`Оценка гипотезы ${index+1}`}
                  className="reflect-hypothesis-grade">
                  {HYPOTHESIS_GRADES.map((label, grade) =>
                    <button type="button" key={label}
                      aria-pressed={reviewGrade === grade}
                      disabled={reviewSaving}
                      onClick={() => setReviewGrade(grade)}>
                      {label}
                    </button>)}
                </div>
                <label>Комментарий (необязательно)
                  <textarea value={reviewComment} rows={2} maxLength={500}
                    disabled={reviewSaving}
                    onChange={event => setReviewComment(event.target.value)}
                    placeholder="Что важно уточнить или исправить?"/>
                </label>
                <div className="reflect-hypothesis-feedback-actions">
                  <button type="submit" disabled={reviewSaving || reviewGrade === null}>
                    <Check size={15} aria-hidden="true"/>
                    {reviewSaving ? 'Сохраняется…' : 'Сохранить оценку'}
                  </button>
                  <button type="button" disabled={reviewSaving}
                    onClick={() => setReviewIndex(null)}>
                    Отмена
                  </button>
                </div>
                {reviewError && reviewIndex === index && <p role="alert">{reviewError}</p>}
              </form>
              </AnimatedCollapse>
            )}
          </div>;
        })}
      </section>}
      {question && (
        <section className="reflect-interaction-section" aria-label="Уточнение">
          <strong>Важное уточнение</strong>
          <p>{question}</p>
          {onCompose && <button type="button"
            className="reflect-reply-action reflect-session-quiet-action"
            onClick={() => onCompose('')}>
            <MessageSquareReply size={13} aria-hidden="true"/>
            Ответить в диалоге
          </button>}
        </section>
      )}
      {candidates.map((item, index) => {
        const decision = messageId ? decisions[`r-${messageId}-${index}`] : null;
        const status = decision?.status;
        if (status === 'dismissed' && reconsiderIndex !== index) {
          return (
            <section className="reflect-interaction-section" key={index}
              aria-label="Отклонённая рекомендация">
              <small>Предложение отклонено и скрыто по вашему решению.</small>
              <button type="button" onClick={() => setReconsiderIndex(index)}>
                <Undo2 size={15} aria-hidden="true"/> Показать отклонённое предложение
              </button>
            </section>
          );
        }
        return (
          <section className="reflect-interaction-section" key={index}
            aria-label="Предложенная рекомендация">
            <strong>{item.title}</strong>
            <p>{item.rationale}</p>
            <small>Предложение Reflect</small>
            {oldRecommendationWithOpenHypotheses && <p
              className="reflect-hypothesis-uncertainty" role="status">
              Цель пока недоступна: {goalGate.reason}
              Сохранить идею или отложить её можно независимо.
            </p>}
            <div className="reflect-interaction-actions">
              {onCompose && <button type="button"
                onClick={() => onCompose('Хочу обсудить предложение «' + item.title + '»: ')}>
                <MessageCircle size={15} aria-hidden="true"/> Обсудить
              </button>}
              {onDecision && !isSaved && <small>Сначала сохраните сеанс, чтобы принять решение.</small>}
              {onDecision && isSaved && (
                <>
                  {status && <span role="status" className="reflect-interaction-decision">
                    {status === 'accepted' ? (decision?.goalRemovedAt
                       ? 'Цель удалена · решение сохранено' : 'Принято как цель')
                      : status === 'saved' ? 'Идея сохранена'
                        : status === 'postponed' ? 'Отложено'
                          : status === 'dismissed' ? 'Не подходит' : 'Решение сохранено'}
                  </span>}
                  {status !== 'accepted' && (
                    <>
                      <button type="button" disabled={busyIndex !== null}
                        onClick={() => decide(index, 'saved')}><BookmarkPlus size={15} aria-hidden="true"/> Сохранить идею</button>
                      <button type="button" disabled={busyIndex !== null}
                        onClick={() => decide(index, 'postponed')}><CalendarClock size={15} aria-hidden="true"/> Отложить</button>
                      <button type="button" disabled={busyIndex !== null}
                        onClick={() => decide(index, 'dismissed')}><CircleX size={15} aria-hidden="true"/> Не подходит</button>
                      <button type="button"
                        disabled={busyIndex !== null || oldRecommendationWithOpenHypotheses}
                        aria-expanded={editingGoal === index}
                        onClick={() => {
                          setEditingGoal(editingGoal === index ? null : index);
                          setGoalDraft({ title: item.title, purpose: '', step: '', dueDay: '', criteria: '' });
                          setError('');
                        }}><Target size={15} aria-hidden="true"/> Превратить в цель</button>
                    </>
                  )}
                  {status === 'accepted' && !decision?.goalRemovedAt && onOpenGoals && (
                    <button type="button" onClick={() => onOpenGoals(decision?.goalId || null)}><Goal size={15} aria-hidden="true"/> Открыть цели</button>
                  )}
                </>
              )}
            </div>
            {onDecision && isSaved && editingGoal === index && status !== 'accepted' && (
              <form className="reflect-interaction-goal-form"
                onSubmit={event => {
                  event.preventDefault();
                  decide(index, 'goal', goalDraft);
                }}>
                <p>Цель создаётся только после вашего подтверждения. Укажите один конкретный первый шаг и критерий, по которому вы сами проверите результат.</p>
                <label>Название цели
                  <input required maxLength={240} value={goalDraft.title}
                    disabled={busyIndex !== null}
                    onChange={event => setGoalDraft(value => ({ ...value, title: event.target.value }))}/>
                </label>
                <label>Зачем это нужно? (необязательно)
                  <textarea maxLength={1000} rows={2} value={goalDraft.purpose}
                    disabled={busyIndex !== null}
                    onChange={event => setGoalDraft(value => ({ ...value, purpose: event.target.value }))}/>
                </label>
                <label>Первый проверяемый шаг
                  <input required maxLength={240} value={goalDraft.step}
                    disabled={busyIndex !== null}
                    onChange={event => setGoalDraft(value => ({ ...value, step: event.target.value }))}/>
                </label>
                <label>Срок (необязательно)
                  <input type="date" value={goalDraft.dueDay}
                    disabled={busyIndex !== null}
                    onChange={event => setGoalDraft(value => ({ ...value, dueDay: event.target.value }))}/>
                </label>
                <label>Как я пойму, что цель достигнута?
                  <textarea required maxLength={500} rows={2} value={goalDraft.criteria}
                    disabled={busyIndex !== null}
                    onChange={event => setGoalDraft(value => ({ ...value, criteria: event.target.value }))}/>
                </label>
                <button type="submit" disabled={busyIndex !== null ||
                  !goalGate.allowed || !goalDraft.title.trim() ||
                  !goalDraft.step.trim() || !goalDraft.criteria.trim()}>
                  <CheckCircle2 size={15} aria-hidden="true"/> {busyIndex !== null ? 'Сохранение…' : 'Подтвердить создание цели'}
                </button>
                <button type="button" disabled={busyIndex !== null}
                  onClick={() => setEditingGoal(null)}><Undo2 size={15} aria-hidden="true"/> Отмена</button>
              </form>
            )}
          </section>
        );
      })}
      {error && <p role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}

    </div>
  );
}
