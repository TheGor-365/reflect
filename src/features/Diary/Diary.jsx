import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  ArrowUp, CalendarDays, BarChart3, Check, ChevronDown,
  LockKeyhole, Search, SlidersHorizontal, Smile, Type, X
} from 'lucide-react';
import { useEntrySave } from '../../hooks/useEntrySave';
import SaveFeedback from '../../components/common/SaveFeedback';
import ProtectedDraftControls from '../../components/common/ProtectedDraftControls';
import DiaryNarrativeCard from './DiaryNarrativeCard';
import MoodInsights from '../Moods/MoodInsights';
import { buildDiaryTimeline, filterDiaryTimeline, groupDiaryTimeline } from './diaryTimeline';

const MOOD_OPTIONS = [
  { type: 'happy', emoji: '😊', label: 'Радость' },
  { type: 'content', emoji: '😌', label: 'Спокойствие' },
  { type: 'neutral', emoji: '😐', label: 'Нейтрально' },
  { type: 'sad', emoji: '😟', label: 'Грусть' },
  { type: 'anxious', emoji: '😰', label: 'Тревога' }
];
const KINDS = [
  ['all', 'Лента'], ['note', 'Заметки'], ['mood', 'Настроение'],
  ['goal', 'Цели'], ['session', 'Сеансы']
];

const mergeConfirmed = (records, local) => [
  ...(Array.isArray(records) ? records : []),
  ...local.filter(item => !(records || []).some(server => server.id === item.id))
];

function autoSizeTextarea(element) {
  if (!element) return;
  element.style.height = 'auto';
  const height = Math.max(44, Math.min(element.scrollHeight, 232));
  element.style.height = height + 'px';
  element.style.overflowY = element.scrollHeight > 232 ? 'auto' : 'hidden';
}

/**
 * Content first: the timeline is the main surface. Tools are collapsed by
 * default and the note composer grows only as the author actually types.
 */
const Diary = ({
  sessions = [], goals = [], moods = [], diaryNotes = [],
  userId, onAppend, isLoading
}) => {
  const [selectedMood, setSelectedMood] = useState({ type: null, intensity: 3 });
  const [moodComment, setMoodComment] = useState('');
  const [moodOpen, setMoodOpen] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [newDiaryNote, setNewDiaryNote] = useState({ title: '', text: '' });
  const [entryKind, setEntryKind] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState({ notes: [], moods: [] });
  const [lastCommittedNote, setLastCommittedNote] = useState(null);
  const [noteTitlePlaceholder, setNoteTitlePlaceholder] = useState('');
  const composerRef = useRef(null);
  const timelineRef = useRef(null);
  const noteDraftRef = useRef(null);

  const confirmNote = useCallback(record => {
    setLocalConfirmed(previous => ({
      ...previous,
      notes: [...previous.notes.filter(item => item.id !== record.id), record]
    }));
    setLastCommittedNote(record.id);
  }, []);
  const confirmMood = useCallback(record => {
    setLocalConfirmed(previous => ({
      ...previous,
      moods: [...previous.moods.filter(item => item.id !== record.id), record]
    }));
  }, []);

  const noteSave = useEntrySave('diaryNotes', userId, confirmNote);
  const moodSave = useEntrySave('moods', userId, confirmMood);

  useEffect(() => {
    const updateDate = () => setNoteTitlePlaceholder(
      new Intl.DateTimeFormat('ru-RU', {
        year: 'numeric', month: 'long', day: 'numeric'
      }).format(new Date())
    );
    updateDate();
    const timer = setInterval(updateDate, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalConfirmed({ notes: [], moods: [] });
    setLastCommittedNote(null);
  }, [userId]);

  // Retire the temporary confirmed echo as soon as the authoritative server
  // snapshot contains its ID. A later server-side delete must NOT resurrect
  // an old client echo; cached confirmation is never a second source of truth.
  useEffect(() => {
    const serverNoteIds = new Set(diaryNotes.map(record => record.id));
    const serverMoodIds = new Set(moods.map(record => record.id));
    setLocalConfirmed(previous => {
      const notes = previous.notes.filter(item => !serverNoteIds.has(item.id));
      const savedMoods = previous.moods.filter(item => !serverMoodIds.has(item.id));
      return notes.length === previous.notes.length &&
        savedMoods.length === previous.moods.length
        ? previous : { notes, moods: savedMoods };
    });
  }, [diaryNotes, moods, localConfirmed.notes, localConfirmed.moods]);

  useEffect(() => autoSizeTextarea(composerRef.current), [newDiaryNote.text]);

  // A confirmed write is immediately represented locally; when Firestore's
  // subscription catches up by document ID it takes ownership, with no twins.
  const visibleNotes = useMemo(
    () => mergeConfirmed(diaryNotes, localConfirmed.notes),
    [diaryNotes, localConfirmed.notes]
  );
  const visibleMoods = useMemo(
    () => mergeConfirmed(moods, localConfirmed.moods),
    [moods, localConfirmed.moods]
  );
  const timelineEvents = useMemo(
    () => buildDiaryTimeline({
      sessions, goals, moods: visibleMoods, diaryNotes: visibleNotes
    }), [sessions, goals, visibleMoods, visibleNotes]
  );
  const visibleEvents = useMemo(
    () => filterDiaryTimeline(timelineEvents, {
      kind: entryKind, query: searchQuery, from: fromDate, to: toDate
    }), [timelineEvents, entryKind, searchQuery, fromDate, toDate]
  );
  const diaryGroups = useMemo(() => groupDiaryTimeline(visibleEvents), [visibleEvents]);
  const hasFilters = entryKind !== 'all' || !!searchQuery || !!fromDate || !!toDate;

  useEffect(() => {
    if (!lastCommittedNote || hasFilters) return;
    const target = [...(timelineRef.current?.querySelectorAll('[data-source-id]') || [])]
      .find(element => element.dataset.sourceId === lastCommittedNote);
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    setLastCommittedNote(null);
  }, [lastCommittedNote, timelineEvents, hasFilters]);

  const resetFilters = () => {
    setEntryKind('all'); setSearchQuery(''); setFromDate(''); setToDate('');
  };

  const handleAddDiaryNote = async event => {
    event.preventDefault();
    const content = newDiaryNote.text.trim();
    if (!content) return;
    const title = newDiaryNote.title.trim() || noteTitlePlaceholder || 'Запись';
    const confirmed = await noteSave.save({
      title, entries: [{ text: content, createdAt: Timestamp.now() }]
    });
    if (confirmed) {
      await noteDraftRef.current?.clearAfterCommit();
      setNewDiaryNote({ title: '', text: '' });
      setShowTitle(false);
    }
  };

  const handleSaveMood = async event => {
    event.preventDefault();
    if (!selectedMood.type) return;
    const confirmed = await moodSave.save({
      mood: selectedMood.type, intensity: selectedMood.intensity,
      comment: moodComment.trim()
    });
    if (confirmed) {
      setSelectedMood({ type: null, intensity: 3 });
      setMoodComment('');
      setMoodOpen(false);
    }
  };

  return (
    <section className="reflect-diary" aria-label="Дневник">
      <header className="reflect-diary-toolbar">
        <div className="reflect-diary-heading">
          <h2>Лента записей</h2>
          <span className="reflect-diary-count" aria-label={`Записей: ${timelineEvents.length}`}>
            {timelineEvents.length}
          </span>
        </div>
        <div className="reflect-diary-actions">
          <button type="button" className={`reflect-diary-icon-button ${filtersOpen || hasFilters ? 'is-active' : ''}`}
            aria-label="Поиск и фильтры" title="Поиск и фильтры"
            aria-expanded={filtersOpen} aria-controls="reflect-diary-filters"
            onClick={() => setFiltersOpen(value => !value)}>
            <SlidersHorizontal size={18} aria-hidden="true"/>
            {hasFilters && <span className="reflect-diary-active-dot" aria-hidden="true"/>}
          </button>
          <button type="button" className={`reflect-diary-icon-button ${insightsOpen ? 'is-active' : ''}`}
            aria-label="Обзор настроения" title="Обзор настроения"
            aria-expanded={insightsOpen} aria-controls="reflect-diary-insights"
            onClick={() => setInsightsOpen(value => !value)}>
            <BarChart3 size={18} aria-hidden="true"/>
          </button>
        </div>
      </header>

      <section className="reflect-diary-compose" aria-label="Новая запись">
        <form onSubmit={handleAddDiaryNote}>
          <div className="reflect-diary-composer-row">
            <label className="reflect-diary-composer-field">
              <span className="sr-only">Новая запись</span>
              <textarea ref={composerRef} rows={1} value={newDiaryNote.text}
                aria-label="Новая запись" placeholder="Что у вас на уме?"
                disabled={noteSave.status === 'saving'}
                onChange={event => {
                  noteSave.clearFeedback();
                  setNewDiaryNote(previous => ({ ...previous, text: event.target.value }));
                }}/>
            </label>
            <button type="button" className={`reflect-diary-icon-button ${showTitle ? 'is-active' : ''}`}
              title="Добавить заголовок" aria-label="Добавить заголовок"
              aria-expanded={showTitle} onClick={() => setShowTitle(open => !open)}>
              <Type size={18} aria-hidden="true"/>
            </button>
            <button type="button" className={`reflect-diary-icon-button ${moodOpen ? 'is-active' : ''}`}
              title="Оценить настроение" aria-label="Оценить настроение"
              aria-expanded={moodOpen} onClick={() => setMoodOpen(open => !open)}>
              <Smile size={19} aria-hidden="true"/>
            </button>
            <button type="submit" className="reflect-diary-send"
              aria-label="Сохранить заметку" title="Сохранить заметку"
              disabled={noteSave.status === 'saving' || !newDiaryNote.text.trim()}>
              <ArrowUp size={19} aria-hidden="true"/>
            </button>
          </div>
          {showTitle && (
            <label className="reflect-diary-extra-field">
              <span>Заголовок (необязательно)</span>
              <input type="text" value={newDiaryNote.title}
                placeholder={noteTitlePlaceholder}
                disabled={noteSave.status === 'saving'}
                onChange={event => {
                  noteSave.clearFeedback();
                  setNewDiaryNote(previous => ({ ...previous, title: event.target.value }));
                }}/>
            </label>
          )}
        </form>

        {moodOpen && (
          <form className="reflect-diary-mood" onSubmit={handleSaveMood}
            aria-label="Запись настроения">
            <div className="reflect-diary-mood-header">
              <strong>Настроение</strong>
              <button type="button" aria-label="Закрыть выбор настроения"
                onClick={() => setMoodOpen(false)}><X size={16}/></button>
            </div>
            <div className="reflect-diary-mood-options" role="group" aria-label="Выберите настроение">
              {MOOD_OPTIONS.map(item => (
                <button type="button" key={item.type}
                  aria-label={`Настроение: ${item.label}`}
                  aria-pressed={selectedMood.type === item.type}
                  disabled={moodSave.status === 'saving'}
                  onClick={() => {
                    moodSave.clearFeedback();
                    setSelectedMood(previous => ({
                      type: item.type, intensity: previous.type === item.type ? previous.intensity : 3
                    }));
                  }}>
                  <span aria-hidden="true">{item.emoji}</span>
                </button>
              ))}
            </div>
            {selectedMood.type && (
              <div className="reflect-diary-mood-details">
                <div className="reflect-diary-mood-intensity">
                  <span>Интенсивность</span>
                  <div role="group" aria-label="Интенсивность настроения">
                    {[1, 2, 3, 4, 5].map(level => (
                      <button type="button" key={level}
                        aria-label={`Интенсивность ${level} из 5`}
                        aria-pressed={selectedMood.intensity === level}
                        onClick={() => setSelectedMood(value => ({ ...value, intensity: level }))}
                        disabled={moodSave.status === 'saving'}>{level}</button>
                    ))}
                  </div>
                </div>
                <input type="text" value={moodComment}
                  placeholder="Комментарий (необязательно)"
                  aria-label="Комментарий к настроению"
                  onChange={event => { moodSave.clearFeedback(); setMoodComment(event.target.value); }}
                  disabled={moodSave.status === 'saving'}/>
                <button type="submit" className="reflect-diary-mood-save"
                  disabled={moodSave.status === 'saving'}>
                  <Check size={16}/> {moodSave.status === 'saving' ? 'Сохраняется…' : 'Сохранить настроение'}
                </button>
              </div>
            )}
          </form>
        )}

        <div className="reflect-diary-feedback">
          <SaveFeedback status={noteSave.status}/>
          <SaveFeedback status={moodSave.status}/>
        </div>
        <details className="reflect-diary-draft-settings">
          <summary><LockKeyhole size={15} aria-hidden="true"/> Защита черновика
            <ChevronDown size={14} aria-hidden="true"/></summary>
          <ProtectedDraftControls ref={noteDraftRef} userId={userId}
            surface="diary-new" value={newDiaryNote} onRestore={value => {
              setNewDiaryNote(value);
              setShowTitle(Boolean(value?.title));
            }}/>
          <p>Черновик сохраняется только после добровольного включения защиты.</p>
        </details>
      </section>

      {filtersOpen && (
        <section id="reflect-diary-filters" className="reflect-diary-filter-panel"
          aria-label="Фильтры дневника">
          <label className="reflect-diary-search">
            <Search size={17} aria-hidden="true"/>
            <span className="sr-only">Поиск по дневнику</span>
            <input type="search" value={searchQuery} aria-label="Поиск по дневнику"
              placeholder="Найти запись" onChange={event => setSearchQuery(event.target.value)}/>
          </label>
          <div className="reflect-diary-kinds" role="group" aria-label="Тип записи">
            {KINDS.map(([kind, label]) => (
              <button type="button" key={kind} aria-pressed={entryKind === kind}
                onClick={() => setEntryKind(kind)}>{label}</button>
            ))}
          </div>
          <div className="reflect-diary-dates">
            <label>С даты <input type="date" value={fromDate}
              max={toDate || undefined} onChange={event => setFromDate(event.target.value)}/></label>
            <label>По дату <input type="date" value={toDate}
              min={fromDate || undefined} onChange={event => setToDate(event.target.value)}/></label>
            {hasFilters && <button type="button" onClick={resetFilters}>
              Сбросить фильтры
            </button>}
          </div>
        </section>
      )}
      {insightsOpen && (
        <section id="reflect-diary-insights" className="reflect-diary-insights"
          aria-label="Обзор настроения за 7 дней">
          <MoodInsights moods={visibleMoods} isLoading={isLoading}/>
        </section>
      )}

      <div ref={timelineRef} className="reflect-diary-timeline" aria-label="Лента записей">
        {!isLoading && !timelineEvents.length &&
          <div className="reflect-diary-empty">Здесь появятся ваши записи. Начните с одной мысли.</div>}
        {!isLoading && timelineEvents.length > 0 && !diaryGroups.length &&
          <div className="reflect-diary-empty">По выбранным фильтрам ничего не найдено.</div>}
        {diaryGroups.map(group => (
          <section key={group.key} className="reflect-diary-group">
            <h3><CalendarDays size={17} aria-hidden="true"/>{group.title}</h3>
            <div className="reflect-diary-entries">
              {group.entries.map(entry => (
                <div key={entry.eventKey} data-source-id={entry.sourceId}>
                  <DiaryNarrativeCard entry={entry} onAppend={onAppend}/>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
};

export default Diary;
