import React, { useState } from 'react';
import { BookmarkPlus, CalendarClock, CheckCircle2, CircleX,
  Goal, Lightbulb, MessageCircle, MessageSquareReply, Target, Undo2,
  SlidersHorizontal, ShieldQuestion, Check, ArrowRight } from 'lucide-react';
import { HYPOTHESIS_GRADES } from './hypothesisReviewModel';

// Structured AI proposals remain suggestions until a human explicitly chooses
// an action. No Firestore access or background writes occur in this component.
export default function InteractionResult({
  interaction, messageId, isSaved = false, decisions = {},
  onCompose, onDecision, onOpenGoals, onOpenRecommendations,
  reviews = {}, onHypothesisReview
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
  const [reviewSaved, setReviewSaved] = useState(false);
  if (!interaction || interaction.version !== 'reflect.interaction.v1') return null;
  const question = typeof interaction.clarifyingQuestion === 'string'
    ? interaction.clarifyingQuestion : '';
  const candidates = Array.isArray(interaction.recommendationCandidates)
    ? interaction.recommendationCandidates : [];
  const insights = Array.isArray(interaction.insights) ? interaction.insights : [];
  const needsClarification = interaction.stage === 'clarify';
  const reviewedCount = insights.filter((_, index) =>
    Number.isInteger(reviews[`h-${messageId}-${index}`]?.grade)).length;
  const oldRecommendationWithOpenHypotheses =
    candidates.length > 0 && (needsClarification ||
    (insights.length > 0 && reviewedCount < insights.length) ||
    (Array.isArray(interaction.unknowns) && interaction.unknowns.length > 0));
  const openReview = index => {
    const existing = reviews[`h-${messageId}-${index}`];
    setReviewGrade(Number.isInteger(existing?.grade) ? existing.grade : null);
    setReviewComment(typeof existing?.comment === 'string' ? existing.comment : '');
    setReviewError('');
    setReviewSaved(false);
    setReviewIndex(index);
  };
  const saveReview = async event => {
    event.preventDefault();
    if (!isSaved || !onHypothesisReview || reviewSaving ||
        !Number.isInteger(reviewGrade) || reviewIndex === null) return;
    setReviewSaving(true); setReviewError('');
    try {
      await onHypothesisReview(reviewIndex, reviewGrade, reviewComment);
      setReviewSaved(true);
    } catch {
      setReviewError('Отклик не подтверждён сервером. Текст остался на экране — повторите сохранение.');
    } finally { setReviewSaving(false); }
  };
  const decide = async (index, action, draft = {}) => {
    if (!isSaved || typeof onDecision !== 'function' || busyIndex !== null) return;
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
      <div className="reflect-interaction-readiness" role="status">
        <strong><ShieldQuestion size={17} aria-hidden="true"/>
          Проработка: предварительная
        </strong>
        <p>Я вижу только переданное мне сообщение, а не всю историю сеанса.
          Сейчас это возможные объяснения, не установленные причины.</p>
        <div className="reflect-hypothesis-evidence" aria-label="Проверяемые показатели">
          <span>Контекст модели: 1 сообщение</span>
          <span>Ваши оценки: {reviewedCount} из {insights.length} гипотез</span>
          <span>Открытых вопросов: {needsClarification ? 1 : 0}</span>
        </div>
        <p className="reflect-hypothesis-uncertainty">
          Вероятность точности не рассчитана: данных для надёжного процента нет.
          {needsClarification
            ? ' Сначала стоит ответить на уточняющий вопрос.'
            : ' Вы можете оспорить мои гипотезы и продолжить проверку.'}
        </p>
        {onOpenRecommendations && (candidates.length > 0 || needsClarification) &&
          <button type="button" onClick={onOpenRecommendations}>
            <Lightbulb size={15} aria-hidden="true"/> Открыть рекомендации и уточнения
          </button>}
      </div>
      {insights.length > 0 && <section className="reflect-interaction-section"
        aria-label="Непроверенные гипотезы Reflect">
        <strong>Возможные объяснения — пока гипотезы</strong>
        <p>Я могу ошибаться. Оцените, насколько каждое объяснение соответствует вашей ситуации:
          от «совсем мимо» до «очень точно». Это ваш отклик, не вероятность.</p>
        {insights.map((insight, index) => {
          const existing = reviews[`h-${messageId}-${index}`];
          return <div className="reflect-hypothesis-card" key={index}>
            <p><small>Гипотеза {index+1}</small> {insight}</p>
            {Number.isInteger(existing?.grade) &&
              <p className="reflect-hypothesis-existing" role="status">
                Ваш отклик: {HYPOTHESIS_GRADES[existing.grade] || 'Не оценено'}
                {existing.comment && ' · ' + existing.comment}
              </p>}
            {onHypothesisReview && isSaved && <button type="button"
              onClick={() => openReview(index)}>
              <SlidersHorizontal size={15} aria-hidden="true"/>
              {existing ? 'Изменить мою оценку' : 'Оценить гипотезу'}
            </button>}
            {reviewIndex === index && onHypothesisReview && isSaved &&
              <form className="reflect-hypothesis-feedback" onSubmit={saveReview}>
                <div role="group" aria-label={`Оценка гипотезы ${index+1}`}
                  className="reflect-hypothesis-grade">
                  {HYPOTHESIS_GRADES.map((label, grade) =>
                    <button type="button" key={label}
                      aria-pressed={reviewGrade === grade}
                      disabled={reviewSaving}
                      onClick={() => {setReviewGrade(grade); setReviewSaved(false);}}>
                      {label}
                    </button>)}
                </div>
                <label>Что я понял неверно? (по желанию)
                  <textarea value={reviewComment} rows={2} maxLength={500}
                    disabled={reviewSaving}
                    onChange={event => {setReviewComment(event.target.value);setReviewSaved(false);}}
                    placeholder="Например: я не боюсь оценки — причина в другом..."/>
                </label>
                <div className="reflect-hypothesis-feedback-actions">
                  <button type="submit" disabled={reviewSaving || reviewGrade === null}>
                    <Check size={15} aria-hidden="true"/>
                    {reviewSaving ? 'Сохраняется…' : 'Сохранить мой отклик'}
                  </button>
                  {onCompose && (reviewSaved || existing) &&
                    <button type="button" onClick={() => onCompose(
                      `Ранее предложенная гипотеза «${insight}». Моя оценка: ${HYPOTHESIS_GRADES[reviewGrade ?? existing.grade]}.`+
                      (reviewComment.trim() ? ` Мой комментарий: ${reviewComment.trim()}.` : '')+
                      ' Не принимай её за факт. Задай один точный вопрос, чтобы проверить другие объяснения.'
                    )}>
                      <ArrowRight size={15} aria-hidden="true"/> Продолжить разбор
                    </button>}
                </div>
                {reviewSaved && <p role="status">
                  Отклик сохранён в вашем сеансе. В Grok он не отправлен.
                  Для продолжения нажмите «Продолжить разбор» и отправьте подготовленный текст.
                </p>}
                {reviewError && <p role="alert">{reviewError}</p>}
              </form>}
          </div>;
        })}
      </section>}
      {question && (
        <section className="reflect-interaction-section" aria-label="Уточнение">
          <strong>Важное уточнение</strong>
          <p>{question}</p>
          {onCompose && <button type="button"
            onClick={() => onCompose('Мой ответ на вопрос «' + question + '»: ')}>
            <MessageSquareReply size={15} aria-hidden="true"/> Ответить
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
            <small>Источник: только текущее сообщение. Идея AI — не доказательство
              причины поведения и не ваша цель.</small>
            {oldRecommendationWithOpenHypotheses && <p className="reflect-hypothesis-uncertainty">
              Остались непроверенные объяснения. Не превращайте это старое предложение
              в цель, пока не проверите предпосылки.
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
                    {status === 'accepted' ? 'Принято как цель'
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
                  {status === 'accepted' && onOpenGoals && (
                    <button type="button" onClick={onOpenGoals}><Goal size={15} aria-hidden="true"/> Открыть цели</button>
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
                <p>Цель создаётся только после вашего подтверждения. Название можно изменить.</p>
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
                <label>Первый проверяемый шаг (необязательно)
                  <input maxLength={240} value={goalDraft.step}
                    disabled={busyIndex !== null}
                    onChange={event => setGoalDraft(value => ({ ...value, step: event.target.value }))}/>
                </label>
                <label>Срок (необязательно)
                  <input type="date" value={goalDraft.dueDay}
                    disabled={busyIndex !== null}
                    onChange={event => setGoalDraft(value => ({ ...value, dueDay: event.target.value }))}/>
                </label>
                <label>Как я пойму, что цель достигнута? (необязательно)
                  <textarea maxLength={500} rows={2} value={goalDraft.criteria}
                    disabled={busyIndex !== null}
                    onChange={event => setGoalDraft(value => ({ ...value, criteria: event.target.value }))}/>
                </label>
                <button type="submit" disabled={busyIndex !== null || !goalDraft.title.trim()}>
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
      <details className="reflect-interaction-evidence-details">
        <summary>Что учтено и что ещё нужно проверить</summary>
        <p>Источник этого ответа: только текст вашего текущего сообщения.
          История предыдущих сеансов и дневник не были отправлены модели.</p>
        {insights.length>0 && <p>Модель выделила {insights.length}
          {insights.length===1?' возможное объяснение':' возможных объяснения'}.
          Это не подтверждённые факты.</p>}
        {Array.isArray(interaction.unknowns) && interaction.unknowns.length>0
          ? <ul>{interaction.unknowns.map((item,index)=>
            <li key={index}>Открытый вопрос: {item}</li>)}</ul>
          : <p>Модель не перечислила неизвестные факты. Это не означает,
              что весь контекст уже изучен.</p>}
      </details>
    </div>
  );
}
