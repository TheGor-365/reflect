import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import ReflectContentIcon, {
  MODE_CAPTIONS
} from '../../components/common/ReflectContentIcon';
import { ACCOUNT_MODE, MODE_OPTIONS, normalizedSessionMode } from './sessionModeModel';
import { saveSessionMode } from './sessionModePersistence';

/**
 * Immediate-selection, owner-bound mode picker.
 * Choosing a saved-session mode starts ONE Firestore write + server readback.
 * The enclosing Sessions screen blocks a paid send during that write; no
 * Grok request, provider cost or additional history grant is performed here.
 */
export default function SessionModePicker({
  userId, sessionId = null, value = ACCOUNT_MODE,
  onSaved, onNewSessionMode, onDirtyChange, disabled = false
}) {
  const safe = normalizedSessionMode(value);
  const [draft, setDraft] = useState(safe || ACCOUNT_MODE);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const rootRef = useRef(null);
  const ownerRef = useRef({ userId, sessionId });
  ownerRef.current = { userId, sessionId };

  useEffect(() => {
    setDraft(safe || ACCOUNT_MODE);
    setOpen(false);
    setPending(false);
    setFeedback('');
  }, [userId, sessionId, safe]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const keydown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown);
    };
  }, [open]);

  const choose = async next => {
    if (disabled || pending || safe === null ||
        normalizedSessionMode(next) === null) return;
    setOpen(false);
    setDraft(next);
    setFeedback('');
    if (!sessionId) {
      onNewSessionMode?.(next);
      return;
    }
    if (next === safe) {
      onDirtyChange?.(false);
      return;
    }
    const scope = { userId, sessionId };
    onDirtyChange?.(true);
    setPending(true);
    try {
      const saved = await saveSessionMode({ ...scope, mode: next });
      if (ownerRef.current.userId !== scope.userId ||
          ownerRef.current.sessionId !== scope.sessionId) return;
      onSaved?.(saved);
      onDirtyChange?.(false);
      setFeedback('Режим сохранён. Следующий ответ использует этот выбор.');
    } catch {
      if (ownerRef.current.userId === scope.userId &&
          ownerRef.current.sessionId === scope.sessionId) {
        setDraft(safe);
        onDirtyChange?.(false);
        setFeedback('Режим не подтверждён сервером. Выберите его повторно.');
      }
    } finally {
      if (ownerRef.current.userId === scope.userId &&
          ownerRef.current.sessionId === scope.sessionId) setPending(false);
    }
  };

  return (
    <div className="reflect-mode-control" ref={rootRef}>
      <button type="button" className="reflect-mode-trigger"
        aria-label="Режим AI этого сеанса" aria-haspopup="listbox"
        aria-expanded={open}
        title={'Режим AI: ' + (MODE_CAPTIONS[draft] || 'Недоступен')}
        disabled={disabled || pending || safe === null}
        onClick={() => setOpen(previous => !previous)}>
        <ReflectContentIcon kind={draft} size={19}/>
        <span>{MODE_CAPTIONS[draft] || 'Режим AI'}</span>
        <ChevronDown size={15} aria-hidden="true"/>
      </button>
      {open && (
        <div className="reflect-mode-options" role="listbox"
          aria-label="Выбор режима AI">
          <p className="reflect-mode-options-caption">Стиль следующих ответов в этом сеансе</p>
          {MODE_OPTIONS.map(([mode, title]) => (
            <button type="button" role="option" key={mode}
              aria-selected={mode === draft}
              className="reflect-mode-option"
              disabled={pending}
              onClick={() => choose(mode)}>
              <ReflectContentIcon kind={mode} size={18}/>
              <span>{title}</span>
              {mode === draft && <Check size={16} aria-hidden="true"/>}
            </button>
          ))}
          <p className="reflect-mode-options-footnote">
            Настройка аккаунта задаёт режим по умолчанию. История передаётся
            только по отдельному разрешению.
          </p>
        </div>
      )}
      {pending && <span className="reflect-mode-pending" role="status">
        Сохраняю режим…
      </span>}
      {feedback && <span className="reflect-mode-feedback"
        role={feedback.startsWith('Режим не') ? 'alert' : 'status'}>
        {feedback}
      </span>}
    </div>
  );
}
