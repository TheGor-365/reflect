import React, { useEffect, useState } from 'react';
import { GitBranch, List } from 'lucide-react';
import SessionTable from './SessionTable';
import JourneyMap from './JourneyMap';
import { sessionDisplayTitle } from '../Diary/diaryPresentation';
import { isArchivedRecord } from '../Archive/archiveSelectors';

/**
 * The map and legacy chronology are different read-only views of existing
 * owner-scoped session/goal records. Neither view writes data or calls AI.
 */
export default function SessionSchema({
  sessions = [], goals = [], onViewContent, selectedSessionId,
  onOpenSource
}) {
  const [view,setView]=useState('map');
  // null = honor an exact archived source request; explicit toggle overrides it.
  const [archivePreference,setArchivePreference]=useState(null);
  useEffect(()=>setArchivePreference(null),[selectedSessionId]);
  const selectedArchive = sessions.some(session =>
    session.id === selectedSessionId && isArchivedRecord(session));
  const showArchived = archivePreference ?? selectedArchive;
  const visibleSessions = showArchived ? sessions : sessions.filter(session => !isArchivedRecord(session));
  const visibleGoals = showArchived ? goals : goals.filter(goal => !isArchivedRecord(goal));
  const selectedVisibleId = visibleSessions.some(session=>session.id===selectedSessionId)
    ? selectedSessionId : null;
  const sorted=[...visibleSessions].sort((a,b)=>
    Number(b.id===selectedVisibleId)-Number(a.id===selectedVisibleId));
  return (
    <section className="reflect-session-schema" aria-label="Схема сеансов">
      <header className="reflect-session-schema-header">
        <h2><GitBranch size={24} aria-hidden="true"/> Схема сеансов</h2>
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
      {sessions.some(isArchivedRecord) && (
        <div className="reflect-archive-view-switch" role="group" aria-label="Просмотр архива карты">
          <button type="button" aria-pressed={!showArchived}
            onClick={()=>setArchivePreference(false)}>Текущие сеансы</button>
          <button type="button" aria-pressed={showArchived}
            onClick={()=>setArchivePreference(true)}>С архивом</button>
        </div>
      )}
      {showArchived && selectedArchive && <p role="status">
        Архивный сеанс · история доступна только для чтения
      </p>}
      {visibleSessions.length===0?(
        <div className="reflect-session-schema-empty" role="status">
          {sessions.length===0
            ? 'Нет сохранённых сеансов. Создайте первый сеанс в разделе «Сеансы».'
            : 'Нет текущих сеансов. Сохранённая история доступна в архиве.'}
        </div>
      ):view==='map'?(
        <JourneyMap sessions={visibleSessions} goals={visibleGoals}
          selectedSessionId={selectedVisibleId} includeArchived={showArchived}
          onOpenSource={onOpenSource}/>
      ):sorted.map(session=>(
        <section key={session.id} className="reflect-session-schema-group"
          aria-label={sessionDisplayTitle(session)}>
          <h3>{sessionDisplayTitle(session)}</h3>
          <SessionTable session={session} goals={visibleGoals} includeArchived={showArchived}
            onViewContent={onViewContent}/>
        </section>
      ))}
    </section>
  );
}
