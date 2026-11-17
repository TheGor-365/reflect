import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

/**
 * Owner confirmation before deleting the session document. Related goals and
 * diary notes are deliberately NOT deleted; no third-party AI calls happen.
 * Keyboard focus stays within the dialog. Design follows Reflect colors.
 */
export default function SessionDeleteDialog({
  session, linkedGoalCount = 0, busy = false, error = '',
  onCancel, onConfirm
}) {
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);
  const id = session?.id;
  useEffect(() => {
    if (!id) return undefined;
    previouslyFocused.current = document.activeElement;
    cancelRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel?.();
      }
      if (event.key !== 'Tab') return;
      const focusables = [...(dialogRef.current?.querySelectorAll(
        'button:not([disabled])'
      ) || [])];
      if (!focusables.length) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === focusables[0]) {
        event.preventDefault(); focusables[focusables.length - 1].focus();
      } else if (!event.shiftKey &&
        document.activeElement === focusables[focusables.length - 1]) {
        event.preventDefault(); focusables[0].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused.current?.isConnected) {
        previouslyFocused.current.focus();
      }
    };
  }, [id, busy, onCancel]);

  if (!session) return null;
  return (
    <div className="reflect-session-delete-overlay" role="presentation">
      <div ref={dialogRef} className="reflect-session-delete-dialog"
        role="alertdialog" aria-modal="true"
        aria-labelledby="reflect-delete-session-title"
        aria-describedby="reflect-delete-session-description">
        <div className="reflect-session-delete-top">
          <span className="reflect-session-delete-symbol" aria-hidden="true">
            <Trash2 size={19}/>
          </span>
          <button type="button" className="reflect-session-delete-close"
            onClick={onCancel} disabled={busy} aria-label="Отменить удаление">
            <X size={17} aria-hidden="true"/>
          </button>
        </div>
        <h2 id="reflect-delete-session-title">Удалить сеанс?</h2>
        <p className="reflect-session-delete-subject">{session.title || 'Сохранённый сеанс'}</p>
        <p id="reflect-delete-session-description">
          История беседы, оценки гипотез и рекомендации этого сеанса будут
          удалены из вашей библиотеки. Вернуть их из приложения нельзя.
        </p>
        <div className="reflect-session-delete-note">
          <AlertTriangle size={16} aria-hidden="true"/>
          <span>{linkedGoalCount > 0
            ? 'Связанные цели (' + linkedGoalCount + ') и записи дневника сохранятся отдельно, но ссылки на этот сеанс перестанут работать.'
            : 'Отдельные цели и записи дневника не удаляются.'}
            {' '}Технические квитанции AI могут храниться отдельно по политике сервера.</span>
        </div>
        {error && <p className="reflect-session-delete-error" role="alert">{error}</p>}
        <div className="reflect-session-delete-actions">
          <button type="button" ref={cancelRef} onClick={onCancel} disabled={busy}
            className="reflect-session-delete-cancel">Оставить сеанс</button>
          <button type="button" onClick={() => onConfirm?.()} disabled={busy}
            className="reflect-session-delete-confirm">
            <Trash2 size={15} aria-hidden="true"/>
            {busy ? 'Удаление…' : 'Удалить навсегда'}
          </button>
        </div>
      </div>
    </div>
  );
}
