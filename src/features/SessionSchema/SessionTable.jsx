import React, { useMemo } from 'react';

const dateFrom = value => {
  try {
    const raw = value instanceof Date ? value
      : typeof value?.toDate === 'function' ? value.toDate()
        : typeof value === 'string' ? new Date(value)
          : Number.isFinite(value?.seconds) ? new Date(value.seconds * 1000) : null;
    return raw instanceof Date && Number.isFinite(raw.getTime()) ? raw : null;
  } catch {
    return null;
  }
};

const formatEventDate = timestamp => {
  const date = dateFrom(timestamp);
  return date ? new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(date) : 'Дата не указана';
};

/** Defensive, stable ordering: legacy events with missing dates stay visible last. */
export const buildSessionChronology = (session, goals = []) => {
  const events = [];
  const add = (timestamp, type, content, role) => {
    events.push({ timestamp, type, content, role, order: events.length });
  };
  (Array.isArray(session?.chatHistory) ? session.chatHistory : []).forEach(msg => {
    if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) return;
    add(msg.timestamp, msg.role === 'user' ? 'Вопрос' : 'Ответ',
      typeof msg.content === 'string' ? msg.content : '', msg.role);
  });
  // A decision is a user-confirmed fact; an AI candidate alone is not.
  // Project from the same saved session record rather than fabricating a
  // secondary analytic event store.
  const decisionLabels = {
    saved: 'Идея сохранена', postponed: 'Идея отложена',
    dismissed: 'Идея отклонена', accepted: 'Решение принято'
  };
  const decisions = session?.recommendationDecisions;
  if (decisions && typeof decisions === 'object' && !Array.isArray(decisions)) {
    Object.values(decisions).forEach(decision => {
      if (!decisionLabels[decision?.status] || typeof decision?.title !== 'string') return;
      add(decision.decidedAt, decisionLabels[decision.status],
        decision.title, 'decision');
    });
  }
  (Array.isArray(goals) ? goals : []).filter(goal => goal?.sessionId === session?.id)
    .forEach(goal => {
      add(goal.createdAt, 'Цель', 'Поставлена цель: ' + (goal.text || ''), 'goal');
      const reflections = Array.isArray(goal.reflections) ? goal.reflections : [];
      reflections.forEach(ref => {
        add(ref?.createdAt, 'Проработка', ref?.text || '', 'reflection');
      });
      if (goal.completed) {
        const lastReflection = reflections[reflections.length - 1];
        const completionTime = goal.checklistFeedback?.createdAt ||
          lastReflection?.createdAt || goal.dueDate;
        if (completionTime) add(completionTime, 'Цель выполнена',
          'Завершена цель: ' + (goal.text || ''), 'completed');
      }
    });
  return events.sort((a, b) => {
    const at = dateFrom(a.timestamp)?.getTime();
    const bt = dateFrom(b.timestamp)?.getTime();
    if (at === undefined && bt === undefined) return a.order - b.order;
    if (at === undefined) return 1;
    if (bt === undefined) return -1;
    return at - bt || a.order - b.order;
  });
};

const SessionTable = React.memo(({ session, goals, onViewContent }) => {
  const events = useMemo(() => buildSessionChronology(session, goals), [session, goals]);
  const renderContent = content => {
    const text = typeof content === 'string' ? content : '';
    if (text.length <= 150 || typeof onViewContent !== 'function') {
      return <p className="reflect-session-event-content">{text || '—'}</p>;
    }
    return (
      <div className="reflect-session-event-content">
        <span>{text.slice(0, 150)}…</span>{' '}
        <button type="button" className="reflect-session-event-more"
          onClick={() => onViewContent(text)}>Читать далее</button>
      </div>
    );
  };

  return (
    <div className="reflect-session-event-panel">
      <h4>Хронология сеанса</h4>
      {events.length === 0 ? (
        <p className="reflect-session-event-empty">Пока нет событий сессии.</p>
      ) : (
        <div className="reflect-session-event-scroll" role="region"
          aria-label="Прокручиваемая хронология сеанса" tabIndex={0}>
          <table className="reflect-session-event-table">
            <thead><tr>
              <th scope="col">Время</th>
              <th scope="col">Тип</th>
              <th scope="col">Содержание</th>
            </tr></thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={index}>
                  <td className="reflect-session-event-date">{formatEventDate(event.timestamp)}</td>
                  <td><span className="reflect-session-event-pill" data-role={event.role}>
                    {event.type}
                  </span></td>
                  <td>{renderContent(event.content)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

export default SessionTable;
