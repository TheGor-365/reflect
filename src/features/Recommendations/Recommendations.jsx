import React, { useMemo, useRef, useState } from 'react';
import ArchiveAction from '../Archive/ArchiveAction';
import { isArchivedRecommendation } from '../Archive/archiveSelectors';
import { ArrowUpRight, Lightbulb, MessageCircleQuestion } from 'lucide-react';
import SmoothDisclosure from '../../components/common/SmoothDisclosure';
import ReflectContentIcon from '../../components/common/ReflectContentIcon';
import { buildRecommendationInbox } from './recommendationInbox';
import { applyRecommendationDecision } from '../Sessions/recommendationDecisions';
import { recommendationGoalGate } from '../Sessions/recommendationGoalGate';

const statusText = {
  pending: 'Ожидает вашего решения',
  saved: 'Идея сохранена',
  postponed: 'Отложено вами',
  dismissed: 'Отклонено вами',
  accepted: 'Стало подтверждённой целью'
};
function SourceButton({ item, onOpenSession, children }) {
  return <button type="button" className="reflect-inbox-source"
    onClick={() => onOpenSession?.(item.sessionId, item.assistantMessageId)}>
    {children || 'К исходному диалогу'} <ArrowUpRight size={15} aria-hidden="true" />
  </button>;
}
function SourceContext({ item }) {
  return (
    <SmoothDisclosure className="reflect-inbox-context"
      label="Источник и контекст" iconKind="session">
      <p><ReflectContentIcon kind="session" size={15}/>
        Сеанс: <strong>{item.sessionTitle}</strong></p>
      {item.sourceExcerpt ? (
        <blockquote>Ваше сообщение: «{item.sourceExcerpt}
          {item.sourceExcerpt.length >= 260 ? '…' : ''}»</blockquote>
      ) : <p>Исходное сообщение доступно в сохранённом сеансе.</p>}
    </SmoothDisclosure>
  );
}
/**
 * One owner-scoped decision path for inbox actions, including confirmed goals.
 * The authoritative goal gate and transaction remain shared with Sessions.
 * No optimistic persistence and no implicit retry after ambiguous writes.
 */
function RecommendationDecisionControls({ item, session, userId, onNewGoalId, onOpenGoals }) {
  const lock = useRef(false);
  const pendingGoalId = useRef(null);
  const [busy, setBusy] = useState(false);
  const [savedAction, setSavedAction] = useState(null);
  const [confirmedGoalId, setConfirmedGoalId] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(() => ({
    title: item.title, purpose: '', step: '', dueDay: '', criteria: ''
  }));
  const [error, setError] = useState('');
  const message = session?.chatHistory?.find(turn =>
    turn?.id === item.assistantMessageId && turn.role === 'assistant');
  const gate = recommendationGoalGate({
    interaction: message?.interaction,
    assistantMessageId: item.assistantMessageId,
    reviews: session?.hypothesisReviews
  });
  const canCreateGoal = Boolean(userId && typeof onNewGoalId === 'function' && gate.allowed);
  const confirmation = {
    saved: 'Идея сохранена', postponed: 'Идея отложена',
    dismissed: 'Идея отклонена', goal: 'Цель подтверждена и связана с сеансом'
  };
  const decide = async (action, draft = null) => {
    if (!userId || lock.current || savedAction ||
        (action === 'goal' && !canCreateGoal)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      let goalId;
      if (action === 'goal') {
        if (!draft?.title?.trim() || !draft?.step?.trim() || !draft?.criteria?.trim()) return;
        // A retry reuses the original document ID after an ambiguous outcome.
        pendingGoalId.current ||= onNewGoalId();
        goalId = pendingGoalId.current;
      }
      const result = await applyRecommendationDecision({
        userId, sessionId: item.sessionId,
        assistantMessageId: item.assistantMessageId,
        candidateIndex: item.index, action,
        ...(action === 'goal' ? {
          goalId, goalTitle: draft.title.trim(),
          goalPurpose: draft.purpose.trim(), goalStep: draft.step.trim(),
          goalDueDay: draft.dueDay, goalCriteria: draft.criteria.trim()
        } : {})
      });
      if (action === 'goal') {
        if (result?.status !== 'accepted' ||
            typeof result.goalId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(result.goalId)) {
          throw new Error('goal-not-confirmed');
        }
        setConfirmedGoalId(result.goalId);
        setEditingGoal(false);
      }
      setSavedAction(action);
    } catch {
      setError(action === 'goal'
        ? 'Создание цели не подтверждено. Черновик сохранён здесь. Проверьте связь и повторите вручную.'
        : 'Решение не сохранено. Проверьте соединение и повторите.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const isPending = item.status === 'pending';
  const isSaved = item.status === 'saved';
  const isPostponed = item.status === 'postponed';
  return (
    <div className="reflect-inbox-decision-controls"
      role="group" aria-label={`Решение по рекомендации: ${item.title}`}
      aria-busy={busy}>
      {savedAction ? (
        <>
          <p className="reflect-inbox-decision-notice" role="status">
            {confirmation[savedAction]}. Обновляем список…
          </p>
          {savedAction === 'goal' && confirmedGoalId && onOpenGoals && (
            <button type="button" onClick={() => onOpenGoals(confirmedGoalId)}>
              Открыть цели
            </button>
          )}
        </>
      ) : (
        <>
          {(isPending || isPostponed) && (
            <button type="button" disabled={busy || !userId}
              onClick={() => void decide('saved')}>Сохранить идею</button>
          )}
          {(isPending || isSaved) && (
            <button type="button" disabled={busy || !userId}
              onClick={() => void decide('postponed')}>Отложить</button>
          )}
          {(isPending || isSaved || isPostponed) && (
            <button type="button" disabled={busy || !userId}
              onClick={() => void decide('dismissed')}>Не подходит</button>
          )}
          <button type="button"
            disabled={busy || !canCreateGoal || !['pending', 'saved', 'postponed'].includes(item.status)}
            aria-expanded={editingGoal}
            onClick={() => { setEditingGoal(value => !value); setError(''); }}>
            Превратить в цель
          </button>
          {!gate.allowed && (
            <p className="reflect-inbox-goal-gate" role="status">
              Создание цели пока недоступно: {gate.reason}
            </p>
          )}
          {editingGoal && canCreateGoal && (
            <form className="reflect-interaction-goal-form reflect-inbox-goal-form"
              onSubmit={event => { event.preventDefault(); void decide('goal', goalDraft); }}>
              <p>Цель появится только после подтверждения. Нужны конкретный первый шаг и проверяемый критерий.</p>
              <label>Название цели
                <input required maxLength={240} disabled={busy}
                  value={goalDraft.title}
                  onChange={event => setGoalDraft(previous => ({ ...previous, title: event.target.value }))}/>
              </label>
              <label>Зачем это нужно? (необязательно)
                <textarea maxLength={1000} rows={2} disabled={busy}
                  value={goalDraft.purpose}
                  onChange={event => setGoalDraft(previous => ({ ...previous, purpose: event.target.value }))}/>
              </label>
              <label>Первый проверяемый шаг
                <input required maxLength={240} disabled={busy}
                  value={goalDraft.step}
                  onChange={event => setGoalDraft(previous => ({ ...previous, step: event.target.value }))}/>
              </label>
              <label>Срок (необязательно)
                <input type="date" disabled={busy} value={goalDraft.dueDay}
                  onChange={event => setGoalDraft(previous => ({ ...previous, dueDay: event.target.value }))}/>
              </label>
              <label>Как я пойму, что цель достигнута?
                <textarea required maxLength={500} rows={2} disabled={busy}
                  value={goalDraft.criteria}
                  onChange={event => setGoalDraft(previous => ({ ...previous, criteria: event.target.value }))}/>
              </label>
              <button type="submit" disabled={busy || !goalDraft.title.trim() ||
                  !goalDraft.step.trim() || !goalDraft.criteria.trim()}>
                {busy ? 'Создаём…' : 'Подтвердить создание цели'}
              </button>
              <button type="button" disabled={busy}
                onClick={() => { setEditingGoal(false); setError(''); }}>Отмена</button>
            </form>
          )}
        </>
      )}
      {busy && <span role="status">Сохраняем решение…</span>}
      {error && <p role="alert" className="reflect-inbox-decision-error">{error}</p>}
    </div>
  );
}

export default function Recommendations({
  sessions = [], userId, onOpenSession, onOpenGoals, onNewGoalId, onSetArchived
}) {
  const inbox = useMemo(() => buildRecommendationInbox(sessions), [sessions]);
  const [archiveView, setArchiveView] = useState(false);
  const shown = inbox.recommendations.filter(item => isArchivedRecommendation(item) === archiveView);
  const pending = shown.filter(item => item.status === 'pending');
  const decided = shown.filter(item => item.status !== 'pending');
  const archivedCount = inbox.recommendations.filter(isArchivedRecommendation).length;
  const activeClarifications = inbox.clarifications.filter(item => !item.sourceSessionArchived);
  return (
    <section className="reflect-recommendation-inbox" aria-label="Рекомендации Reflect">
      <header className="reflect-inbox-header">
        <div>
          <h2><ReflectContentIcon kind="recommendation" size={24}/> Рекомендации</h2>
        </div>
        <div className="reflect-inbox-counters" aria-label="Статистика рекомендаций">
          <span><strong>{pending.length}</strong> ожидают решения</span>
          <span><strong>{activeClarifications.length}</strong> уточнений</span>
        </div>
      </header>
      <div className="reflect-archive-view-switch" role="group" aria-label="Просмотр архива рекомендаций">
        <button type="button" aria-pressed={!archiveView}
          onClick={() => setArchiveView(false)}>Текущие рекомендации</button>
        <button type="button" aria-pressed={archiveView}
          aria-label="Архив рекомендаций"
          onClick={() => setArchiveView(true)}>Архив ({archivedCount})</button>
      </div>
      <SmoothDisclosure label="О рекомендациях и порядке отображения"
        iconKind="information" className="reflect-inbox-guidance">
        <p>Здесь отображаются предложения и уточнения из сохранённых сеансов.
          Предложения не становятся фактами или целями без вашего решения.</p>
        <p>Сначала идут предложения без решения, затем более свежие.
          Это сортировка, а не оценка важности темы.</p>
      </SmoothDisclosure>
      {!pending.length && !decided.length &&
        !(activeClarifications.length && !archiveView) ? (
        <div className="reflect-inbox-empty">
          <Lightbulb size={25} aria-hidden="true" />
          <h3>{archiveView ? 'Архив рекомендаций пуст' : 'Пока нет рекомендаций'}</h3>
          <p>Появятся после сохранённого структурированного ответа Reflect.
            Старые сообщения не преобразуются в предложения автоматически.</p>
        </div>
      ) : (
        <>
          {!archiveView && activeClarifications.length > 0 && (
            <section className="reflect-inbox-group" aria-labelledby="reflect-inbox-clarify">
              <h3 id="reflect-inbox-clarify"><MessageCircleQuestion size={20} aria-hidden="true" />
                Уточнить</h3>
              <ol className="reflect-inbox-list">
                {activeClarifications.map(item => (
                  <li key={item.id} className="reflect-inbox-card reflect-inbox-card--clarify">
                    <span className="reflect-inbox-state">
                      <MessageCircleQuestion size={16} aria-hidden="true"/>
                      Нужно уточнение
                    </span>
                    <p className="reflect-inbox-question">{item.question}</p>
                    <SourceContext item={item}/>
                    <div className="reflect-inbox-footer">
                      <small>{item.sessionTitle}</small>
                      <SourceButton item={item} onOpenSession={onOpenSession}>
                        Ответить в сеансе
                      </SourceButton>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {pending.length > 0 && (
            <section className="reflect-inbox-group" aria-labelledby="reflect-inbox-pending">
              <h3 id="reflect-inbox-pending"><Lightbulb size={20} aria-hidden="true" />
                К рассмотрению</h3>
              <ol className="reflect-inbox-list">
                {pending.map(item => (
                  <li key={item.id} className="reflect-inbox-card">
                    <span className="reflect-inbox-state">
                      {statusText[item.status]}
                    </span>
                    <h4>{item.title}</h4>
                    <p>{item.rationale}</p>
                    <SourceContext item={item}/>
                    {onSetArchived && !item.sourceSessionArchived && <ArchiveAction archived={archiveView}
                      subject={`рекомендация «${item.title}»`}
                      onCommit={next => onSetArchived(item, next)}/>}
                    {item.sourceSessionArchived && <p role="status">Исходный сеанс в архиве. Для решения или изменения архива рекомендации сначала восстановите сеанс.</p>}
                    {!archiveView && <RecommendationDecisionControls item={item} userId={userId}
                      session={sessions.find(source => source.id === item.sessionId)}
                      onNewGoalId={onNewGoalId} onOpenGoals={onOpenGoals}/>}
                    <div className="reflect-inbox-footer">
                      <small>{item.sessionTitle}</small>
                      <SourceButton item={item} onOpenSession={onOpenSession}>
                        Обсудить или принять
                      </SourceButton>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {decided.length > 0 && (
            <section className="reflect-inbox-group" aria-labelledby="reflect-inbox-decided">
              <h3 id="reflect-inbox-decided">
                <ReflectContentIcon kind="recommendation" size={20}/>
                История решений
              </h3>
              <ol className="reflect-inbox-list">
                {decided.map(item => (
                  <li key={item.id} className="reflect-inbox-card reflect-inbox-card--decided">
                    <span className="reflect-inbox-state">
                      <ReflectContentIcon kind="recommendation" size={16}/>
                      {statusText[item.status]}
                    </span>
                    <h4>{item.title}</h4>
                    <SourceContext item={item}/>
                    {onSetArchived && !item.sourceSessionArchived && <ArchiveAction archived={archiveView}
                      subject={`рекомендация «${item.title}»`}
                      onCommit={next => onSetArchived(item, next)}/>}
                    {item.sourceSessionArchived && <p role="status">Исходный сеанс в архиве. Для решения или изменения архива рекомендации сначала восстановите сеанс.</p>}
                    {!archiveView && ['saved', 'postponed'].includes(item.status) && (
                      <RecommendationDecisionControls item={item} userId={userId}
                        session={sessions.find(source => source.id === item.sessionId)}
                        onNewGoalId={onNewGoalId} onOpenGoals={onOpenGoals}/>
                    )}
                    <div className="reflect-inbox-footer">
                      <small>{item.sessionTitle}</small>
                      <SourceButton item={item} onOpenSession={onOpenSession}/>
                      {item.status === 'accepted' && onOpenGoals && (
                        <button type="button" className="reflect-inbox-source"
                          onClick={onOpenGoals}>
                          <ReflectContentIcon kind="goal" size={15}/>
                          Открыть цели <ArrowUpRight size={15} aria-hidden="true"/>
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </section>
  );
}
