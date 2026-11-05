import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, setDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { AI_SESSION_ENABLED, getAnalysisFromAI } from '../../api/geminiService';
import ChatMessage from './ChatMessage';
import SessionComposer from './SessionComposer';
import InfoCard from '../../components/common/InfoCard';
import { useEntrySave } from '../../hooks/useEntrySave';
import { BookOpen, BarChart2, MessageSquareText, PenLine, ShieldCheck, Sparkles } from 'lucide-react';

const Sessions = ({ sessions, profile, userId, currentSessionId, setCurrentSessionId, onStartNewSession }) => {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const noteSave = useEntrySave('diaryNotes', userId);
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
    if (!AI_SESSION_ENABLED || !userInput.trim() || isLoading || !db || !userId) return;
    setSendError('');

    const userMessage = { role: 'user', content: userInput.trim(), id: `user-${Date.now()}`, timestamp: Timestamp.now() };
    
    // --- ИСПРАВЛЕНИЕ: Мгновенно добавляем сообщение пользователя в локальное состояние для отображения ---
    if (isNewSessionView) {
      setLocalMessages(prev => [...prev, userMessage]);
    }
    
    // Do not destroy a long personal reflection before AI + Firestore succeed.
    setIsLoading(true);
    
    // История для AI теперь включает и временные локальные сообщения
    const chatHistory = activeSession ? [...activeSession.chatHistory, userMessage] : [...localMessages, userMessage];
    
    try {
      const aiResponse = await getAnalysisFromAI(chatHistory, profile);
      if (aiResponse.error) {
        throw new Error(aiResponse.error);
      }
      
      // No fabricated emotional health score: AI scores are not validated diagnostics.
      const assistantMessage = { role: 'assistant', content: aiResponse.response, id: `asst-${Date.now()}`, timestamp: Timestamp.now() };
      
      const newChatHistory = [...chatHistory, assistantMessage];
      const sessionPayload = { 
        title: aiResponse.sessionTitle || `Сеанс от ${new Date().toLocaleString('ru-RU')}`, 
        chatHistory: newChatHistory, 
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

      // AI suggestions are advisory only: never auto-create user goals.
      setUserInput('');
    } catch (error) {
        console.error("Send Message Error:", error);
        // Keep unsent message editable and do not present a failed write as sent.
        setLocalMessages(prev => prev.filter(message => message.id !== userMessage.id));
        setSendError('Не удалось отправить сообщение. Ваш текст сохранён в поле ввода — можно повторить попытку.');
    } finally {
        setIsLoading(false);
    }
  };

  const handleSaveToDiary = async () => {
    const text = userInput.trim();
    if (!text || isLoading) return;
    const saved = await noteSave.save({
      title: `Запись из размышления · ${new Date().toLocaleDateString('ru-RU')}`,
      entries: [{ text, createdAt: Timestamp.now() }]
    });
    if (saved) setUserInput('');
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
  const messagesToDisplay = activeSession ? (activeSession.chatHistory || []) : localMessages;
  const realRecommendations = activeSession?.recommendations || [];
  const realExercises = activeSession?.exercises || [];
  const hasContext = Boolean(activeSession && (realRecommendations.length || realExercises.length));

  if (!activeSession && !isNewSessionView) {
    return (
      <section className="reflect-session-empty" aria-label="Выбор сеанса">
        <span className="reflect-session-empty-icon"><MessageSquareText size={30} aria-hidden="true" /></span>
        <p className="reflect-session-kicker">Пространство для размышлений</p>
        <h2>Ваш следующий сеанс начинается здесь</h2>
        <p>Выберите существующий сеанс или начните новый. Предыдущие записи сохраняются отдельно в дневнике.</p>
        <button type="button" onClick={onStartNewSession} className="reflect-session-start">
          <PenLine size={19} aria-hidden="true" /> Начать новый сеанс
        </button>
      </section>
    );
  }

  return (
    <section className={`reflect-session-screen ${hasContext ? 'reflect-session-screen--context' : ''}`} aria-label="Рабочее пространство сеанса">
      <div className="reflect-session-chat">
        <div className="reflect-session-conversation-bar">
          <div>
            <p className="reflect-session-kicker">Личное пространство</p>
            <h2>{isNewSessionView ? 'Новый сеанс' : (activeSession?.title || 'Сеанс')}</h2>
          </div>
          <span className="reflect-session-privacy"><ShieldCheck size={16} aria-hidden="true" /> Личные записи</span>
        </div>

        <div className="reflect-session-messages" role="log" aria-label="История сообщений" aria-live="polite">
          <div className="reflect-session-messages-inner">
            {isNewSessionView && messagesToDisplay.length === 0 && (
              <div className="reflect-session-welcome">
                <span className="reflect-session-welcome-icon"><Sparkles size={27} aria-hidden="true" /></span>
                <h3>О чём хотите поразмышлять?</h3>
                <p>Расскажите о ситуации своими словами. Текст может быть длинным — поле внизу расширится автоматически.</p>
                {!AI_SESSION_ENABLED && (
                  <p className="reflect-session-disabled-note">ИИ-диалог временно недоступен. Пока вы можете сохранить написанное как запись дневника.</p>
                )}
              </div>
            )}

            {messagesToDisplay.map((msg, index) => (
              <ChatMessage key={msg.id || index} message={msg}
                onPlayAudio={handlePlayAudio} isSpeaking={isSpeaking}
                currentlySpeakingId={currentlySpeakingId} />
            ))}

            {isLoading && <div className="reflect-session-typing" role="status">Сеанс обрабатывается…</div>}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="reflect-session-compose-dock">
          <SessionComposer
            value={userInput}
            onChange={(value) => { noteSave.clearFeedback(); setUserInput(value); }}
            onSubmit={handleSendMessage}
            onToggleRecording={handleToggleUserRecording}
            onSaveToDiary={handleSaveToDiary}
            diarySaveStatus={noteSave.status}
            isLoading={isLoading}
            isRecording={isUserRecording}
            aiAvailable={AI_SESSION_ENABLED}
            error={sendError}
          />
        </div>
      </div>

      {hasContext && (
        <aside className="reflect-session-context" aria-label="Результаты сеанса">
          {realRecommendations.length > 0 && (
            <InfoCard title="Рекомендации" content={realRecommendations}
              icon={<BookOpen className="text-teal-500" />} />
          )}
          {realExercises.map((ex, index) => (
            <InfoCard key={ex.id || index} title={ex.title} content={ex.description}
              icon={<BarChart2 className="text-violet-500" />} />
          ))}
        </aside>
      )}
    </section>
  );
};

export default Sessions;
