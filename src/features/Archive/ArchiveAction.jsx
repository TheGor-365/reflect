import React, { useEffect, useRef, useState } from 'react';

/** Owner-click-only archive control. Caller owns UID validation and transaction. */
export default function ArchiveAction({ archived = false, subject = 'запись', onCommit,
  disabled = false }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setConfirmed(null);
    setError('');
  }, [archived, subject]);
  if (typeof onCommit !== 'function') return null;
  const action = archived ? 'Восстановить' : 'Архивировать';
  const run = async () => {
    if (lock.current || disabled || confirmed !== null) return;
    if (!archived && !window.confirm(
      `Архивировать ${subject}? Документ и связи сохранятся; его можно восстановить.`
    )) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onCommit(!archived);
      // Readback remains authoritative; disable repeated writes until it arrives.
      setConfirmed(!archived);
    } catch (failure) {
      setError(failure?.message || 'Архив не изменён. Проверьте соединение и повторите вручную.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="reflect-archive-action">
      {confirmed !== null ? (
        <span role="status">{confirmed ? 'Архивировано' : 'Восстановлено'}. Обновляем список…</span>
      ) : (
        <button type="button" disabled={busy || disabled} onClick={() => void run()}
          aria-label={`${action}: ${subject}`}>
          {busy ? 'Сохраняем…' : action}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
