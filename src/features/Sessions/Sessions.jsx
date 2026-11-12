import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, setDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { AI_SESSION_ENABLED, getAnalysisFromAI } from '../../api/reflectAssistantService';
import ChatMessage from './ChatMessage';
import SessionLibrary from './SessionLibrary';
import { sessionDisplayTitle } from '../Diary/diaryPresentation';
import SessionComposer from './SessionComposer';
import SessionReturnCheckIn from './SessionReturnCheckIn';
import { applyRecommendationDecision } from './recommendationDecisions';
import { newGoalId } from '../Goals/goalOperations';
import ProtectedDraftControls from '../../components/common/ProtectedDraftControls';
import InfoCard from '../../components/common/InfoCard';
import { useEntrySave } from '../../hooks/useEntrySave';
import { BookOpen, BarChart2, MessageSquareText, ShieldCheck } from 'lucide-react';

const Sessions = ({ sessions = [], profile, userId, currentSessionId, setCurrentSessionId, onStartNewSession, onOpenJourney, onOpenGoals, focusTarget, onFocusConsumed, libraryRequested = false, onCloseLibrary, onOpenLibrary }) => {
  const [userInput, setUserInput] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [navigationWarning, setNavigationWarning] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [savingSession, setSavingSession] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState('');
  const sendLock = useRef(false);
  const pendingRecommendationGoalIds = useRef({});
  const [decisionEcho, setDecisionEcho] = useState({});
  const noteSave = useEntrySave('diaryNotes', userId);
  const sessionDraftRef = useRef(null);
  const [isUserRecording, setIsUserRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState(null);
  
  // --- ИСПРАВЛЕНИЕ: Локальное состояние для мгновенного отображения сообщений в новом сеансе ---
  const [localMessages, setLocalMessages] = useState([]);

  useEffect(() => {
    pendingRecommendationGoalIds.current = {};
    setDecisionEcho({});
  }, [userId]);

  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const chatEndRef = useRef(null);
  const messageListRef = useRef(null);
  const lastFocusRequest = useRef(null);

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
    if (focusTarget?.sessionId === currentSessionId) return;
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [sessions, currentSessionId, isLoading, localMessages, focusTarget]);

  // Opening a journey node focuses the exact saved turn, never a guessed
  // message or a different user's content.
  useEffect(() => {
    if (!focusTarget || focusTarget.kind !== 'turn' ||
        focusTarget.sessionId !== activeSession?.id ||
        focusTarget.requestId === lastFocusRequest.current ||
        !Number.isInteger(focusTarget.messageIndex)) return;
    const index = focusTarget.messageIndex;
    const actual = activeSession.chatHistory?.[index];
    if (!actual || (focusTarget.messageId && actual.id !== focusTarget.messageId)) return;
    const elements = messageListRef.current?.querySelectorAll('[data-reflect-message-index]');
    const found = Array.from(elements || []).find(element =>
      Number(element.getAttribute('data-reflect-message-index')) === index);
    if (!found) return;
    lastFocusRequest.current = focusTarget.requestId;
    found.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    found.focus?.({ preventScroll: true });
    onFocusConsumed?.();
  }, [focusTarget, activeSession, onFocusConsumed]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const message = userInput.trim();
    if (!AI_SESSION_ENABLED || !message || isLoading || sendLock.current ||
        !db || !userId) return;
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
        ...(aiResponse.interaction ? { interaction: aiResponse.interaction } : {}),
        id: 'assistant-' + requestId, timestamp: Timestamp.now()
      };
      // No Firebase write here. Answer is local until "Сохранить сеанс".
      setLocalMessages(prev => [...prev, userMessage, assistantMessage]);
      setUserInput('');
      await sessionDraftRef.current?.clearAfterCommit();
    } catch (error) {
      // Known server Auth errors occur before xAI invocation and can be fixed
      // without paid retries. Do not show raw SDK messages or credentials.
      const code = error?.message;
      const authErrors = {
        'xai-invalid-request': 'xAI отклонил формат запроса (HTTP 400/422). Ошибка серверной интеграции, не вашего текста.',
        'xai-unauthorized': 'xAI отклонил API-ключ (HTTP 401). Проверьте права ключа Reflect-dev.',
        'xai-forbidden': 'xAI запретил генерацию (HTTP 403). Проверьте разрешение Chat и команды для Reflect-dev.',
        'xai-endpoint-not-found': 'xAI не нашёл запрошенную модель или API endpoint (HTTP 404).',
        'xai-rate-limited': 'xAI ограничил частоту запросов (HTTP 429). Не повторяйте отправку сразу.',
        'xai-upstream-error': 'Сервис xAI ответил ошибкой 5xx. Повтор может быть тарифицирован.',
        'xai-upstream-timeout': 'xAI не завершил запрос вовремя. Повтор может быть тарифицирован.',
        'xai-request-too-large': 'xAI отклонил размер запроса. Сократите текст сообщения.',
        'xai-unavailable': 'xAI вернул отказ. Код ошибки сохранён без раскрытия личного текста.',
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
  const savedMessageCount = Array.isArray(activeSession?.chatHistory)
    ? activeSession.chatHistory.length : 0;
  const savedDecisions = activeSession?.recommendationDecisions || {};
  const scopedDecisionPrefix = `${userId}:${activeSession?.id}:`;
  // The Firestore subscription is authoritative, including changes from a
  // second browser. Optimistic transaction acknowledgements only fill gaps
  // while owner-scoped readback has not arrived.
  const decisions = {};
  Object.entries(decisionEcho).forEach(([key, value]) => {
    if (key.startsWith(scopedDecisionPrefix)) decisions[key.slice(scopedDecisionPrefix.length)] = value;
  });
  Object.assign(decisions, savedDecisions);
  const handleRecommendationDecision = async (assistantMessageId, candidateIndex, action, draft) => {
    if (!userId || !activeSession || !activeSession.chatHistory?.some(
      message => message.id === assistantMessageId && message.role === 'assistant'
    )) {
      throw new Error('Сначала сохраните ответ Reflect в сеансе.');
    }
    const echoKey = `${userId}:${activeSession.id}:r-${assistantMessageId}-${candidateIndex}`;
    let goalId;
    if (action === 'goal') {
      pendingRecommendationGoalIds.current[echoKey] ||= newGoalId(userId);
      goalId = pendingRecommendationGoalIds.current[echoKey];
    }
    const result = await applyRecommendationDecision({
      userId, sessionId: activeSession.id, assistantMessageId, candidateIndex,
      action, goalId, goalTitle: draft?.title, goalPurpose: draft?.purpose || '',
      goalStep: draft?.step || '', goalDueDay: draft?.dueDay || '',
      goalCriteria: draft?.criteria || ''
    });
    setDecisionEcho(current => ({ ...current, [echoKey]: result }));
    delete pendingRecommendationGoalIds.current[echoKey];
    return result;
  };
  const realRecommendations = activeSession?.recommendations || [];
  const realExercises = activeSession?.exercises || [];
  const hasContext = Boolean(activeSession && (realRecommendations.length || realExercises.length));

  // Switching threads must not silently discard an unsaved paid response or typed draft.
  const canLeaveConversation = () => {
    if (localMessages.length || userInput.trim() || isLoading || savingSession) {
      setNavigationWarning('Сначала сохраните ответ или текст текущего сеанса. Несохранённая переписка не будет перенесена в другую беседу.');
      return false;
    }
    setNavigationWarning('');
    return true;
  };
  const selectFromLibrary = id => {
    if (id !== currentSessionId && !canLeaveConversation()) return;
    setCurrentSessionId(id);
    setNavigationWarning('');
    setShowLibrary(false);
    onCloseLibrary?.();
  };
  const startFromLibrary = () => {
    if (!canLeaveConversation()) return;
    setShowLibrary(false);
    setNavigationWarning('');
    onCloseLibrary?.();
    onStartNewSession?.();
  };
  const journeyFromLibrary = id => {
    if (!canLeaveConversation()) return;
    setNavigationWarning('');
    onOpenJourney?.(id);
  };

  // Sidebar selection changes the active ID externally. Respect that navigation.
  useEffect(() => {
    setShowLibrary(false);
    setNavigationWarning('');
  }, [currentSessionId]);

  if ((!activeSession && !isNewSessionView) || showLibrary || libraryRequested) {
    return (
      <SessionLibrary sessions={sessions} activeSessionId={currentSessionId}
        warning={navigationWarning}
        onSelectSession={selectFromLibrary} onNewSession={startFromLibrary}
        onViewJourney={onOpenJourney ? journeyFromLibrary : undefined}
        onBackToConversation={(activeSession || isNewSessionView) ? () => {
          setShowLibrary(false); setNavigationWarning(''); onCloseLibrary?.();
        } : undefined}/>
    );
  }

  return (
    <section className={`reflect-session-screen ${hasContext ? 'reflect-session-screen--context' : ''}`} aria-label="Рабочее пространство сеанса">
      <div className="reflect-session-chat">
        <div className="reflect-session-conversation-bar">
          <h2>{isNewSessionView ? 'Новый сеанс' : sessionDisplayTitle(activeSession)}</h2>
          <div className="reflect-session-conversation-actions">
            {sessions.length > 0 && (
              <button type="button" className="reflect-session-library-toggle"
                onClick={() => { setShowLibrary(true); setNavigationWarning(''); onOpenLibrary?.(); }}
                aria-label="Показать все сеансы">
                <BookOpen size={17} aria-hidden="true"/> Все сеансы
              </button>
            )}
            <span className="reflect-session-privacy">
              <ShieldCheck size={16} aria-hidden="true" /> Личные записи
            </span>
          </div>
        </div>

        {activeSession && (
          <SessionReturnCheckIn key={activeSession.id}
            session={activeSession} userId={userId}
            focusTarget={focusTarget?.kind === 'return' ? focusTarget : null}
            onFocusConsumed={onFocusConsumed} />
        )}
        <div className="reflect-session-messages" ref={messageListRef}
          role="log" aria-label="История сообщений" aria-live="polite">
          <div className="reflect-session-messages-inner">
            {isNewSessionView && messagesToDisplay.length === 0 && (
              <p className="reflect-session-welcome">
                {AI_SESSION_ENABLED
                  ? 'Напишите, что вас беспокоит. Grok поможет разобраться в мысли или ситуации.'
                  : 'Начните с мысли или ситуации. Пока ИИ недоступен, запись можно сохранить в дневник.'}
              </p>
            )}

            {messagesToDisplay.map((msg, index) => (
              <ChatMessage key={msg.id || index} message={msg} messageIndex={index}
                onPlayAudio={handlePlayAudio} isSpeaking={isSpeaking}
                onCompose={text => { setUserInput(text); setSendError(''); }}
                isSaved={Boolean(activeSession && index < savedMessageCount)}
                decisions={decisions}
                onDecision={(candidateIndex, action, draft) =>
                  handleRecommendationDecision(msg.id, candidateIndex, action, draft)}
                onOpenGoals={onOpenGoals}
                currentlySpeakingId={currentlySpeakingId} />
            ))}

            {isLoading && <div className="reflect-session-typing" role="status">Сеанс обрабатывается…</div>}
            <div ref={chatEndRef} />
          </div>
        </div>

        <div className="reflect-session-compose-dock">
          {AI_SESSION_ENABLED && (
            <div className="reflect-ai-send-consent">
              <p className="reflect-ai-send-disclosure" id="reflect-session-send-privacy">Отправляя сообщение в Grok, вы разрешаете передать только его текст. История, профиль и дневник не отправляются; xAI может хранить API-запрос и ответ до 30 дней.</p>
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
            onChange={(value) => { noteSave.clearFeedback(); setSendError(''); setUserInput(value); }}
            onSubmit={handleSendMessage}
            onToggleRecording={handleToggleUserRecording}
            onSaveToDiary={handleSaveToDiary}
            diarySaveStatus={noteSave.status}
            isLoading={isLoading}
            isRecording={isUserRecording}
            aiAvailable={AI_SESSION_ENABLED}
            privacyNoticeId={AI_SESSION_ENABLED ? 'reflect-session-send-privacy' : undefined}
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
