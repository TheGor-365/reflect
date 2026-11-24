import React, { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import ReflectContentIcon from '../../components/common/ReflectContentIcon';
import SmoothDisclosure from '../../components/common/SmoothDisclosure';
import { buildRecommendationInbox } from '../Recommendations/recommendationInbox';
import { buildDeepGoalDrafts } from './automaticGoalDrafts';
import { recommendationGoalGate } from '../Sessions/recommendationGoalGate';
import { isArchivedRecord, isArchivedRecommendation } from '../Archive/archiveSelectors';

/**
 * Ideas are not user goals. Restore exact source context on request, then
 * navigate to the saved assistant turn for a separate owner decision.
 */
export default function GoalSuggestions({ sessions = [], onOpenSession }) {
  const inbox = useMemo(() => buildRecommendationInbox(sessions), [sessions]);
  const candidates = inbox.recommendations.filter(item =>
    item.status === 'pending' && !isArchivedRecommendation(item));
  const currentSessions = useMemo(() => sessions.filter(s => !isArchivedRecord(s)), [sessions]);
  const currentRecommendations = useMemo(() => inbox.recommendations.filter(item =>
    !isArchivedRecommendation(item)), [inbox]);
  const automaticDrafts = useMemo(() =>
    buildDeepGoalDrafts(currentSessions, currentRecommendations),
    [currentSessions, currentRecommendations]);
  const preparedIds = new Set(automaticDrafts.map(item => item.id));
  const candidateItems = candidates.map(item => {
    const session = currentSessions.find(candidate => candidate.id === item.sessionId);
    const assistant = session?.chatHistory?.find(turn =>
      turn?.role === 'assistant' && turn.id === item.assistantMessageId);
    return {
      ...item,
      gate: recommendationGoalGate({
        interaction: assistant?.interaction,
        assistantMessageId: item.assistantMessageId,
        reviews: session?.hypothesisReviews
      })
    };
  });
  if (!candidateItems.length) return null;
  return (
    <section className="reflect-goal-suggestions"
      aria-labelledby="reflect-goal-suggestions-title">
      <header>
        <ReflectContentIcon kind="recommendation" size={19}/>
        <h3 id="reflect-goal-suggestions-title">Предложения Reflect</h3>
        <span className="reflect-goal-suggestions-count">{candidateItems.length}</span>
      </header>
      <ol>
        {candidateItems.map(item => (
          <li key={item.id}>
            <div className="reflect-goal-suggestion-main">
              <div>
                <strong>{item.title}</strong>
                <small>{item.sessionTitle}</small>
                {preparedIds.has(item.id) && (
                  <small className="reflect-auto-goal-draft">
                    Черновик подготовлен автоматически · нужен ваш выбор
                  </small>
                )}
                {!item.gate.allowed && (
                  <small className="reflect-auto-goal-draft" role="status">
                    Цель пока недоступна: {item.gate.reason}
                  </small>
                )}
              </div>
            </div>
            <SmoothDisclosure label="Вспомнить контекст предложения"
              iconKind="information" className="reflect-goal-suggestion-context">
              <p><ReflectContentIcon kind="session" size={15}/>
                Сеанс: <strong>{item.sessionTitle}</strong></p>
              {item.sourceExcerpt && (
                <blockquote>Вы писали: «{item.sourceExcerpt}
                  {item.sourceExcerpt.length >= 260 ? '…' : ''}»</blockquote>
              )}
              <p><ReflectContentIcon kind="recommendation" size={15}/>
                Почему Reflect предложил это: {item.rationale}</p>
              <small>Это предложение AI, а не созданная вами цель.</small>
            </SmoothDisclosure>
            <button type="button"
              onClick={() => onOpenSession?.(item.sessionId, item.assistantMessageId)}>
              <ReflectContentIcon kind="session" size={15}/>
              {item.gate.allowed
                ? 'Просмотреть и подтвердить'
                : 'Открыть исходный диалог'}
              <ArrowUpRight size={15} aria-hidden="true"/>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
