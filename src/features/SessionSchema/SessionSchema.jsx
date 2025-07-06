import React from 'react';
import SessionTable from './SessionTable';

const SessionSchema = ({ sessions, goals, onViewContent }) => (
  <div>
    <h2 className="text-3xl font-bold text-stone-800 mb-6">Схема сеансов</h2>
    {sessions.length > 0 ? sessions.map(session => (
      <div key={session.id} className="mb-8">
        <h3 className="text-2xl font-bold text-stone-800 mb-4">{session.title}</h3>
        <SessionTable session={session} goals={goals} onViewContent={onViewContent} />
      </div>
    )) : <p>Нет активных сеансов. Начните новый!</p>}
  </div>
);

export default SessionSchema;
