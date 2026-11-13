import React, { useState, useRef, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { AI_SESSION_ENABLED, getAnalysisFromAI } from '../../api/reflectAssistantService';
import { createDurableSession, appendDurableTurn } from './sessionPersistence';
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

const Sessions = ({ sessions = [], profile, userId, currentSessionId, setCurrentSessionId, onStartNewSession, onOpenJourney, onOpenGoals, focusTurnId, libraryRequested = false, onCloseLibrary, onOpenLibrary }) => {
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
  // Only an unconfirmed assistant write is kept in memory. Normal turns
  // are immediately written to Firestore; a reload reads the owner history.
  const [localMessages, setLocalMessages] = useState([]);
  const [localMessageScope, setLocalMessageScope] = useState(null);
  const [openingSession, setOpeningSession] = useState(null);
  const ownerRef = useRef(userId);
  ownerRef.current = userId;

  useEffect(() => {
    pendingRecommendationGoalIds.current = {};
    setDecisionEcho({});
    setOpeningSession(null);
    setLocalMessages([]);
    setLocalMessageScope(null);
    setSessionSaveError('');
  }, [userId]);

  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const chatEndRef = useRef(null);

  const isNewSessionView = currentSessionId === 'new';
  const savedSession = !isNewSessionView
    ? sessions.find(session => session.id === currentSessionId) : null;
  // Bridge the short subscription delay after the first confirmed write.
  const activeSession = savedSession || (
    openingSession?.userId === userId && openingSession?.id === currentSessionId
      ? openingSession.session : null
  );
  const scopedLocalMessages = localMessageScope?.userId === userId &&
    localMessageScope?.sessionId === currentSessionId ? localMessages : [];

  // Retire optimistic replies only when the authenticated live subscription
  // actually contains the same immutable turn IDs. No destructive overwrite.
  useEffect(() => {
    if (!savedSession || !scopedLocalMessages.length) return;
    const ids = new Set((savedSession.chatHistory || []).map(turn => turn.id));
    if (scopedLocalMessages.every(turn => ids.has(turn.id))) {
      setLocalMessages([]);
      setLocalMessageScope(null);
      setSessionSaveError('');
    }
  }, [savedSession?.chatHistory, currentSessionId, userId, scopedLocalMessages.length]);

  useEffect(() => {
    if (!focusTurnId) chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [sessions, currentSessionId, isLoading, localMessages, focusTurnId]);

  useEffect(() => {
    if (!focusTurnId || !activeSession) return;
    // Find only this saved session's actual authored turn. A legacy message
    // with no stable turn ID can only be opened at session level.
    const matched = [...document.querySelectorAll('[data-reflect-turn-id]')]
      .find(element => element.getAttribute('data-reflect-turn-id') === focusTurnId);
    matched?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [focusTurnId, activeSession?.id, activeSession?.chatHistory]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const message = userInput.trim();
    if (!AI_SESSION_ENABLED || !message || isLoading || sendLock.current ||
        !db || !userId || (!isNewSessionView && !activeSession)) return;
    if (localMessages.length && sessionSaveError) {
      setSendError('Сначала восстановите сохранение предыдущего ответа Reflect.');
      return;
    }
    if (message.length > 1400 || new TextEncoder().encode(message).length > 2000) {
      setSendError('Сообщение превышает ограничение тестового AI-сервера (2000 байт).');
      return;
    }
    sendLock.current = true;
    setIsLoading(true);
    setSendError('');
    setSessionSaveError('');
    const owner = userId;
    // New request ID only on a deliberate send. NEVER retry a paid call
    // after a timeout, including if saving its response fails.
    const requestId = crypto.randomUUID();
    const userTurn = {
      role: 'user', content: message,
      id: 'user-' + requestId, timestamp: Timestamp.now()
    };
    let durableSessionId = isNewSessionView ? null : activeSession.id;
    try {
      // A user turn MUST be committed before invoking Grok. A failure here
      // leaves the text in the composer; there is no paid provider call.
      try {
        if (!durableSessionId) {
          const created = await createDurableSession(owner, userTurn);
          durableSessionId = created.id;
          if (ownerRef.current === owner) {
            setOpeningSession({
              userId: owner, id: durableSessionId,
              session: {
                id: durableSessionId, title: created.title,
                chatHistory: [userTurn], recommendations: [], exercises: []
              }
            });
            setCurrentSessionId(durableSessionId);
          }
        } else {
          await appendDurableTurn(owner, durableSessionId, userTurn);
        }
      } catch {
        if (ownerRef.current === owner) {
          setSendError('Не удалось подтвердить сохранение сообщения в Firebase. Grok не вызывался, текст остался в поле ввода.');
        }
        return;
      }
      if (ownerRef.current === owner) {
        setUserInput('');
        await sessionDraftRef.current?.clearAfterCommit();
      }

      const aiResponse = await getAnalysisFromAI(message, requestId);
      const assistantTurn = {
        role: 'assistant', content: aiResponse.response,
        ...(aiResponse.interaction ? { interaction: aiResponse.interaction } : {}),
        id: 'assistant-' + requestId, timestamp: Timestamp.now()
      };
      // Immediate display while Firestore confirms the automatic write.
      if (ownerRef.current === owner) {
        setLocalMessageScope({ userId: owner, sessionId: durableSessionId });
        setLocalMessages([assistantTurn]);
      }
      try {
        await appendDurableTurn(owner, durableSessionId, assistantTurn);
      } catch {
        // No AI retry. Keep the exact received answer in memory for a
        // save-only retry; never destroy it with a transcript overwrite.
        if (ownerRef.current === owner) {
          setSessionSaveError('Ответ Grok получен, но сохранение в Firebase не подтверждено. Повторите только сохранение ответа, не запрос к Grok.');
        }
      }
    } catch (error) {
      // The user turn is already committed. Provider failures are ambiguous
      // and may be billed. Never silently resubmit the same message.
      if (ownerRef.current !== owner) return;
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
        : 'Grok не вернул подтверждённый ответ. Ваше сообщение сохранено в сеансе. Не повторяйте запрос автоматически: он мог быть оплачен.');
    } finally {
      sendLock.current = false;
      setIsLoading(false);
    }
  };

  // Recovery only. Successful AI turns are saved without any button click.
  const handleSaveSession = async () => {
    if (!db || !userId || !scopedLocalMessages.length || !sessionSaveError ||
        isLoading || savingSession || !activeSession) return;
    setSavingSession(true);
    try {
      for (const turn of scopedLocalMessages) {
        await appendDurableTurn(userId, activeSession.id, turn);
      }
      setSessionSaveError('');
      // Retain the local copy until owner-scoped onSnapshot confirms it.
    } catch {
      setSessionSaveError('Сохранение ответа пока не подтверждено. Ответ остаётся на экране; проверьте соединение.');
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
  const savedHistory = Array.isArray(activeSession?.chatHistory)
    ? activeSession.chatHistory : [];
  const storedIds = new Set(savedHistory.map(turn => turn.id));
  const messagesToDisplay = [
    ...savedHistory,
    ...scopedLocalMessages.filter(turn => !storedIds.has(turn.id))
  ];
  const savedMessageCount = savedHistory.length;
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
    if (userInput.trim() || (scopedLocalMessages.length && sessionSaveError)) {
      setNavigationWarning('Есть неотправленный текст или ответ с ошибкой сохранения. Сохраните данные перед переходом.');
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
            session={activeSession} userId={userId} />
        )}
        <div className="reflect-session-messages" role="log" aria-label="История сообщений" aria-live="polite">
          <div className="reflect-session-messages-inner">
            {isNewSessionView && messagesToDisplay.length === 0 && (
              <p className="reflect-session-welcome">
                {AI_SESSION_ENABLED
                  ? 'Напишите, что вас беспокоит. Grok поможет разобраться в мысли или ситуации.'
                  : 'Начните с мысли или ситуации. Пока ИИ недоступен, запись можно сохранить в дневник.'}
              </p>
            )}

            {messagesToDisplay.map((msg, index) => (
              <ChatMessage key={msg.id || index} message={msg}
                focused={Boolean(activeSession && msg.id && msg.id === focusTurnId)}
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
              <p className="reflect-session-autosave-status" role="status">
                Диалог сохраняется автоматически. Повторный вызов Grok не выполняется при ошибке записи.
              </p>
              {scopedLocalMessages.length > 0 && sessionSaveError && (
                <div className="reflect-ai-session-unsaved">
                  <span role="alert">{sessionSaveError}</span>
                  <button type="button" onClick={handleSaveSession}
                    disabled={savingSession || isLoading}>
                    {savingSession ? 'Сохранение…' : 'Повторить только сохранение'}
                  </button>
                </div>
              )}
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
