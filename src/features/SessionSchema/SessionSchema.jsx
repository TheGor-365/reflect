import React, { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import SessionTable from './SessionTable';
import JourneyMap from './JourneyMap';
import { sessionDisplayTitle } from '../Diary/diaryPresentation';

/**
 * PRODUCT-04: Journey is an evidence projection; the old chronological table
 * remains as a stable, readable fallback for legacy records.
 */
export default function SessionSchema({
  sessions = [], goals = [], onViewContent, selectedSessionId, onOpenSource
}) {
  const [selectedId, setSelectedId] = useState(
    selectedSessionId || sessions[0]?.id || ''
  );
  useEffect(() => {
    if (selectedSessionId && sessions.some(item => item.id === selectedSessionId)) {
      setSelectedId(selectedSessionId);
    }
  }, [selectedSessionId, sessions]);
  const active = sessions.find(item => item.id === selectedId) || sessions[0];

  return (
    <section className="reflect-session-schema" aria-label="Схема сеансов">
      <header className="reflect-session-schema-header">
        <h2><GitBranch size={24} aria-hidden="true" /> Карта пути A → B → Я</h2>
        <p>От сохранённого вопроса — через предложения и ваши решения к
          реальным шагам и наблюдениям. Только события с источниками.</p>
      </header>
      {active ? (
        <>
          <label className="reflect-journey-session-select">
            Тема для просмотра
            <select value={active.id} onChange={event => setSelectedId(event.target.value)}>
              {sessions.map(item => (
                <option key={item.id} value={item.id}>{sessionDisplayTitle(item)}</option>
              ))}
            </select>
          </label>
          <JourneyMap key={active.id} session={active} goals={goals} onOpenSource={onOpenSource}/>
          <section className="reflect-session-schema-group" aria-label={sessionDisplayTitle(active)}>
            <h3>Хронологическая таблица · {sessionDisplayTitle(active)}</h3>
            <SessionTable session={active} goals={goals} onViewContent={onViewContent}/>
          </section>
        </>
      ) : (
        <div className="reflect-session-schema-empty">
          Нет сохранённых сеансов. Создайте первый сеанс в разделе «Сеансы».
        </div>
      )}
    </section>
  );
}
