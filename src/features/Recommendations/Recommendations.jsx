import React, { useMemo } from 'react';
import { ArrowUpRight, Lightbulb, MessageCircleQuestion } from 'lucide-react';
import SmoothDisclosure from '../../components/common/SmoothDisclosure';
import ReflectContentIcon from '../../components/common/ReflectContentIcon';
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
      <p>Предложение сформулировано Reflect. Оно не является подтверждённой
        причиной и не создаёт цель без вашего решения.</p>
    </SmoothDisclosure>
  );
}
export default function Recommendations({
  sessions = [], onOpenSession, onOpenGoals
}) {
  const inbox = useMemo(() => buildRecommendationInbox(sessions), [sessions]);
  const pending = inbox.recommendations.filter(item => item.status === 'pending');
  const decided = inbox.recommendations.filter(item => item.status !== 'pending');
  return (
    <section className="reflect-recommendation-inbox" aria-label="Рекомендации Reflect">
      <header className="reflect-inbox-header">
        <div>
          <h2><ReflectContentIcon kind="recommendation" size={24}/> Рекомендации</h2>
        </div>
        <div className="reflect-inbox-counters" aria-label="Статистика рекомендаций">
          <span><strong>{pending.length}</strong> ожидают решения</span>
          <span><strong>{inbox.clarifications.length}</strong> уточнений</span>
        </div>
      </header>
      <SmoothDisclosure label="О рекомендациях и порядке отображения"
        iconKind="information" className="reflect-inbox-guidance">
        <p>Здесь отображаются предложения и уточнения из сохранённых сеансов.
          Предложения не становятся фактами или целями без вашего решения.</p>
        <p>Сначала идут предложения без решения, затем более свежие.
          Это сортировка, а не оценка важности темы.</p>
      </SmoothDisclosure>
      {!inbox.pendingCount && !decided.length ? (
        <div className="reflect-inbox-empty">
          <Lightbulb size={25} aria-hidden="true" />
          <h3>Пока нет рекомендаций</h3>
          <p>Появятся после сохранённого структурированного ответа Reflect.
            Старые сообщения не преобразуются в предложения автоматически.</p>
        </div>
      ) : (
        <>
          {inbox.clarifications.length > 0 && (
            <section className="reflect-inbox-group" aria-labelledby="reflect-inbox-clarify">
              <h3 id="reflect-inbox-clarify"><MessageCircleQuestion size={20} aria-hidden="true" />
                Уточнить</h3>
              <ol className="reflect-inbox-list">
                {inbox.clarifications.map(item => (
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
                      <ReflectContentIcon kind="recommendation" size={16}/>
                      {statusText[item.status]}
                    </span>
                    <h4>{item.title}</h4>
                    <p>{item.rationale}</p>
                    <SourceContext item={item}/>
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
