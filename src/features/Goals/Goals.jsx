import React, { useState, useMemo } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { formatDate } from '../../utils/formatDate';
import { Calendar, ChevronsRight, Star } from 'lucide-react';

const Goals = ({ goals, userId, onAppend, onFeedback }) => {
  const [newGoal, setNewGoal] = useState({ text: '', purpose: '', date: '', type: 'checklist', subItems: [] });
  const [newSubItemText, setNewSubItemText] = useState('');

  const groupedGoals = useMemo(() => {
    const groups = {};
    goals.forEach(goal => {
      const key = goal.sessionTitle || 'Личные цели';
      if (!groups[key]) groups[key] = [];
      groups[key].push(goal);
    });
    return Object.entries(groups);
  }, [goals]);

  const handleAddSubItem = () => {
    if (!newSubItemText.trim()) return;
    setNewGoal(prev => ({
      ...prev,
      subItems: [...prev.subItems, { text: newSubItemText.trim(), completed: false }]
    }));
    setNewSubItemText('');
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!newGoal.text.trim() || !newGoal.date || !db || !userId) return;
    const dueDate = Timestamp.fromDate(new Date(newGoal.date));
    await addDoc(collection(db, `artifacts/${appId}/users/${userId}/goals`), {
      ...newGoal,
      text: newGoal.text.trim(),
      purpose: newGoal.purpose.trim(),
      dueDate,
      completed: false,
      reflections: [],
      postponeCount: 0,
      createdAt: serverTimestamp()
    });
    setNewGoal({ text: '', purpose: '', date: '', type: 'checklist', subItems: [] });
  };

  const handleToggleSubItem = async (goal, subItemIndex) => {
    const newSubItems = [...goal.subItems];
    newSubItems[subItemIndex].completed = !newSubItems[subItemIndex].completed;
    const allCompleted = newSubItems.every(item => item.completed);
    await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/goals`, goal.id), { subItems: newSubItems, completed: allCompleted });
    if (allCompleted) {
      onFeedback(goal);
    }
  };

  const handlePostponeGoal = async (goal) => {
    if (goal.postponeCount >= 3) return;
    const newDueDate = new Date(goal.dueDate.toDate());
    newDueDate.setDate(newDueDate.getDate() + 3);
    await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/goals`, goal.id), { dueDate: Timestamp.fromDate(newDueDate), postponeCount: (goal.postponeCount || 0) + 1 });
  };

  return (
    <div>
      <h2 className="text-3xl font-bold text-stone-800 mb-6">Ваши цели</h2>
      <div className="bg-white p-6 rounded-xl shadow-md border border-stone-100 mb-6">
        <form onSubmit={handleAddGoal} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Тип цели:</label>
            <div className="flex gap-4">
              <button type="button" onClick={() => setNewGoal(prev => ({...prev, type: 'checklist'}))} className={`px-4 py-2 rounded-lg ${newGoal.type === 'checklist' ? 'bg-teal-600 text-white' : 'bg-stone-200'}`}>Список задач</button>
              <button type="button" onClick={() => setNewGoal(prev => ({...prev, type: 'reflection'}))} className={`px-4 py-2 rounded-lg ${newGoal.type === 'reflection' ? 'bg-teal-600 text-white' : 'bg-stone-200'}`}>Проработка</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Название цели:</label>
            <input type="text" value={newGoal.text} onChange={e => setNewGoal({...newGoal, text: e.target.value})} placeholder="Напр., прочитать книгу" className="w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Зачем это нужно?</label>
            <input type="text" value={newGoal.purpose} onChange={e => setNewGoal({...newGoal, purpose: e.target.value})} placeholder="Это поможет мне..." className="w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg"/>
          </div>
          {newGoal.type === 'checklist' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-stone-700">Подзадачи:</label>
              {newGoal.subItems.map((item, index) => (
                <div key={index} className="flex items-center justify-between bg-stone-100 p-2 rounded-lg">
                  <span>{item.text}</span>
                </div>
              ))}
              <div className="flex gap-2">
                <input type="text" value={newSubItemText} onChange={e => setNewSubItemText(e.target.value)} placeholder="Добавить подзадачу" className="flex-1 w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg"/>
                <button type="button" onClick={handleAddSubItem} className="px-4 py-2 text-white bg-blue-500 rounded-lg hover:bg-blue-600 font-semibold">Добавить</button>
              </div>
            </div>
          )}
          <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Срок выполнения:</label>
              <input type="date" value={newGoal.date} onChange={e => setNewGoal({...newGoal, date: e.target.value})} className="w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg"/>
          </div>
          <button type="submit" className="w-full px-6 py-3 text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold transition-colors">Добавить цель</button>
        </form>
      </div>
      <div className="space-y-6">
        {groupedGoals.map(([sessionTitle, sessionGoals]) => (
          <div key={sessionTitle} className="bg-white p-4 md:p-6 rounded-xl shadow-md border border-stone-200">
            <h3 className="text-2xl font-bold text-stone-700 mb-4 border-b pb-3">{sessionTitle}</h3>
            <div className="space-y-4">
              {sessionGoals.map(goal => (
                <div key={goal.id} className="bg-stone-50 p-4 rounded-lg border border-stone-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`font-semibold text-stone-800 ${goal.completed ? 'line-through text-stone-400' : ''}`}>{goal.text}</p>
                      {goal.purpose && <p className="text-sm text-stone-500 mt-1">{goal.purpose}</p>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                      <Calendar size={16}/> <span>до {formatDate(goal.dueDate)}</span>
                      <button disabled={goal.postponeCount >= 3} onClick={() => handlePostponeGoal(goal)} className="p-1 disabled:opacity-50"><ChevronsRight size={16}/></button>
                    </div>
                  </div>
                  {goal.type === 'reflection' ? (
                    <div className="mt-4 border-t pt-4">
                      {goal.reflections && goal.reflections.map((ref, index) => (
                        <div key={index} className="mb-2 p-2 bg-white rounded-md">
                          <p className="text-xs text-stone-400">{formatDate(ref.createdAt)}</p>
                          <p className="text-stone-700 whitespace-pre-wrap">{ref.text}</p>
                        </div>
                      ))}
                      <button onClick={() => onAppend({id: goal.id, type: 'goal', data: goal})} className="mt-2 px-4 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold">
                        {goal.reflections && goal.reflections.length > 0 ? 'Дополнить' : 'Проработать'}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {goal.subItems && goal.subItems.map((item, index) => (
                        <div key={index} className="flex items-center">
                          <input type="checkbox" checked={item.completed} onChange={() => handleToggleSubItem(goal, index)} className="h-5 w-5 rounded border-stone-300 text-teal-600 focus:ring-teal-500" disabled={goal.completed}/>
                          <label className={`ml-3 text-stone-600 ${item.completed ? 'line-through text-stone-400' : ''}`}>{item.text}</label>
                        </div>
                      ))}
                    </div>
                  )}
                   {goal.checklistFeedback && (
                    <div className="mt-3 space-y-2 p-3 bg-green-50 rounded-md border-l-4 border-green-300">
                      <h5 className="font-semibold text-green-800">Обратная связь по выполнению:</h5>
                      {goal.checklistFeedback.comment && <p><b>Комментарий:</b> {goal.checklistFeedback.comment}</p>}
                      <div className="flex items-center gap-1"><b>Оценка:</b> {Array(goal.checklistFeedback.rating || 1).fill().map((_, i) => <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
     </div>
  );
};

export default Goals;
