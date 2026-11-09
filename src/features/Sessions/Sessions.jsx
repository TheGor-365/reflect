import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, setDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { AI_SESSION_ENABLED, getAnalysisFromAI } from '../../api/reflectAssistantService';
import ChatMessage from './ChatMessage';
import SessionComposer from './SessionComposer';
import XaiDevSmoke from './XaiDevSmoke';
import RailwayAuthCheck from './RailwayAuthCheck';
import RailwayReadinessCheck from './RailwayReadinessCheck';
import ProtectedDraftControls from '../../components/common/ProtectedDraftControls';
import InfoCard from '../../components/common/InfoCard';
import { useEntrySave } from '../../hooks/useEntrySave';
import { BookOpen, BarChart2, MessageSquareText, PenLine, ShieldCheck } from 'lucide-react';

const Sessions = ({ sessions, profile, userId, currentSessionId, setCurrentSessionId, onStartNewSession }) => {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [consentForMessage, setConsentForMessage] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState('');
  const sendLock = useRef(false);
  const noteSave = useEntrySave('diaryNotes', userId);
  const sessionDraftRef = useRef(null);
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
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [sessions, currentSessionId, isLoading, localMessages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const message = userInput.trim();
    if (!AI_SESSION_ENABLED || !message || isLoading || sendLock.current ||
        !db || !userId) return;
    if (!consentForMessage) {
      setSendError('Перед отправкой подтвердите передачу только этого сообщения в Grok.');
      return;
    }
    if (message.length > 1400 || new TextEncoder().encode(message).length > 2000) {
      setSendError('Сообщение превышает ограничение тестового AI-сервера (2000 байт).');
      return;
    }
    sendLock.current = true;
    setIsLoading(true);
    setSendError('');
    // A new request ID is generated ONLY for an explicit click. Never auto
    // retry after a timeout: the provider may have billed the first attempt.
    const requestId = crypto.randomUUID();
    try {
      const aiResponse = await getAnalysisFromAI(message, requestId);
      const userMessage = {
        role: 'user', content: message,
        id: 'user-' + requestId, timestamp: Timestamp.now()
      };
      const assistantMessage = {
        role: 'assistant', content: aiResponse.response,
        id: 'assistant-' + requestId, timestamp: Timestamp.now()
      };
      // No Firebase write here. Answer is local until "Сохранить сеанс".
      setLocalMessages(prev => [...prev, userMessage, assistantMessage]);
      setUserInput('');
      await sessionDraftRef.current?.clearAfterCommit();
      setConsentForMessage(false);
    } catch (error) {
      // Known server Auth errors occur before xAI invocation and can be fixed
      // without paid retries. Do not show raw SDK messages or credentials.
      const code = error?.message;
      const authErrors = {
        'reauthentication-required': 'Firebase отклонил прежнюю сессию после смены данных входа. Войдите заново в существующий аккаунт. Сообщение не было отправлено Grok.',
        'unauthenticated': 'Firebase не подтвердил вход. Повторно войдите в существующий аккаунт. Сообщение не было отправлено Grok.',
        'auth-permission-missing': 'Серверу не хватает прав чтения Firebase Authentication. Проверьте доступ service account в staging. Grok не вызывался.',
        'auth-verification-unavailable': 'Сервер не смог проверить Firebase Authentication. Grok не вызывался.',
        'attestation-unavailable': 'Проверка Firebase App Check недоступна. Grok не вызывался.',
        'permission-denied': 'Аккаунт не имеет действующего приватного доступа к Grok. Запрос не дошёл до модели.'
      };
      setSendError(Object.hasOwn(authErrors, code)
        ? authErrors[code]
        : 'Grok не вернул подтверждённый ответ. Текст сохранён в поле ввода. Не повторяйте запрос автоматически: он мог быть оплачен.');
      setConsentForMessage(false);
    } finally {
      sendLock.current = false;
      setIsLoading(false);
    }
  };

  const handleSaveSession = async () => {
    if (!db || !userId || !localMessages.length || isLoading || savingSession) return;
    setSavingSession(true);
    setSessionSaveError('');
    const existing = Array.isArray(activeSession?.chatHistory)
      ? activeSession.chatHistory : [];
    const payload = {
      title: activeSession?.title || 'Сеанс от ' + new Date().toLocaleString('ru-RU'),
      chatHistory: [...existing, ...localMessages],
      recommendations: activeSession?.recommendations || [],
      exercises: activeSession?.exercises || []
    };
    try {
      if (isNewSessionView) {
        const created = await addDoc(
          collection(db, 'artifacts/' + appId + '/users/' + userId + '/sessions'),
          { ...payload, createdAt: serverTimestamp() }
        );
        setLocalMessages([]);
        setCurrentSessionId(created.id);
      } else if (activeSession) {
        await setDoc(
          doc(db, 'artifacts/' + appId + '/users/' + userId + '/sessions',
            currentSessionId),
          payload, { merge: true }
        );
        setLocalMessages([]);
      }
    } catch {
      // Preserve draft and local model answer for an explicit retry.
      setSessionSaveError('Не удалось сохранить сеанс. Ответ остаётся в этом окне.');
    } finally {
      setSavingSession(false);
    }
  };

  const handleSaveToDiary = async () => {
    const text = userInput.trim();
    if (!text || isLoading) return;
    const saved = await noteSave.save({
      title: `Запись из размышления · ${new Date().toLocaleDateString('ru-RU')}`,
      entries: [{ text, createdAt: Timestamp.now() }]
    });
    if (saved) {
      await sessionDraftRef.current?.clearAfterCommit();
      setUserInput('');
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
  const messagesToDisplay = activeSession ? [...(activeSession.chatHistory || []), ...localMessages] : localMessages;
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
            <XaiDevSmoke />
            <RailwayAuthCheck />
            <RailwayReadinessCheck />
            {isNewSessionView && messagesToDisplay.length === 0 && (
              <p className="reflect-session-welcome">
                Начните с мысли или ситуации. Пока ИИ недоступен, запись можно сохранить в дневник.
              </p>
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
          {AI_SESSION_ENABLED && (
            <div className="reflect-ai-send-consent">
              <label>
                <input type="checkbox" checked={consentForMessage}
                  disabled={isLoading}
                  onChange={event => setConsentForMessage(event.target.checked)} />
                Разрешаю передать только текущий текст в Grok. История и дневник не отправляются; xAI может хранить API-запрос и ответ до 30 дней.
              </label>
              {localMessages.length > 0 && (
                <div className="reflect-ai-session-unsaved">
                  <span>Ответ AI пока не сохранён в Firebase.</span>
                  <button type="button" onClick={handleSaveSession}
                    disabled={savingSession || isLoading}>
                    {savingSession ? 'Сохранение…' : 'Сохранить сеанс'}
                  </button>
                </div>
              )}
              {sessionSaveError && <p role="alert">{sessionSaveError}</p>}
            </div>
          )}
          <SessionComposer
            value={userInput}
            onChange={(value) => { noteSave.clearFeedback(); setSendError(''); setConsentForMessage(false); setUserInput(value); }}
            onSubmit={handleSendMessage}
            onToggleRecording={handleToggleUserRecording}
            onSaveToDiary={handleSaveToDiary}
            diarySaveStatus={noteSave.status}
            isLoading={isLoading}
            isRecording={isUserRecording}
            aiAvailable={AI_SESSION_ENABLED}
            error={sendError}
            draftControls={
              <ProtectedDraftControls compact ref={sessionDraftRef} userId={userId}
                surface={currentSessionId ? `session-${currentSessionId}` : 'session-new'}
                value={{ text: userInput }} onRestore={draft => setUserInput(draft.text)} />
            }
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
