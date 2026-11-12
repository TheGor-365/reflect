import React, { useState } from 'react';
import { GitBranch, List } from 'lucide-react';
import SessionTable from './SessionTable';
import JourneyMap from './JourneyMap';
import { sessionDisplayTitle } from '../Diary/diaryPresentation';

/**
 * The map and legacy chronology are different read-only views of existing
 * owner-scoped session/goal records. Neither view writes data or calls AI.
 */
export default function SessionSchema({
  sessions = [], goals = [], onViewContent, selectedSessionId,
  onOpenSource
}) {
  const [view,setView]=useState('map');
  const sorted=[...sessions].sort((a,b)=>
    Number(b.id===selectedSessionId)-Number(a.id===selectedSessionId));
  return (
    <section className="reflect-session-schema" aria-label="Схема сеансов">
      <header className="reflect-session-schema-header">
        <h2><GitBranch size={24} aria-hidden="true"/> Схема сеансов</h2>
        <p>Карта связанных событий и детальная хронология ваших сохранённых сеансов.</p>
        {sessions.length>0&&(
          <div className="reflect-journey-view-switch" role="group"
            aria-label="Представление схемы сеансов">
            <button type="button" aria-pressed={view==='map'}
              onClick={()=>setView('map')}>
              <GitBranch size={16} aria-hidden="true"/> Карта пути
            </button>
            <button type="button" aria-pressed={view==='chronology'}
              onClick={()=>setView('chronology')}>
              <List size={16} aria-hidden="true"/> Хронология
            </button>
          </div>
        )}
      </header>
      {sessions.length===0?(
        <div className="reflect-session-schema-empty">
          Нет сохранённых сеансов. Создайте первый сеанс в разделе «Сеансы».
        </div>
      ):view==='map'?(
        <JourneyMap sessions={sessions} goals={goals}
          selectedSessionId={selectedSessionId} onOpenSource={onOpenSource}/>
      ):sorted.map(session=>(
        <section key={session.id} className="reflect-session-schema-group"
          aria-label={sessionDisplayTitle(session)}>
          <h3>{sessionDisplayTitle(session)}</h3>
          <SessionTable session={session} goals={goals} onViewContent={onViewContent}/>
        </section>
      ))}
    </section>
  );
}
