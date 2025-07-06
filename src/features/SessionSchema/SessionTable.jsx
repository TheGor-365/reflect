import React, { useMemo } from 'react';
import { formatDate } from '../../utils/formatDate';

const SessionTable = React.memo(({ session, goals, onViewContent }) => {
  const tableData = useMemo(() => {
    const data = [];
    session.chatHistory?.forEach(msg => {
      if (msg.timestamp) {
        data.push({
          timestamp: msg.timestamp,
          type: msg.role === 'user' ? 'Вопрос' : 'Ответ',
          content: msg.content,
          role: msg.role
        });
      }
    });

    goals.filter(g => g.sessionId === session.id).forEach(goal => {
      data.push({
        timestamp: goal.createdAt,
        type: 'Цель',
        content: `Поставлена цель: ${goal.text}`,
        role: 'system'
      });
      goal.reflections?.forEach(ref => {
        data.push({
          timestamp: ref.createdAt,
          type: 'Проработка',
          content: ref.text,
          role: 'system'
        });
      });
      if (goal.completed) {
        const completionTime = goal.checklistFeedback?.createdAt || goal.reflections?.slice(-1)[0]?.createdAt || goal.dueDate;
        if(completionTime) {
           data.push({
             timestamp: completionTime,
             type: 'Цель выполнена',
             content: `Завершена цель: ${goal.text}`,
             role: 'system-success'
           });
         }
      }
    });

    return data.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
  }, [session, goals]);

  const getTypePill = (type, role) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full text-white";
    let colorClasses = "bg-gray-500";
    if (role === 'user') colorClasses = "bg-blue-500";
    else if (role === 'assistant') colorClasses = "bg-teal-500";
    else if (type === 'Цель') colorClasses = "bg-purple-500";
    else if (type === 'Проработка') colorClasses = "bg-indigo-500";
    else if (role === 'system-success') colorClasses = "bg-green-500";

    return <span className={`${baseClasses} ${colorClasses}`}>{type}</span>;
  };

  const renderContentCell = (content) => {
    const maxLength = 150;
    if (typeof content !== 'string' || content.length <= maxLength) {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    return (
      <div>
        <span>{content.substring(0, maxLength)}...</span>
        <button onClick={() => onViewContent(content)} className="text-blue-600 hover:underline ml-2 font-semibold text-xs">
          Читать далее
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-md border border-stone-100 mb-4 overflow-x-auto">
      <h3 className="text-lg font-semibold text-stone-800 ml-3 mb-4">Хронология сеанса</h3>
      <table className="w-full min-w-max text-sm text-left text-stone-500">
        <thead className="text-xs text-stone-700 uppercase bg-stone-100">
          <tr>
            <th scope="col" className="px-6 py-3">Время</th>
            <th scope="col" className="px-6 py-3">Тип</th>
            <th scope="col" className="px-6 py-3">Содержание</th>
          </tr>
        </thead>
        <tbody>
          {tableData.map((item, index) => (
            <tr key={index} className="bg-white border-b hover:bg-stone-50">
              <td className="px-6 py-4 font-medium text-stone-900 whitespace-nowrap">
                {formatDate(item.timestamp)}
              </td>
              <td className="px-6 py-4">
                {getTypePill(item.type, item.role)}
              </td>
              <td className="px-6 py-4">
                {renderContentCell(item.content)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default SessionTable;
