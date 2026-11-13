import React, { useMemo } from 'react';
import { Lightbulb, ArrowUpRight } from 'lucide-react';
import { buildRecommendationInbox } from '../Recommendations/recommendationInbox';

/**
 * A recommendation is NOT a created goal. The user must review and explicitly
 * confirm it in the saved source conversation before a goal document exists.
 */
export default function GoalSuggestions({ sessions = [], onOpenSession }) {
  const inbox = useMemo(() => buildRecommendationInbox(sessions), [sessions]);
  const candidates = inbox.recommendations.filter(item => item.status === 'pending');
  if (!candidates.length) return null;
  return (
    <section className="reflect-goal-suggestions" aria-labelledby="reflect-goal-suggestions-title">
      <header>
        <Lightbulb size={19} aria-hidden="true"/>
        <h3 id="reflect-goal-suggestions-title">Можно превратить в цель</h3>
        <span className="reflect-goal-suggestions-count">{candidates.length}</span>
      </header>
      <p>Это предложения Reflect из сохранённых разговоров.
        Они пока не являются вашими целями и не влияют на прогресс.</p>
      <ol>
        {candidates.map(item => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <small>{item.sessionTitle}</small>
            <button type="button"
              onClick={() => onOpenSession?.(item.sessionId, item.assistantMessageId)}>
              Просмотреть и подтвердить <ArrowUpRight size={15} aria-hidden="true"/>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
