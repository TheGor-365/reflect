import React, { useMemo, useState } from 'react';
import { Archive, CalendarDays, MessageSquareText, Search } from 'lucide-react';
import ReflectDialog from '../modals/ReflectDialog';
import { isArchivedRecord } from '../../features/Archive/archiveSelectors';
import { buildSessionLibrary, searchSessionLibrary }
  from '../../features/Sessions/sessionLibrary';

/** Read-only owner-scoped navigation. Does not create, alter or delete sessions. */
export default function SessionQuickSwitcher({ sessions = [], activeSessionId, onSelectSession, onClose }) {
  const [archive, setArchive] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const items = useMemo(() => buildSessionLibrary(
    sessions.filter(item => Boolean(isArchivedRecord(item)) === archive)
  ), [sessions, archive]);
  const results = useMemo(() => searchSessionLibrary(items, query, filter), [items, query, filter]);

  return <ReflectDialog title="Выбрать сеанс" size="wide" onClose={onClose}>
    <div className="reflect-session-picker" aria-label="Быстрый выбор сохранённого сеанса">
      <div className="reflect-session-picker-tabs" role="group" aria-label="Режим списка сеансов">
        <button type="button" aria-pressed={!archive} onClick={() => setArchive(false)}>Текущие</button>
        <button type="button" aria-pressed={archive} onClick={() => setArchive(true)}>
          <Archive size={15} aria-hidden="true"/> Архив
        </button>
      </div>
      <label className="reflect-session-picker-search">
        <Search size={17} aria-hidden="true"/>
        <span className="sr-only">Поиск по списку сеансов</span>
        <input type="search" value={query} placeholder="Название, вопрос или ответ…"
          onChange={event => setQuery(event.target.value)}
          aria-label="Поиск по списку сеансов"/>
      </label>
      <div className="reflect-session-picker-filters" role="group" aria-label="Фильтр ответов">
        {[
          ['all', 'Все'], ['with-answer', 'С ответом'], ['without-answer', 'Без ответа']
        ].map(([value, label]) => <button type="button" key={value}
          aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      <p className="reflect-session-picker-count" role="status">
        {`Найдено: ${results.length} из ${items.length}`}
      </p>
      {results.length ? <div className="reflect-session-picker-list">
        {results.map(item => <button type="button" key={item.id}
          className="reflect-session-picker-item"
          aria-current={item.id === activeSessionId ? 'true' : undefined}
          onClick={() => { onSelectSession(item.id); onClose(); }}>
          <span className="reflect-session-picker-title">{item.title}</span>
          {item.question && <span className="reflect-session-picker-preview">{item.question}</span>}
          <span className="reflect-session-picker-meta">
            <CalendarDays size={13} aria-hidden="true"/>{item.dateLabel}
            <MessageSquareText size={13} aria-hidden="true"/>{item.messageCount} сообщ.
            {archive && <span>Архив · только чтение</span>}
          </span>
        </button>)}
      </div> : <p className="reflect-session-picker-empty">
        {items.length ? 'Совпадений нет. Измените поиск или фильтр.' :
          archive ? 'Архив сеансов пуст.' : 'Сохранённых сеансов пока нет.'}
      </p>}
    </div>
  </ReflectDialog>;
}
