import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, setDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { getAnalysisFromAI } from '../../api/geminiService';
import ChatMessage from './ChatMessage';
import InfoCard from '../../components/common/InfoCard';
import { BookOpen, BarChart2, ArrowRight, Mic, MicOff } from 'lucide-react';

const Sessions = ({ sessions, profile, userId, currentSessionId, setCurrentSessionId }) => {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUserRecording, setIsUserRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState(null);
  
  // --- ИСПРАВЛЕНИЕ: Локальное состояние для мгновенного отображения сообщений в новом сеансе ---
  const [localMessages, setLocalMessages] = useState([]);

  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const chatEndRef = useRef(null);

  const isNewSessionView = currentSessionId === 'new';
  const activeSession = !isNewSessionView ? sessions.find(s => s.id === currentSessionId) : null;

  // --- ИСПРАВЛЕНИЕ: Сбрасываем локальные сообщения, когда сеанс создан и загружен ---
  useEffect(() => {
    // Если ID сеанса изменился и это больше не "новый" сеанс, очищаем временные сообщения.
    if (currentSessionId && currentSessionId !== 'new') {
      setLocalMessages([]);
    }
  }, [currentSessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, currentSessionId, isLoading, localMessages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading || !db || !userId) return;

    const userMessage = { role: 'user', content: userInput.trim(), id: `user-${Date.now()}`, timestamp: Timestamp.now() };
    
    // --- ИСПРАВЛЕНИЕ: Мгновенно добавляем сообщение пользователя в локальное состояние для отображения ---
    if (isNewSessionView) {
      setLocalMessages(prev => [...prev, userMessage]);
    }
    
    const textToSend = userInput;
    setUserInput('');
    setIsLoading(true);
    
    // История для AI теперь включает и временные локальные сообщения
    const chatHistory = activeSession ? [...activeSession.chatHistory, userMessage] : [...localMessages, userMessage];
    
    try {
      const aiResponse = await getAnalysisFromAI(chatHistory, profile);
      if (aiResponse.error) {
        throw new Error(aiResponse.error);
      }
      
      const score = parseInt(aiResponse.score, 10) || 50;
      const assistantMessage = { role: 'assistant', content: aiResponse.response, score: score, id: `asst-${Date.now()}`, timestamp: Timestamp.now() };
      
      const newChatHistory = [...chatHistory, assistantMessage];
      const sessionPayload = { 
        title: aiResponse.sessionTitle || `Сеанс от ${new Date().toLocaleString('ru-RU')}`, 
        chatHistory: newChatHistory, 
        score: score, 
        recommendations: aiResponse.recommendations || [], 
        exercises: aiResponse.exercises || [] 
      };
      
      let sessionId = currentSessionId;
      if (isNewSessionView) {
        const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/sessions`), { ...sessionPayload, createdAt: serverTimestamp() });
        sessionId = docRef.id;
        // Устанавливаем ID нового сеанса, что приведет к обновлению UI и очистке localMessages
        setCurrentSessionId(docRef.id); 
      } else {
        await setDoc(doc(db, `artifacts/${appId}/users/${userId}/sessions`, sessionId), sessionPayload, { merge: true });
      }

      if (aiResponse.exercises && aiResponse.exercises.length > 0) {
        for (const [index, ex] of aiResponse.exercises.entries()) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 3);
          const newGoalPayload = { text: `Цель ${index + 1}: ${ex.title}`, purpose: ex.description, type: 'reflection', subItems: [], reflections: [], completed: false, sessionId: sessionId, sessionTitle: sessionPayload.title, dueDate: Timestamp.fromDate(dueDate), postponeCount: 0, createdAt: serverTimestamp() };
          await addDoc(collection(db, `artifacts/${appId}/users/${userId}/goals`), newGoalPayload);
        }
      }
    } catch (error) { 
        console.error("Send Message Error:", error);
        const errorMessage = { role: 'assistant', content: 'К сожалению, не удалось получить ответ. Пожалуйста, проверьте ваше интернет-соединение и попробуйте еще раз.', id: 'error-' + Date.now() };
        if (isNewSessionView) {
             setLocalMessages(prev => [...prev, errorMessage]);
        }
    } finally { 
        setIsLoading(false); 
    }
  };

  const handlePlayAudio = (id, text) => {
    if (isSpeaking && currentlySpeakingId === id) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setCurrentlySpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const russianVoice = voices.find(voice => voice.lang === 'ru-RU');
    if (russianVoice) utterance.voice = russianVoice;
    
    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentlySpeakingId(null);
    };
    utteranceRef.current = utterance;
    setCurrentlySpeakingId(id);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleUserRecording = () => {
    if (isUserRecording) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { console.error("Распознавание речи не поддерживается."); return; }
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'ru-RU';
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      setUserInput(prev => prev + finalTranscript);
    };
    recognitionRef.current.onend = () => setIsUserRecording(false);
    recognitionRef.current.start();
    setIsUserRecording(true);
  };
  
  // --- ИСПРАВЛЕНИЕ: Выбираем, какой массив сообщений отображать ---
  const messagesToDisplay = activeSession ? activeSession.chatHistory : localMessages;

  if (!activeSession && !isNewSessionView) {
    return (
      <div className="flex items-center justify-center h-full text-stone-500">
        <p>Выберите сеанс из списка или начните новый.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <div className="flex flex-col bg-transparent rounded-xl h-full">
        <div className="p-1 md:p-2 flex-1 overflow-y-auto">
          {isNewSessionView && messagesToDisplay.length === 0 && <ChatMessage message={{role: 'assistant', content: `Здравствуйте, ${profile?.name || 'пользователь'}! Что вас беспокоит сегодня?`, id: 'initial-message'}} onPlayAudio={handlePlayAudio} isSpeaking={isSpeaking} currentlySpeakingId={currentlySpeakingId} />}
          
          {messagesToDisplay.map((msg, index) => <ChatMessage key={msg.id || index} message={msg} onPlayAudio={handlePlayAudio} isSpeaking={isSpeaking} currentlySpeakingId={currentlySpeakingId} />)}
          
          {isLoading && <ChatMessage message={{role: 'assistant', content: 'Ассистент печатает...'}} onPlayAudio={() => {}} isSpeaking={false} />}
          <div ref={chatEndRef} />
        </div>
        <div className="p-4 bg-stone-100/80 backdrop-blur-sm border-t border-stone-200 mt-auto sticky bottom-0">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="Опишите свою ситуацию..." className="flex-1 w-full px-4 py-3 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" disabled={isLoading} />
            <button type="button" onClick={handleToggleUserRecording} className={`p-3 text-white rounded-full transition-colors ${isUserRecording ? 'bg-red-500' : 'bg-blue-500 hover:bg-blue-600'}`}>
              {isUserRecording ? <MicOff className="w-6 h-6"/> : <Mic className="w-6 h-6"/>}
            </button>
            <button type="submit" className="p-3 text-white bg-teal-600 rounded-full hover:bg-teal-700 disabled:bg-stone-400" disabled={isLoading || !userInput.trim()}><ArrowRight className="w-6 h-6" /></button>
          </form>
        </div>
      </div>
      <div className="mt-6 lg:mt-0 lg:overflow-y-auto lg:pr-2">
        <InfoCard title="Рекомендации" content={activeSession?.recommendations || (isNewSessionView ? ["Начните диалог..."] : [])} icon={<BookOpen className="text-green-500" />} />
        { (activeSession?.exercises || (isNewSessionView ? [{title: "Как это работает?", description: "Опишите свои чувства..."}] : [])).map((ex, i) => ( <InfoCard key={i} title={ex.title} content={ex.description} icon={<BarChart2 className="text-purple-500" />} /> ))}
      </div>
    </div>
  );
};

export default Sessions;