import React, { useState } from 'react';
import { Star } from 'lucide-react';

const ChecklistFeedbackModal = ({ goal, onSave, onCancel }) => {
  const [feedback, setFeedback] = useState({ comment: '', rating: 0 });
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-fade-in">
        <h3 className="text-xl font-bold text-stone-800 mb-2">Отличная работа!</h3>
        <p className="text-stone-600 mb-4">Вы выполнили цель: <span className="font-semibold">{goal.text}</span>. Пожалуйста, оцените выполнение.</p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Оцените качество выполнения:</label>
          <div className="flex justify-center items-center gap-2">
            {[1, 2, 3, 4, 5].map((rate) => (
              <button key={rate} onClick={() => setFeedback({...feedback, rating: rate})} className="p-1 rounded-full transition-colors">
                <Star className={`w-8 h-8 ${feedback.rating >= rate ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} />
              </button>
            ))}
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-stone-700 mb-1">Комментарий (необязательно):</label>
          <textarea value={feedback.comment} onChange={e => setFeedback({...feedback, comment: e.target.value})} className="w-full p-2 border border-stone-300 rounded-lg" rows="3"></textarea>
        </div>
        <div className="flex justify-end gap-4">
          <button onClick={onCancel} className="px-6 py-2 text-stone-600 bg-stone-200 rounded-lg hover:bg-stone-300 font-semibold">Пропустить</button>
          <button onClick={() => onSave(feedback)} className="px-6 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold">Сохранить</button>
        </div>
      </div>
    </div>
  );
};

export default ChecklistFeedbackModal;
