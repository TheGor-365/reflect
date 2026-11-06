import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useEntrySave } from '../../hooks/useEntrySave';
import SaveFeedback from '../../components/common/SaveFeedback';
import ProtectedDraftControls from '../../components/common/ProtectedDraftControls';
import DiaryNarrativeCard from './DiaryNarrativeCard';
import MoodInsights from '../Moods/MoodInsights';
import { Calendar, Search } from 'lucide-react';
import { buildDiaryTimeline, filterDiaryTimeline, groupDiaryTimeline } from './diaryTimeline';

const MOOD_OPTIONS = { happy: '😊', content: '😌', neutral: '😐', sad: '😟', anxious: '😰' };

const Diary = ({ sessions, goals, moods, diaryNotes, userId, onAppend, isLoading }) => {
  const [selectedMood, setSelectedMood] = useState({type: null, intensity: 1});
  const [moodComment, setMoodComment] = useState('');
  const [newDiaryNote, setNewDiaryNote] = useState({ title: '', text: '' });
  const [noteTitlePlaceholder, setNoteTitlePlaceholder] = useState('');
  // All filters run in memory on the current UID's already authorized snapshots.
  // Search text is never persisted or sent to an external indexing provider.
  const [entryKind, setEntryKind] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const moodSave = useEntrySave('moods', userId);
  const noteSave = useEntrySave('diaryNotes', userId);
  const noteDraftRef = useRef(null);

  useEffect(() => {
    const updatePlaceholder = () => {
      const date = new Date();
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      setNoteTitlePlaceholder(new Intl.DateTimeFormat('ru-RU', options).format(date));
    };
    updatePlaceholder();
    const interval = setInterval(updatePlaceholder, 60000);
    return () => clearInterval(interval);
  }, []);

  const timelineEvents = useMemo(
    () => buildDiaryTimeline({ sessions, goals, moods, diaryNotes }),
    [sessions, goals, moods, diaryNotes]
  );
  const visibleEvents = useMemo(
    () => filterDiaryTimeline(timelineEvents, {
      kind: entryKind, query: searchQuery, from: fromDate, to: toDate
    }),
    [timelineEvents, entryKind, searchQuery, fromDate, toDate]
  );
  const diaryGroups = useMemo(() => groupDiaryTimeline(visibleEvents), [visibleEvents]);


  const handleSaveMood = async (e) => {
    e.preventDefault();
    if (!selectedMood.type) return;
    const didSave = await moodSave.save({
      mood: selectedMood.type,
      intensity: selectedMood.intensity,
      comment: moodComment.trim()
    });
    if (didSave) {
      setSelectedMood({ type: null, intensity: 1 });
      setMoodComment('');
    }
  };

  const handleAddDiaryNote = async (e) => {
    e.preventDefault();
    const content = newDiaryNote.text.trim();
    if (!content) return;
    // Do not expose an excerpt of a sensitive journal entry as an automatic heading.
    const title = newDiaryNote.title.trim() || noteTitlePlaceholder || 'Заметка';
    const didSave = await noteSave.save({
      title,
      entries: [{ text: content, createdAt: Timestamp.now() }]
    });
    if (didSave) {
      await noteDraftRef.current?.clearAfterCommit();
      setNewDiaryNote({ title: '', text: '' });
    }
  };

  return (
    <div>
      <h2 className="text-3xl font-bold text-stone-800 mb-6">Дневник</h2>
      <div className="bg-white p-6 rounded-xl shadow-md border border-stone-100 mb-8">
        <h3 className="text-lg font-semibold text-stone-800 mb-4">Сегодня</h3>
        <form onSubmit={handleSaveMood} className="mb-4">
            <div className="flex justify-around flex-wrap gap-2">
                {Object.entries(MOOD_OPTIONS).map(([mood, emoji]) => (
                    <button type="button" key={mood} onClick={() => { moodSave.clearFeedback(); setSelectedMood({type: mood, intensity: selectedMood.type === mood ? selectedMood.intensity : 1}); }} disabled={moodSave.status === 'saving'} aria-label={`Настроение: ${{happy:'Радость', content:'Спокойствие', neutral:'Нейтрально', sad:'Грусть', anxious:'Тревога'}[mood]}`} aria-pressed={selectedMood.type === mood} className={`text-4xl p-2 rounded-full transition-all duration-200 ${selectedMood.type === mood ? 'transform scale-125 bg-teal-100' : 'hover:scale-110'}`}>
                        {emoji}
                    </button>
                ))}
            </div>
            {selectedMood.type && (
                <div className="mt-4 animate-fade-in">
                    <label className="block text-sm font-medium text-stone-700 mb-2">Насколько сильна эта эмоция?</label>
                    <div className="flex justify-center items-center gap-2 mb-4">
                        {[1, 2, 3, 4, 5].map(intensity => (
                            <button type="button" key={intensity} onClick={() => { moodSave.clearFeedback(); setSelectedMood({...selectedMood, intensity: intensity}); }} disabled={moodSave.status === 'saving'} aria-label={`Интенсивность ${intensity} из 5`} aria-pressed={selectedMood.intensity === intensity} className={`p-1 rounded-full transition-all text-3xl ${selectedMood.intensity >= intensity ? 'opacity-100' : 'opacity-30'}`}>
                                {intensity}
                            </button>
                        ))}
                    </div>
                    <textarea value={moodComment} onChange={e => {moodSave.clearFeedback(); setMoodComment(e.target.value);}} disabled={moodSave.status === 'saving'} placeholder="Добавьте комментарий (необязательно)..." className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2" rows="2"></textarea>
                    <div className="flex justify-end gap-4">
                        <button type="button" onClick={() => {moodSave.discardAttempt(); setSelectedMood({type: null, intensity: 1}); setMoodComment('');}} disabled={moodSave.status === 'saving'} className="px-4 py-2 text-sm text-stone-600 bg-stone-200 rounded-lg hover:bg-stone-300 font-semibold">Отмена</button>
                        <button type="submit" disabled={moodSave.status === 'saving'} className="px-4 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold disabled:opacity-50">{moodSave.status === 'saving' ? 'Сохраняется…' : 'Сохранить настроение'}</button>
                    </div>
                </div>
            )}
        </form>
        <SaveFeedback status={moodSave.status} />
      <hr className="my-4"/>
      <form onSubmit={handleAddDiaryNote} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Заголовок (необязательно)</label>
          <input type="text" value={newDiaryNote.title} onChange={e => {noteSave.clearFeedback(); setNewDiaryNote(prev => ({...prev, title: e.target.value}));}} disabled={noteSave.status === 'saving'} placeholder={noteTitlePlaceholder} className="w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg"/>
        </div>
        <textarea value={newDiaryNote.text} onChange={e => {noteSave.clearFeedback(); setNewDiaryNote(prev => ({...prev, text: e.target.value}));}} disabled={noteSave.status === 'saving'} placeholder="Что нового? Добавьте заметку..." className="w-full p-3 border border-stone-300 rounded-lg" rows="3"></textarea>
        <div className="flex justify-end mt-2">
          <button type="submit" disabled={noteSave.status === 'saving' || !newDiaryNote.text.trim()} className="px-6 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold disabled:opacity-50">{noteSave.status === 'saving' ? 'Сохраняется…' : 'Сохранить заметку'}</button>
        </div>
      </form>
      <SaveFeedback status={noteSave.status} />
      <ProtectedDraftControls ref={noteDraftRef} userId={userId}
        surface="diary-new" value={newDiaryNote} onRestore={setNewDiaryNote} />
      <p className="reflect-journal-draft-notice">До подтверждения Firestore текст остаётся в форме. Локальное восстановление возможно только при добровольно включённом защищённом черновике и наличии его фразы.</p>
    </div>

    <div className="mt-8">
        <MoodInsights moods={moods} isLoading={isLoading} />
        <section className="reflect-journal-filters" aria-label="Фильтры дневника">
          <label className="reflect-journal-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Поиск по дневнику</span>
            <input type="search" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по своим записям" aria-label="Поиск по дневнику" />
          </label>
          <div className="reflect-journal-kind-list" role="group" aria-label="Тип записи">
            {[
              ['all', 'Все'], ['note', 'Заметки'], ['mood', 'Настроение'],
              ['goal', 'Цели'], ['session', 'Сеансы']
            ].map(([kind, title]) => (
              <button type="button" key={kind} aria-pressed={entryKind === kind}
                onClick={() => setEntryKind(kind)}
                className="reflect-journal-kind">{title}</button>
            ))}
          </div>
          <div className="reflect-journal-date-range">
            <label>С даты
              <input type="date" value={fromDate} max={toDate || undefined}
                onChange={e => setFromDate(e.target.value)} />
            </label>
            <label>По дату
              <input type="date" value={toDate} min={fromDate || undefined}
                onChange={e => setToDate(e.target.value)} />
            </label>
            {(searchQuery || entryKind !== 'all' || fromDate || toDate) && (
              <button type="button" className="reflect-journal-reset"
                onClick={() => { setSearchQuery(''); setEntryKind('all'); setFromDate(''); setToDate(''); }}>
                Сбросить фильтры
              </button>
            )}
          </div>
        </section>
        {!isLoading && timelineEvents.length === 0 &&
          <p className="text-center text-stone-500 py-8">Записей пока нет.</p>}
        {!isLoading && timelineEvents.length > 0 && diaryGroups.length === 0 &&
          <p className="text-center text-stone-500 py-8">По выбранным фильтрам ничего не найдено.</p>}
        <div className="space-y-10">
          {diaryGroups.map(group => (
            <div key={group.key} className="relative animate-fade-in-up">
              <div className="absolute top-3 left-4 -ml-px h-full w-0.5 bg-stone-200" aria-hidden="true"></div>
              <div className="relative pl-10">
                <div className="absolute left-0 top-0">
                  <span className="h-8 w-8 rounded-full bg-teal-500 flex items-center justify-center ring-8 ring-stone-50">
                    <Calendar className="w-4 h-4 text-white" />
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-stone-800 mb-6 pt-1 capitalize">{group.title}</h3>
                <div className="space-y-6">
                  {group.entries.map(entry => (
                    <DiaryNarrativeCard key={entry.eventKey} entry={entry} onAppend={onAppend} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Diary;
