import React from 'react';
import { Star } from 'lucide-react';
import CollapsibleContent from '../../components/common/CollapsibleContent';
import { formatDate } from '../../utils/formatDate';

const MOOD_OPTIONS = { happy: '😊', content: '😌', neutral: '😐', sad: '😟', anxious: '😰' };

const DiaryNarrativeCard = React.memo(({ entry, onAppend }) => {
  const renderContent = () => {
    switch (entry.type) {
      case 'session':
        return (
          <div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">{entry.data.title}</h3>
            <p className="text-sm text-stone-500 mb-3">Сеанс рефлексии</p>
            <CollapsibleContent title="Показать детали сеанса" startOpen={true}>
              <div className="space-y-4">
                {entry.data.chatHistory.map((msg, index) => (
                  <div key={index}>
                    {msg.role === 'user' ? (
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <p className="text-sm font-semibold text-stone-600 mb-1">Вы:</p>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ) : (
                      <CollapsibleContent title="Показать ответ ассистента">
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </CollapsibleContent>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </div>
        );
      case 'goal':
        return (
          <div>
            <h4 className="font-semibold text-stone-800">{entry.data.completed ? 'Достигнута цель' : 'Поставлена цель'}: {entry.data.text}</h4>
            <CollapsibleContent title="Показать описание цели">
              <p className="text-sm text-stone-600">{entry.data.purpose}</p>
            </CollapsibleContent>
            {entry.data.type === 'reflection' && (
              <div className="mt-3 space-y-2">
                <h5 className="font-semibold">Проработка:</h5>
                {entry.data.reflections?.map((ref, i) => (
                  <div key={i} className="p-3 bg-stone-50 rounded-md border-l-4 border-teal-300">
                    <p className="text-xs text-stone-400 mb-1">{formatDate(ref.createdAt)}</p>
                    <p className="whitespace-pre-wrap">{ref.text}</p>
                  </div>
                ))}
                 <button onClick={() => onAppend(entry)} className="mt-2 text-sm px-3 py-1 text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold">
                  {entry.data.reflections?.length > 0 ? 'Дополнить' : 'Проработать'}
                </button>
              </div>
            )}
            {entry.data.checklistFeedback && (
              <div className="mt-3 space-y-2 p-3 bg-stone-50 rounded-md border-l-4 border-green-300">
                <h5 className="font-semibold">Обратная связь по выполнению:</h5>
                {entry.data.checklistFeedback.comment && <p><b>Комментарий:</b> {entry.data.checklistFeedback.comment}</p>}
                <div className="flex items-center gap-1"><b>Оценка:</b> {Array(entry.data.checklistFeedback.rating || 1).fill().map((_, i) => <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />)}</div>
              </div>
            )}
          </div>
        );
      case 'mood':
        return (
          <div className="flex items-center gap-4">
            <div className="flex">
              {Array(entry.data.intensity || 1).fill(MOOD_OPTIONS[entry.data.mood]).map((emoji, i) => <span key={i} className="text-4xl">{emoji}</span>)}
            </div>
            <div>
              <h4 className="font-semibold text-stone-800">Запись о настроении</h4>
              {entry.data.comment && <p className="text-stone-600">{entry.data.comment}</p>}
            </div>
          </div>
        );
      case 'note':
        return (
          <div>
            <h4 className="font-semibold text-stone-800">{entry.data.title}</h4>
            {entry.data.entries?.map((noteEntry, i) => (
              <div key={i} className="p-3 mt-2 bg-stone-50 rounded-md border-l-4 border-purple-300">
                <p className="text-xs text-stone-400 mb-1">{formatDate(noteEntry.createdAt)}</p>
                <p className="whitespace-pre-wrap">{noteEntry.text}</p>
              </div>
            ))}
            <button onClick={() => onAppend(entry)} className="mt-2 text-sm px-3 py-1 text-white bg-purple-600 rounded-lg hover:bg-purple-700 font-semibold">
              Дополнить заметку
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow-md border border-stone-200 transition-shadow hover:shadow-lg">
      {renderContent()}
    </div>
  );
});

export default DiaryNarrativeCard;
