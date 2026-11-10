import React from 'react';
import { GitBranch } from 'lucide-react';
import SessionTable from './SessionTable';
import { sessionDisplayTitle } from '../Diary/diaryPresentation';

/** Read-only chronology; the richer journey-map is a separate planned stage. */
const SessionSchema = ({ sessions = [], goals = [], onViewContent }) => (
  <section className="reflect-session-schema" aria-label="Схема сеансов">
    <header className="reflect-session-schema-header">
      <h2><GitBranch size={24} aria-hidden="true" /> Схема сеансов</h2>
      <p>Вопросы, ответы и связанные цели в хронологическом порядке.</p>
    </header>
    {sessions.length > 0 ? sessions.map(session => (
      <section key={session.id} className="reflect-session-schema-group"
        aria-label={sessionDisplayTitle(session)}>
        <h3>{sessionDisplayTitle(session)}</h3>
        <SessionTable session={session} goals={goals} onViewContent={onViewContent} />
      </section>
    )) : (
      <div className="reflect-session-schema-empty">
        Нет сохранённых сеансов. Создайте первый сеанс в разделе «Сеансы».
      </div>
    )}
  </section>
);

export default SessionSchema;
