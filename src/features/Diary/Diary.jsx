import React, { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import DiaryNarrativeCard from './DiaryNarrativeCard';
import { MessageSquare, Calendar } from 'lucide-react';

const MOOD_OPTIONS = { happy: '😊', content: '😌', neutral: '😐', sad: '😟', anxious: '😰' };

const Diary = ({ sessions, goals, moods, diaryNotes, userId, onAppend, isLoading }) => {
  const [selectedMood, setSelectedMood] = useState({type: null, intensity: 1});
  const [moodComment, setMoodComment] = useState('');
  const [newDiaryNote, setNewDiaryNote] = useState({ title: '', text: '' });
  const [noteTitlePlaceholder, setNoteTitlePlaceholder] = useState('');

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

  const diaryGroups = useMemo(() => {
    const goalMap = new Map();
    goals.forEach(goal => {
      const key = goal.sessionId || 'unassigned';
      if (!goalMap.has(key)) goalMap.set(key, []);
      goalMap.get(key).push({ id: goal.id, type: 'goal', createdAt: goal.createdAt, data: goal });
    });

    const sessionGroups = sessions.map(session => {
      const sessionEntries = [
        { id: session.id, type: 'session', createdAt: session.createdAt, data: session },
        ...(goalMap.get(session.id) || [])
      ];
      sessionEntries.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      return { title: session.title, date: session.createdAt, entries: sessionEntries, isSessionGroup: true };
    });

    const unassignedEntries = [
      ...(goalMap.get('unassigned') || []),
      ...moods.map(m => ({ id: m.id, type: 'mood', createdAt: m.createdAt, data: m })),
      ...diaryNotes.map(n => ({ id: n.id, type: 'note', createdAt: n.createdAt, data: n }))
    ];

    const unassignedGroupsMap = unassignedEntries.reduce((acc, entry) => {
      if (!entry.createdAt?.toDate) return acc;
      const dateKey = entry.createdAt.toDate().toISOString().split('T')[0];
      if (!acc[dateKey]) {
        const formattedDate = new Date(dateKey + 'T00:00:00Z').toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
        acc[dateKey] = { title: formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1), date: entry.createdAt, entries: [], isSessionGroup: false };
      }
      acc[dateKey].entries.push(entry);
      return acc;
    }, {});

    const unassignedGroups = Object.values(unassignedGroupsMap).map(group => {
      group.entries.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      return group;
    });

    const allGroups = [...sessionGroups, ...unassignedGroups];
    allGroups.sort((a, b) => (b.date?.toMillis() || 0) - (a.date?.toMillis() || 0));
    return allGroups;
  }, [sessions, goals, moods, diaryNotes]);

  const handleSaveMood = async (e) => {
    e.preventDefault();
    if (!selectedMood.type || !db || !userId) return;
    const moodData = { mood: selectedMood.type, intensity: selectedMood.intensity, comment: moodComment.trim() };
    await addDoc(collection(db, `artifacts/${appId}/users/${userId}/moods`), { ...moodData, createdAt: serverTimestamp() });
    setSelectedMood({type: null, intensity: 1});
    setMoodComment('');
  };

  const handleAddDiaryNote = async (e) => {
    e.preventDefault();
    if (!newDiaryNote.text.trim()) return;
    let title = newDiaryNote.title.trim() || newDiaryNote.text.trim().split(' ').slice(0, 3).join(' ') + '...';
    await addDoc(collection(db, `artifacts/${appId}/users/${userId}/diaryNotes`), {
      title: title,
      entries: [{ text: newDiaryNote.text.trim(), createdAt: Timestamp.now() }],
      createdAt: serverTimestamp()
    });
    setNewDiaryNote({ title: '', text: '' });
  };

  return (
    <div>
      <h2 className="text-3xl font-bold text-stone-800 mb-6">Дневник</h2>
      <div className="bg-white p-6 rounded-xl shadow-md border border-stone-100 mb-8">
        <h3 className="text-lg font-semibold text-stone-800 mb-4">Быстрая запись</h3>
        <form onSubmit={handleSaveMood} className="mb-4">
            <div className="flex justify-around flex-wrap gap-2">
                {Object.entries(MOOD_OPTIONS).map(([mood, emoji]) => (
                    <button type="button" key={mood} onClick={() => setSelectedMood({type: mood, intensity: selectedMood.type === mood ? selectedMood.intensity : 1})} className={`text-4xl p-2 rounded-full transition-all duration-200 ${selectedMood.type === mood ? 'transform scale-125 bg-teal-100' : 'hover:scale-110'}`}>
                        {emoji}
                    </button>
                ))}
            </div>
            {selectedMood.type && (
                <div className="mt-4 animate-fade-in">
                    <label className="block text-sm font-medium text-stone-700 mb-2">Насколько сильна эта эмоция?</label>
                    <div className="flex justify-center items-center gap-2 mb-4">
                        {[1, 2, 3, 4, 5].map(intensity => (
                            <button type="button" key={intensity} onClick={() => setSelectedMood({...selectedMood, intensity: intensity})} className={`p-1 rounded-full transition-all text-3xl ${selectedMood.intensity >= intensity ? 'opacity-100' : 'opacity-30'}`}>
                                {MOOD_OPTIONS[selectedMood.type]}
                            </button>
                        ))}
                    </div>
                    <textarea value={moodComment} onChange={e => setMoodComment(e.target.value)} placeholder="Добавьте комментарий (необязательно)..." className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2" rows="2"></textarea>
                    <div className="flex justify-end gap-4">
                        <button type="button" onClick={() => {setSelectedMood({type: null, intensity: 1}); setMoodComment('');}} className="px-4 py-2 text-sm text-stone-600 bg-stone-200 rounded-lg hover:bg-stone-300 font-semibold">Отмена</button>
                        <button type="submit" className="px-4 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold">Сохранить настроение</button>
                    </div>
                </div>
            )}
        </form>
      <hr className="my-4"/>
      <form onSubmit={handleAddDiaryNote} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Заголовок (необязательно)</label>
          <input type="text" value={newDiaryNote.title} onChange={e => setNewDiaryNote({...newDiaryNote, title: e.target.value})} placeholder={noteTitlePlaceholder} className="w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg"/>
        </div>
        <textarea value={newDiaryNote.text} onChange={e => setNewDiaryNote({...newDiaryNote, text: e.target.value})} placeholder="Что нового? Добавьте заметку..." className="w-full p-3 border border-stone-300 rounded-lg" rows="3"></textarea>
        <div className="flex justify-end mt-2">
          <button type="submit" className="px-6 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold">Сохранить заметку</button>
        </div>
      </form>
    </div>

    <div className="mt-8">
        {diaryGroups.length === 0 && !isLoading && <p className="text-center text-stone-500 py-8">Записей пока нет.</p>}
        <div className="space-y-10">
          {diaryGroups.map((group, index) => (
            <div key={group.title + index} className="relative animate-fade-in-up">
              <div className="absolute top-3 left-4 -ml-px h-full w-0.5 bg-stone-200" aria-hidden="true"></div>
              <div className="relative pl-10">
                <div className="absolute left-0 top-0">
                  <span className="h-8 w-8 rounded-full bg-teal-500 flex items-center justify-center ring-8 ring-stone-50">
                    {group.isSessionGroup ? <MessageSquare className="w-4 h-4 text-white" /> : <Calendar className="w-4 h-4 text-white" />}
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-stone-800 mb-6 pt-1 capitalize">{group.title}</h3>
                <div className="space-y-6">
                  {group.entries.map(entry => (
                    <DiaryNarrativeCard key={`${entry.type}-${entry.id}`} entry={entry} onAppend={onAppend} />
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
