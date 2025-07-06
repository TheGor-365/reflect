import React, { useState, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';

const ReflectionModal = ({ entry, onSave, onCancel }) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  const handleToggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Используйте кастомный UI вместо alert
      console.error("Ваш браузер не поддерживает распознавание речи.");
      return;
    }
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'ru-RU';
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      }
      setText(prevText => prevText + finalTranscript);
    };
    recognitionRef.current.onend = () => setIsRecording(false);
    recognitionRef.current.start();
    setIsRecording(true);
  };

  const title = entry?.data?.text || entry?.data?.title || "Запись";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg animate-fade-in">
        <h3 className="text-xl font-bold text-stone-800 mb-2">Дополнить запись</h3>
        <p className="text-stone-600 mb-4">Запись: <span className="font-semibold">{title}</span></p>
        <textarea value={text} onChange={e => setText(e.target.value)} className="w-full p-2 border border-stone-300 rounded-lg" rows="8" placeholder="Опишите свои мысли и чувства..."></textarea>
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
          <button onClick={handleToggleRecording} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${isRecording ? 'bg-red-500 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
            {isRecording ? <MicOff size={18}/> : <Mic size={18}/>}
            {isRecording ? 'Остановить' : 'Записать аудио'}
          </button>
          <div className="flex gap-4">
            <button onClick={onCancel} className="px-6 py-2 text-stone-600 bg-stone-200 rounded-lg hover:bg-stone-300 font-semibold">Отмена</button>
            <button onClick={() => onSave(text)} disabled={!text.trim()} className="px-6 py-2 text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold disabled:bg-stone-400">Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReflectionModal;
