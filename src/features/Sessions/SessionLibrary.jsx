import React, { useMemo, useState } from 'react';
import ArchiveAction from '../Archive/ArchiveAction';
import { isArchivedRecord } from '../Archive/archiveSelectors';
import {
  ArrowRight, BookOpen, CalendarDays, GitBranch,
  MessageCircle, PenLine, Search, Sparkles, Trash2
} from 'lucide-react';
import { buildSessionLibrary, searchSessionLibrary } from './sessionLibrary';

/** Saved owner-scoped threads only. No inferred session state or paid AI calls. */
export default function SessionLibrary({
  sessions = [], activeSessionId, onSelectSession, onViewJourney, onNewSession,
  onBackToConversation, onDeleteSession, onSetArchived, warning
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [archiveView, setArchiveView] = useState(false);
  const items = useMemo(() => buildSessionLibrary(
    sessions.filter(session => isArchivedRecord(session) === archiveView)
  ), [sessions, archiveView]);
  const results = useMemo(() => searchSessionLibrary(items, query, filter), [items, query, filter]);
  return (
    <section className="reflect-session-library" aria-label="Библиотека сеансов">
      <header className="reflect-session-library-header">
        <div>
          <p className="reflect-session-library-eyebrow">
            <BookOpen size={17} aria-hidden="true" /> Ваши размышления
          </p>
          <h2>История размышлений</h2>
          <p>Начатые беседы, вопросы и ответы Reflect — возвращайтесь к важным темам, когда захотите.</p>
        </div>
        <div className="reflect-session-library-actions">
          {onBackToConversation && activeSessionId && (
            <button type="button" className="reflect-session-library-secondary"
              onClick={onBackToConversation}>К беседе</button>
          )}
          <button type="button" className="reflect-session-library-new" onClick={onNewSession}>
            <PenLine size={17} aria-hidden="true" /> Новый сеанс
          </button>
        </div>
      </header>
      {warning && <p className="reflect-session-navigation-warning" role="alert">{warning}</p>}

      <div className="reflect-archive-view-switch" role="group" aria-label="Просмотр архива сеансов">
        <button type="button" aria-pressed={!archiveView}
          onClick={() => setArchiveView(false)}>Текущие сеансы</button>
        <button type="button" aria-pressed={archiveView}
          aria-label="Архив сеансов"
          onClick={() => setArchiveView(true)}>Архив</button>
      </div>
      {items.length > 0 ? (
        <>
          <div className="reflect-session-library-toolbar">
            <label className="reflect-session-library-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Поиск по сохранённым сеансам</span>
              <input type="search" placeholder="Найти тему или мысль…"
                aria-label="Поиск по сохранённым сеансам"
                value={query} onChange={event => setQuery(event.target.value)}/>
            </label>
            <div className="reflect-session-library-filters" role="group" aria-label="Фильтр сеансов">
              {[
                ['all', 'Все'], ['with-answer', 'С ответом Reflect'],
                ['without-answer', 'Без ответа']
              ].map(([value, label]) => (
                <button type="button" key={value} aria-pressed={filter === value}
                  className={filter === value ? 'is-active' : ''}
                  onClick={() => setFilter(value)}>{label}</button>
              ))}
            </div>
          </div>
          <p className="reflect-session-library-count">
            {results.length === items.length
              ? `${items.length} сохранённых сеансов`
              : `Найдено: ${results.length} из ${items.length}`}
          </p>
          {results.length ? (
            <div className="reflect-session-library-grid">
              {results.map(item => (
                <article key={item.id}
                  className={`reflect-session-library-card ${item.id === activeSessionId ? 'is-selected' : ''}`}>
                  <div className="reflect-session-library-card-top">
                    <span className="reflect-session-library-type-icon" aria-hidden="true">
                      {item.answerCount ? <Sparkles size={19}/> : <MessageCircle size={19}/>}
                    </span>
                    <span className="reflect-session-library-status">
                      {item.answerCount ? 'С ответом Reflect' : 'Без ответа Reflect'}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  {item.question && (
                    <p className="reflect-session-library-question">
                      <span>С чего началось</span>{item.question}
                    </p>
                  )}
                  {item.reflection && (
                    <p className="reflect-session-library-reflection">
                      <span>Последняя мысль Reflect</span>{item.reflection}
                    </p>
                  )}
                  <div className="reflect-session-library-meta">
                    <span><CalendarDays size={14} aria-hidden="true"/>{item.dateLabel}</span>
                    <span><MessageCircle size={14} aria-hidden="true"/>{item.messageCount} сообщ.</span>
                  </div>
                  <div className="reflect-session-library-card-actions">
                    <button type="button" className="reflect-session-library-open"
                      onClick={() => onSelectSession(item.id)}>
                      {activeSessionId === item.id ? 'Вернуться к разговору' : 'Открыть беседу'}
                      <ArrowRight size={17} aria-hidden="true"/>
                    </button>
                    {onViewJourney && (
                      <button type="button" className="reflect-session-library-journey"
                        onClick={() => onViewJourney(item.id)}
                        aria-label={`Хронология: ${item.title}`}>
                        <GitBranch size={17} aria-hidden="true"/> Хронология
                      </button>
                    )}
                    {onSetArchived && (
                      <ArchiveAction key={`${item.id}:${archiveView}`}
                        archived={archiveView} subject={`сеанс «${item.title}»`}
                        onCommit={next => onSetArchived(item.id, next)}/>
                    )}
                    {onDeleteSession && !archiveView && (
                      <button type="button" className="reflect-session-library-delete"
                        aria-label={'Удалить сеанс: ' + item.title}
                        title="Удалить сеанс" onClick={() => onDeleteSession(item.id)}>
                        <Trash2 size={15} aria-hidden="true"/>
                        <span>Удалить</span>
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="reflect-session-library-no-results" role="status">
              Не найдено совпадений. Попробуйте другой запрос или фильтр.
            </div>
          )}
        </>
      ) : archiveView ? (
        <div className="reflect-session-library-empty">
          <p role="status">Архив сеансов пуст.</p>
        </div>
      ) : (
        <div className="reflect-session-library-empty">
          <span className="reflect-session-library-empty-icon" aria-hidden="true">
            <MessageCircle size={26}/>
          </span>
          <h3>Здесь появится ваша история</h3>
          <p>После первого сохранённого диалога можно будет открыть его, продолжить и просмотреть хронологию.</p>
          <button type="button" className="reflect-session-library-open" onClick={onNewSession}>
            Начать новый сеанс <ArrowRight size={17} aria-hidden="true"/>
          </button>
        </div>
      )}
    </section>
  );
}
