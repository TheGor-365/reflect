import React, { useMemo } from 'react';
import { Lightbulb, MessageCircleQuestion, Target, ArrowUpRight } from 'lucide-react';
import { buildRecommendationInbox } from './recommendationInbox';

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

export default function Recommendations({ sessions = [], onOpenSession, onOpenGoals }) {
  const inbox = useMemo(() => buildRecommendationInbox(sessions), [sessions]);
  const pending = inbox.recommendations.filter(item => item.status === 'pending');
  const decided = inbox.recommendations.filter(item => item.status !== 'pending');
  return (
    <section className="reflect-recommendation-inbox" aria-label="Рекомендации Reflect">
      <header className="reflect-inbox-header">
        <div>
          <p className="reflect-inbox-eyebrow">От разговора к действию</p>
          <h2>Рекомендации</h2>
          <p>Предложения Reflect и важные уточнения из сохранённых бесед.
            Они не становятся целями и фактами без вашего подтверждения.</p>
        </div>
        <div className="reflect-inbox-counters" aria-label="Статистика рекомендаций">
          <span><strong>{pending.length}</strong> ожидают решения</span>
          <span><strong>{inbox.clarifications.length}</strong> требуют уточнения</span>
        </div>
      </header>

      {!inbox.pendingCount && !decided.length ? (
        <div className="reflect-inbox-empty">
          <Lightbulb size={25} aria-hidden="true" />
          <h3>Пока нет структурированных рекомендаций</h3>
          <p>После ответа AI с подтверждённым контрактом interaction.v1 здесь автоматически
            появятся предложения и вопросы. Старые обычные ответы и тестовые записи
            не превращаются в выдуманные рекомендации.</p>
        </div>
      ) : (
        <>
          {inbox.clarifications.length > 0 && (
            <section className="reflect-inbox-group" aria-labelledby="reflect-inbox-clarify">
              <h3 id="reflect-inbox-clarify"><MessageCircleQuestion size={20} aria-hidden="true" />
                Сначала уточнить</h3>
              <p className="reflect-inbox-description">По этим темам Reflect ещё не получил
                достаточно оснований рекомендовать действие.</p>
              <ol className="reflect-inbox-list">
                {inbox.clarifications.map(item => (
                  <li key={item.id} className="reflect-inbox-card reflect-inbox-card--clarify">
                    <span className="reflect-inbox-state">Нужно уточнение</span>
                    <p className="reflect-inbox-question">{item.question}</p>
                    {item.unknowns.length > 0 && <small>Что неизвестно: {item.unknowns.join('; ')}</small>}
                    <div className="reflect-inbox-footer">
                      <small>{item.sessionTitle}</small>
                      <SourceButton item={item} onOpenSession={onOpenSession}>Ответить в сеансе</SourceButton>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {pending.length > 0 && (
            <section className="reflect-inbox-group" aria-labelledby="reflect-inbox-pending">
              <h3 id="reflect-inbox-pending"><Lightbulb size={20} aria-hidden="true" />
                Предложения к рассмотрению</h3>
              <p className="reflect-inbox-description">
                Сначала показаны решения без ответа, затем более свежие.
                Это порядок работы, а не автоматическая оценка важности проблемы.
              </p>
              <ol className="reflect-inbox-list">
                {pending.map(item => (
                  <li key={item.id} className="reflect-inbox-card">
                    <span className="reflect-inbox-state">{statusText[item.status]}</span>
                    <h4>{item.title}</h4>
                    <p>{item.rationale}</p>
                    <small>Обосновано только сообщением в указанном сеансе;
                      предложение требует вашего решения.</small>
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
              <h3 id="reflect-inbox-decided"><Target size={20} aria-hidden="true" />
                Принятые решения и история</h3>
              <ol className="reflect-inbox-list">
                {decided.map(item => (
                  <li key={item.id} className="reflect-inbox-card reflect-inbox-card--decided">
                    <span className="reflect-inbox-state">{statusText[item.status]}</span>
                    <h4>{item.title}</h4>
                    <div className="reflect-inbox-footer">
                      <small>{item.sessionTitle}</small>
                      <SourceButton item={item} onOpenSession={onOpenSession} />
                      {item.status === 'accepted' && onOpenGoals &&
                        <button type="button" className="reflect-inbox-source" onClick={onOpenGoals}>
                          Открыть цели <ArrowUpRight size={15} aria-hidden="true" />
                        </button>}
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
