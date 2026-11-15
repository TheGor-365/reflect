import React, { useEffect, useRef, useState } from 'react';
import { ACCOUNT_MODE, MODE_OPTIONS, normalizedSessionMode } from './sessionModeModel';
import { saveSessionMode } from './sessionModePersistence';

/**
 * One clear control near the composer; unlike context-depth, this chooses
 * HOW Grok answers this session, never WHICH prior messages may be sent.
 */
export default function SessionModePicker({
  userId, sessionId = null, value = ACCOUNT_MODE,
  onSaved, onNewSessionMode, onDirtyChange, disabled = false
}) {
  const safe = normalizedSessionMode(value);
  const [draft, setDraft] = useState(safe || ACCOUNT_MODE);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const owner = useRef({ userId, sessionId });
  owner.current = { userId, sessionId };
  useEffect(() => {
    setDraft(safe || ACCOUNT_MODE);
    setFeedback('');
    setPending(false);
  }, [userId, sessionId, safe]);
  const change = event => {
    const next = normalizedSessionMode(event.target.value);
    if (next === null) return;
    setDraft(next);
    setFeedback('');
    if (!sessionId) onNewSessionMode?.(next);
    else onDirtyChange?.(next !== safe);
  };
  const save = async () => {
    if (!sessionId || !userId || !onSaved || disabled || pending ||
        safe === null || draft === safe) return;
    const scope = { userId, sessionId };
    setPending(true); setFeedback('');
    try {
      const saved = await saveSessionMode({ ...scope, mode: draft });
      if (owner.current.userId !== scope.userId ||
          owner.current.sessionId !== scope.sessionId) return;
      onSaved(saved);
      onDirtyChange?.(false);
      setFeedback('Режим сеанса сохранён в Firebase. Новые ответы используют этот выбор.');
    } catch {
      if (owner.current.userId === scope.userId &&
          owner.current.sessionId === scope.sessionId) {
        setFeedback('Режим не подтверждён сервером. Выберите его заново; запрос в Grok не отправлялся.');
      }
    } finally {
      if (owner.current.userId === scope.userId &&
          owner.current.sessionId === scope.sessionId) setPending(false);
    }
  };
  return (
    <div className="reflect-session-mode-picker" role="group"
      aria-label="Режим AI для текущего сеанса">
      <label htmlFor="reflect-session-ai-mode">Режим AI этого сеанса</label>
      <select id="reflect-session-ai-mode" value={draft} onChange={change}
        disabled={disabled || pending || safe === null}>
        {MODE_OPTIONS.map(([mode, label]) => (
          <option key={mode} value={mode}>{label}</option>
        ))}
      </select>
      {sessionId ? (
        <button type="button" onClick={save}
          disabled={disabled || pending || safe === null || draft === safe}>
          {pending ? 'Сохранение…' : 'Сохранить режим'}
        </button>
      ) : (
        <span>Режим сохранится вместе с первым сообщением сеанса.</span>
      )}
      <span>Режим влияет на поведение ответа. История и расходы управляются отдельно.</span>
      {feedback && <p role={feedback.includes('не подтверждён') ? 'alert' : 'status'}>
        {feedback}
      </p>}
    </div>
  );
}
