import React, { useEffect, useRef, useState } from 'react';
import ProtectedDraftControls from '../../components/common/ProtectedDraftControls';
import ReflectSelect from '../../components/ReflectSelect';
import { saveSessionReturn } from './sessionReturn';
import { isArchivedRecord } from '../Archive/archiveSelectors';

const formatDay = value => {
  try {
    const date = value?.toDate?.();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return 'Время не указано';
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
  } catch { return 'Время не указано'; }
};

/** Explicit return, never AI-synthesized or sent to the provider. */
export default function SessionReturnCheckIn({
  session, userId, goals = [], requestedGoalId = null,
  requestId = null, expanded = false
}) {
  const [note, setNote] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [goalId, setGoalId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const pendingVisitId = useRef(null);
  const protectedDraft = useRef(null);
  const consumedRequestRef = useRef(null);
  const ownerContext = `${userId}:${session?.id || ''}`;
  const contextRef = useRef(ownerContext);
  contextRef.current = ownerContext;
  useEffect(() => {
    pendingVisitId.current = null;
    setNote(''); setNextStep(''); setGoalId('');
    setError(''); setNotice('');
  }, [ownerContext]);
  // UI options are only owner-loaded, saved, explicitly accepted goals.
  // The Firestore transaction independently revalidates their provenance.
  const archivedSession = isArchivedRecord(session);
  const decisions = session?.recommendationDecisions || {};
  const acceptedGoals = goals.filter(goal =>
    !isArchivedRecord(goal) && goal?.sessionId === session?.id &&
    goal.sourceType === 'user-accepted-ai-recommendation' &&
    typeof goal.sourceRecommendationKey === 'string' &&
    decisions[goal.sourceRecommendationKey]?.status === 'accepted' &&
    !decisions[goal.sourceRecommendationKey]?.goalRemovedAt &&
    decisions[goal.sourceRecommendationKey]?.goalId === goal.id &&
    decisions[goal.sourceRecommendationKey]?.assistantMessageId === goal.sourceAssistantMessageId
  );
  // The owner may return to a precise goal from the Goals board.
  // Prefill is UI-only; it never saves nor opens a provider request.
  useEffect(() => {
    const key = `${ownerContext}:${requestId}`;
    if (!requestedGoalId || !requestId || consumedRequestRef.current === key) return;
    if (!acceptedGoals.some(goal => goal.id === requestedGoalId)) return;
    consumedRequestRef.current = key;
    setGoalId(requestedGoalId);
    setError('');
  }, [ownerContext, requestId, requestedGoalId, goals, session]);
  if (!session?.id || !userId) return null;
  const chosenGoalId = acceptedGoals.some(goal => goal.id === goalId) ? goalId : '';
  const entries = Array.isArray(session.returnCheckIns)
    ? session.returnCheckIns.filter(entry => entry?.type === 'return-check-in' &&
      entry?.author === 'user' && typeof entry?.text === 'string') : [];
  const submit = async event => {
    event.preventDefault();
    if (!note.trim() || busyRef.current || archivedSession) return;
    if (goalId && !chosenGoalId) {
      setError('Связанная цель недоступна. Выберите актуальную цель.');
      return;
    }
    if (chosenGoalId && !nextStep.trim()) {
      setError('Для связанной цели укажите собственный следующий шаг.');
      return;
    }
    const before = ownerContext;
    pendingVisitId.current ||= crypto.randomUUID();
    const visitId = pendingVisitId.current;
    busyRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      await saveSessionReturn({
        userId, sessionId: session.id, visitId, note,
        goalId: chosenGoalId || null, nextStep
      });
      if (contextRef.current !== before) return;
      setNote(''); setNextStep(''); setGoalId('');
      pendingVisitId.current = null;
      await protectedDraft.current?.clearAfterCommit();
      setNotice('Наблюдение записано. Оно не отправлялось Grok.');
    } catch (failure) {
      if (contextRef.current === before) {
        setError(failure?.message || 'Не удалось записать наблюдение. Текст сохранён.');
      }
      // Keep both the exact text and visit ID for an explicit safe retry.
    } finally {
      busyRef.current = false;
      if (contextRef.current === before) setBusy(false);
    }
  };
  return (
    <section className="reflect-session-return" aria-label="Возвращение к теме">
      <details open={expanded}>
        <summary>Вернуться к теме и записать, что изменилось</summary>
        <p className="reflect-session-return-disclosure">
          Это ваша отдельная запись о результате или наблюдении. Она остаётся
          в сеансе и не передаётся AI автоматически. Ничего не считается выполненным без вашей отметки.
        </p>
        {archivedSession && <p role="status">Сеанс в архиве · только просмотр ранее сохранённых наблюдений</p>}
        {!archivedSession && <form onSubmit={submit}>
          {acceptedGoals.length > 0 && (
            <ReflectSelect
              label="Связать наблюдение с принятой целью (необязательно)"
              ariaLabel="Связать наблюдение с принятой целью"
              value={chosenGoalId}
              options={[
                ['', 'Без привязки к цели'],
                ...acceptedGoals.map(goal => [
                  goal.id, goal.text || 'Цель без названия'
                ])
              ]}
              disabled={busy}
              onChange={value => {
                setGoalId(value);
                pendingVisitId.current = null;
                setError(''); setNotice('');
              }}/>
          )}
          <label>Что изменилось с прошлого раза?
            <textarea rows={3} maxLength={1200} value={note} disabled={busy}
              placeholder="Например: прочитал два вечера по 20 минут, один день пропустил…"
              onChange={event => {
                setNote(event.target.value);
                pendingVisitId.current = null;
                setError(''); setNotice('');
              }}/>
          </label>
          <label>Мой следующий шаг {chosenGoalId ? '(обязательно для связанной цели)' : '(необязательно)'}
            <input type="text" maxLength={240} value={nextStep}
              placeholder="Один ближайший шаг, который выберу сам"
              disabled={busy}
              onChange={event => {
                setNextStep(event.target.value);
                pendingVisitId.current = null;
                setError(''); setNotice('');
              }}/>
          </label>
          <p className="reflect-session-return-disclosure">
            Результат записывается по вашим словам. Это не доказательство
            выполнения цели: её статус и подзадачи остаются без изменений.
          </p>
          <button type="submit" disabled={busy || !note.trim() ||
            (chosenGoalId && !nextStep.trim()) || (goalId && !chosenGoalId)}>
            {busy ? 'Записываем…' : 'Сохранить наблюдение'}
          </button>
          <ProtectedDraftControls compact ref={protectedDraft} userId={userId}
            surface={`session-return-${session.id}`}
            value={{ text: note, nextStep, goalId }}
            onRestore={draft => {
              setNote(typeof draft?.text === 'string' ? draft.text : '');
              setNextStep(typeof draft?.nextStep === 'string' ? draft.nextStep : '');
              setGoalId(typeof draft?.goalId === 'string' ? draft.goalId : '');
            }}/>
        </form>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {entries.length > 0 && (
          <div className="reflect-session-return-history">
            <strong>Подтверждённые записи ({entries.length})</strong>
            {entries.map(entry => (
              <article key={entry.id} className="reflect-session-return-entry">
                <small>Ваше наблюдение · время устройства: {formatDay(entry.recordedAtClient)}</small>
                <p>{entry.text}</p>
                {entry.goalId && (
                  <small>Связана с целью: {
                    goals.find(goal => goal.id === entry.goalId && goal.sessionId === session.id)?.text
                    || 'Цель удалена или недоступна'
                  }</small>
                )}
                {typeof entry.nextStep === 'string' && entry.nextStep.trim() && (
                  <p><strong>Ваш следующий шаг:</strong> {entry.nextStep}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}
