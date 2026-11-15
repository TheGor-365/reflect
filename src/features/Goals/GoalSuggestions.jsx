import React, { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import ReflectContentIcon from '../../components/common/ReflectContentIcon';
import SmoothDisclosure from '../../components/common/SmoothDisclosure';
import { buildRecommendationInbox } from '../Recommendations/recommendationInbox';

/**
 * Ideas are not user goals. Restore exact source context on request, then
 * navigate to the saved assistant turn for a separate owner decision.
 */
export default function GoalSuggestions({ sessions = [], onOpenSession }) {
  const inbox = useMemo(() => buildRecommendationInbox(sessions), [sessions]);
  const candidates = inbox.recommendations.filter(item => item.status === 'pending');
  if (!candidates.length) return null;
  return (
    <section className="reflect-goal-suggestions"
      aria-labelledby="reflect-goal-suggestions-title">
      <header>
        <ReflectContentIcon kind="recommendation" size={19}/>
        <h3 id="reflect-goal-suggestions-title">Можно превратить в цель</h3>
        <span className="reflect-goal-suggestions-count">{candidates.length}</span>
      </header>
      <ol>
        {candidates.map(item => (
          <li key={item.id}>
            <div className="reflect-goal-suggestion-main">
              <ReflectContentIcon kind="recommendation" size={18}/>
              <div>
                <strong>{item.title}</strong>
                <small>{item.sessionTitle}</small>
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
              Просмотреть и подтвердить
              <ArrowUpRight size={15} aria-hidden="true"/>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
