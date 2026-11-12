import React, { useState } from 'react';

// Structured AI proposals remain suggestions until a human explicitly chooses
// an action. No Firestore access or background writes occur in this component.
export default function InteractionResult({
  interaction, messageId, isSaved = false, decisions = {},
  onCompose, onDecision, onOpenGoals
}) {
  const [editingGoal, setEditingGoal] = useState(null);
  const [reconsiderIndex, setReconsiderIndex] = useState(null);
  const [goalDraft, setGoalDraft] = useState({ title: '', purpose: '', step: '', dueDay: '', criteria: '' });
  const [busyIndex, setBusyIndex] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  if (!interaction || interaction.version !== 'reflect.interaction.v1') return null;
  const question = typeof interaction.clarifyingQuestion === 'string'
    ? interaction.clarifyingQuestion : '';
  const candidates = Array.isArray(interaction.recommendationCandidates)
    ? interaction.recommendationCandidates : [];
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
      {question && (
        <section className="reflect-interaction-section" aria-label="Уточнение">
          <strong>Важное уточнение</strong>
          <p>{question}</p>
          {onCompose && <button type="button"
            onClick={() => onCompose('Мой ответ на вопрос «' + question + '»: ')}>
            Ответить
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
                Показать отклонённое предложение
              </button>
            </section>
          );
        }
        return (
          <section className="reflect-interaction-section" key={index}
            aria-label="Предложенная рекомендация">
            <strong>{item.title}</strong>
            <p>{item.rationale}</p>
            <small>Основано на вашем текущем сообщении. Это предложение AI, не проверенный факт и не созданная цель.</small>
            <div className="reflect-interaction-actions">
              {onCompose && <button type="button"
                onClick={() => onCompose('Хочу обсудить предложение «' + item.title + '»: ')}>
                Обсудить
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
                        onClick={() => decide(index, 'saved')}>Сохранить идею</button>
                      <button type="button" disabled={busyIndex !== null}
                        onClick={() => decide(index, 'postponed')}>Отложить</button>
                      <button type="button" disabled={busyIndex !== null}
                        onClick={() => decide(index, 'dismissed')}>Не подходит</button>
                      <button type="button" disabled={busyIndex !== null}
                        aria-expanded={editingGoal === index}
                        onClick={() => {
                          setEditingGoal(editingGoal === index ? null : index);
                          setGoalDraft({ title: item.title, purpose: '', step: '', dueDay: '', criteria: '' });
                          setError('');
                        }}>Превратить в цель</button>
                    </>
                  )}
                  {status === 'accepted' && onOpenGoals && (
                    <button type="button" onClick={onOpenGoals}>Открыть цели</button>
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
                  {busyIndex !== null ? 'Сохранение…' : 'Подтвердить создание цели'}
                </button>
                <button type="button" disabled={busyIndex !== null}
                  onClick={() => setEditingGoal(null)}>Отмена</button>
              </form>
            )}
          </section>
        );
      })}
      {error && <p role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {Array.isArray(interaction.unknowns) && interaction.unknowns.length > 0 && (
        <p className="reflect-interaction-unknowns">
          Неизвестно: {interaction.unknowns.join('; ')}
        </p>
      )}
    </div>
  );
}
