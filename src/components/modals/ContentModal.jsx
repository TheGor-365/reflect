import React from 'react';
import { X } from 'lucide-react';

const ContentModal = ({ content, onClose }) => {
  if (!content) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl animate-fade-in flex flex-col">
        <div className="flex justify-between items-center mb-4 pb-3 border-b">
          <h3 className="text-xl font-bold text-stone-800">Полное содержание</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-stone-200 transition-colors">
            <X className="w-6 h-6 text-stone-500" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-2 text-stone-700">
           <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    </div>
  );
};

export default ContentModal;
