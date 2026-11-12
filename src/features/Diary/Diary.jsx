import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  ArrowUp, BarChart3, Check, ChevronDown,
  LockKeyhole, Search, SlidersHorizontal, Smile, Type, X, CalendarDays, Lightbulb
} from 'lucide-react';
import { useEntrySave } from '../../hooks/useEntrySave';
import SaveFeedback from '../../components/common/SaveFeedback';
import ProtectedDraftControls from '../../components/common/ProtectedDraftControls';
import AnimatedRegion from '../../components/common/AnimatedRegion';
import DiaryKindSwitcher from './DiaryKindSwitcher';
import DiaryNarrativeCard from './DiaryNarrativeCard';
import { saveNoteRevision } from './noteVersions';
import MoodInsights from '../Moods/MoodInsights';
import { buildDiaryTimeline, filterDiaryTimeline, groupDiaryTimeline } from './diaryTimeline';
import { timelineCalendarLabel } from './diaryPresentation';

const MOOD_OPTIONS = [
  { type: 'happy', emoji: '😊', label: 'Радость' },
  { type: 'content', emoji: '😌', label: 'Спокойствие' },
  { type: 'neutral', emoji: '😐', label: 'Нейтрально' },
  { type: 'sad', emoji: '😟', label: 'Грусть' },
  { type: 'anxious', emoji: '😰', label: 'Тревога' }
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
  userId, onAppend, onRenameSession, onOpenSession, onOpenJourney, focusNoteSource, isLoading
}) => {
  const [selectedMood, setSelectedMood] = useState({ type: null, intensity: 3 });
  const [moodComment, setMoodComment] = useState('');
  const [moodOpen, setMoodOpen] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [newDiaryNote, setNewDiaryNote] = useState({ title: '', text: '' });
  const [entryKind, setEntryKind] = useState('all');
  const [visibleKind, setVisibleKind] = useState('all');
  const [isSwitching, setIsSwitching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState({ notes: [], moods: [] });
  const [confirmedEdits, setConfirmedEdits] = useState([]);
  const [lastCommittedNote, setLastCommittedNote] = useState(null);
  const [justAddedNoteId, setJustAddedNoteId] = useState(null);
  const composerRef = useRef(null);
  const timelineRef = useRef(null);
  const noteDraftRef = useRef(null);
  const activeUserRef = useRef(userId);
  activeUserRef.current = userId;

  const confirmNote = useCallback(record => {
    setLocalConfirmed(previous => ({
      ...previous,
      notes: [...previous.notes.filter(item => item.id !== record.id), record]
    }));
    setLastCommittedNote(record.id);
    setJustAddedNoteId(record.id);
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
    setLocalConfirmed({ notes: [], moods: [] });
    setConfirmedEdits([]);
    setLastCommittedNote(null);
    setJustAddedNoteId(null);
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

  // Two-phase transition: dim the old view before updating the lens.
  // Fast repeated presses cancel stale switches; no source data is changed.
  useEffect(() => {
    if (visibleKind === entryKind) {
      setIsSwitching(false);
      return undefined;
    }
    setIsSwitching(true);
    const timer = setTimeout(() => {
      setVisibleKind(entryKind);
      setIsSwitching(false);
    }, 145);
    return () => clearTimeout(timer);
  }, [entryKind, visibleKind]);

  useEffect(() => {
    if (!justAddedNoteId) return undefined;
    const timer = setTimeout(() => setJustAddedNoteId(null), 640);
    return () => clearTimeout(timer);
  }, [justAddedNoteId]);

  // A transaction-confirmed edit remains visible while onSnapshot catches
  // up, then retires as soon as that same version or a newer one arrives.
  useEffect(() => {
    setConfirmedEdits(current => {
      const remaining = current.filter(edit => {
        if (edit.ownerUid !== userId) return false;
        const server = diaryNotes.find(item => item.id === edit.id);
        if (!server) return true;
        const remote = server.entries?.[edit.entryIndex];
        if (!remote) return true;
        const version = remote.version || 1;
        return remote.lastEditId !== edit.editId && version < edit.version;
      });
      return remaining.length === current.length ? current : remaining;
    });
  }, [diaryNotes, userId]);

  // A confirmed write is immediately represented locally; when Firestore's
  // subscription catches up by document ID it takes ownership, with no twins.
  const visibleNotes = useMemo(() => {
    const records = mergeConfirmed(diaryNotes, localConfirmed.notes);
    return records.map(note => {
      const echo = confirmedEdits.find(edit =>
        edit.ownerUid === userId && edit.id === note.id
      );
      return echo ? echo.record : note;
    });
  }, [diaryNotes, localConfirmed.notes, confirmedEdits, userId]);
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
      kind: visibleKind, query: searchQuery, from: fromDate, to: toDate
    }), [timelineEvents, visibleKind, searchQuery, fromDate, toDate]
  );
  const diaryGroups = useMemo(() => groupDiaryTimeline(visibleEvents), [visibleEvents]);
  const hasFilters = entryKind !== 'all' || !!searchQuery || !!fromDate || !!toDate;
  // Explicit source navigation from Dashboard resets only UI lenses; no
  // diary contents or authored filters are persisted or overwritten.
  useEffect(() => {
    if (!focusNoteSource || !diaryNotes.some(note=>
      note.id===focusNoteSource.recordId &&
      Array.isArray(note.entries) &&
      note.entries[focusNoteSource.entryIndex])) return;
    setEntryKind('all'); setVisibleKind('all');
    setSearchQuery(''); setFromDate(''); setToDate('');
  }, [focusNoteSource,diaryNotes]);
  useEffect(() => {
    if (!focusNoteSource || hasFilters || visibleKind!=='all') return;
    const key=`note:${focusNoteSource.recordId}:entry:${focusNoteSource.entryIndex}`;
    const target=[...(timelineRef.current?.querySelectorAll('[data-event-key]')||[])]
      .find(element=>element.getAttribute('data-event-key')===key);
    target?.scrollIntoView?.({block:'center',behavior:'smooth'});
  },[focusNoteSource,visibleEvents,hasFilters,visibleKind]);

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
    const title = newDiaryNote.title.trim();
    const confirmed = await noteSave.save({
      title, entries: [{ text: content, createdAt: Timestamp.now() }]
    });
    if (confirmed) {
      await noteDraftRef.current?.clearAfterCommit();
      setNewDiaryNote({ title: '', text: '' });
      setShowTitle(false);
    }
  };

  const handleEditNote = async ({ noteId, entryIndex, title, text, expectedVersion, editId }) => {
    const ownerUid = userId;
    const record = await saveNoteRevision({
      userId: ownerUid, noteId, entryIndex, title, text, expectedVersion, editId
    });
    // Never carry a confirmed edit echo into the next signed-in account.
    if (ownerUid !== activeUserRef.current) return record;
    setConfirmedEdits(current => [
      ...current.filter(edit => edit.id !== noteId),
      {
        id: noteId, ownerUid, entryIndex, editId,
        version: record.entries[entryIndex]?.version || 1,
        record
      }
    ]);
    return record;
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
          <DiaryKindSwitcher selected={entryKind} onSelect={setEntryKind}/>
          <span className="reflect-diary-tools-separator" aria-hidden="true"/>
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
                placeholder="Краткий заголовок"
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

      <AnimatedRegion open={filtersOpen} id="reflect-diary-filters">
        <section className="reflect-diary-filter-panel"
          aria-label="Фильтры дневника">
          <label className="reflect-diary-search">
            <Search size={17} aria-hidden="true"/>
            <span className="sr-only">Поиск по дневнику</span>
            <input type="search" value={searchQuery} aria-label="Поиск по дневнику"
              placeholder="Найти запись" onChange={event => setSearchQuery(event.target.value)}/>
          </label>
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
      </AnimatedRegion>
      <AnimatedRegion open={insightsOpen} id="reflect-diary-insights">
        <section className="reflect-diary-insights"
          aria-label="Обзор настроения за 7 дней">
          <MoodInsights moods={visibleMoods} isLoading={isLoading}/>
        </section>
      </AnimatedRegion>

      <div ref={timelineRef} className="reflect-diary-timeline" aria-label="Лента записей"
        data-filter-phase={isSwitching ? 'leaving' : 'settled'}>
        {!isLoading && !timelineEvents.length && visibleKind !== 'recommendation' &&
          <div className="reflect-diary-empty">Здесь появятся ваши записи. Начните с одной мысли.</div>}
        {!isLoading && !diaryGroups.length &&
          (visibleKind === 'recommendation'
            ? <div className="reflect-diary-recommendations-empty" role="status">
                <Lightbulb size={23} aria-hidden="true"/>
                <h3>Рекомендаций пока нет</h3>
                <p>Эта рубрика будет содержать только рекомендации, основанные на достаточном контексте.
                  Автоматическая подготовка и управление в настройках AI появятся на следующем этапе.</p>
                <p className="reflect-diary-recommendations-disclaimer">
                  Сейчас рекомендации не создаются, а готовность контекста не оценивается.
                </p>
              </div>
            : timelineEvents.length > 0
              ? <div className="reflect-diary-empty">По выбранным фильтрам ничего не найдено.</div>
              : null)}
        {diaryGroups.map((group, index) => {
          const monthKey = group.isUndated ? 'undated' : group.key.slice(0, 7);
          const previousMonthKey = index === 0 ? null :
            (diaryGroups[index - 1].isUndated ? 'undated' : diaryGroups[index - 1].key.slice(0, 7));
          const startsMonth = !group.isUndated && monthKey !== previousMonthKey;
          return (
            <React.Fragment key={group.key}>
              {startsMonth && (
                <h3 className="reflect-diary-month-heading">
                  <CalendarDays size={18} aria-hidden="true"/>
                  {timelineCalendarLabel(group.key, 'month')}
                </h3>
              )}
              <section className="reflect-diary-group" aria-label={group.title}>
                <h4 className="reflect-diary-day-heading">
                  <span className="reflect-diary-day-marker" aria-hidden="true"/>
                  <span>{group.isUndated ? group.title : timelineCalendarLabel(group.key)}</span>
                  <small>{group.entries.length}</small>
                </h4>
                <div className="reflect-diary-entries">
                  {group.entries.map(entry => (
                    <div key={entry.eventKey} data-source-id={entry.sourceId}
                      data-event-key={entry.eventKey}
                      className={`reflect-diary-event ${entry.type==='note' &&
                        focusNoteSource?.recordId===entry.sourceId &&
                        focusNoteSource?.entryIndex===entry.entryIndex
                        ? 'reflect-diary-event--source-focus ' : ''}${entry.type === 'note' && entry.sourceId === justAddedNoteId
                        ? 'reflect-diary-entering' : ''}`}>
                      <span className="reflect-diary-event-marker" data-kind={entry.sourceKind}
                        aria-hidden="true"/>
                      <DiaryNarrativeCard entry={entry} onAppend={onAppend}
                        onEditNote={handleEditNote} onRenameSession={onRenameSession}
                        onOpenSession={onOpenSession} onOpenJourney={onOpenJourney}/>
                    </div>
                  ))}
                </div>
              </section>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
};

export default Diary;
