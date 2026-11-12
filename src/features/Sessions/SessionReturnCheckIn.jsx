import React, { useEffect, useRef, useState } from 'react';
import ProtectedDraftControls from '../../components/common/ProtectedDraftControls';
import { saveSessionReturn } from './sessionReturn';

const formatDay = value => {
  try {
    const date = value?.toDate?.();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return 'Время не указано';
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
  } catch { return 'Время не указано'; }
};

/** Explicit return, never AI-synthesized or sent to the provider. */
export default function SessionReturnCheckIn({ session, userId }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const pendingVisitId = useRef(null);
  const protectedDraft = useRef(null);
  const ownerContext = `${userId}:${session?.id || ''}`;
  const contextRef = useRef(ownerContext);
  contextRef.current = ownerContext;
  useEffect(() => {
    pendingVisitId.current = null;
    setNote(''); setError(''); setNotice('');
  }, [ownerContext]);
  if (!session?.id || !userId) return null;
  const entries = Array.isArray(session.returnCheckIns)
    ? session.returnCheckIns.filter(entry => entry?.type === 'return-check-in' &&
      entry?.author === 'user' && typeof entry?.text === 'string') : [];
  const submit = async event => {
    event.preventDefault();
    if (!note.trim() || busyRef.current) return;
    const before = ownerContext;
    pendingVisitId.current ||= crypto.randomUUID();
    const visitId = pendingVisitId.current;
    busyRef.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      await saveSessionReturn({
        userId, sessionId: session.id, visitId, note
      });
      if (contextRef.current !== before) return;
      setNote('');
      pendingVisitId.current = null;
      await protectedDraft.current?.clearAfterCommit();
      setNotice('Наблюдение записано. Оно не отправлялось Grok.');
    } catch (failure) {
      if (contextRef.current === before) {
        setError(failure?.message || 'Не удалось записать наблюдение. Текст сохранён.');
      }
      // Keep both the exact text and visit ID for an explicit safe retry.
    } finally {
      busyRef.current = false;
      if (contextRef.current === before) setBusy(false);
    }
  };
  return (
    <section className="reflect-session-return" aria-label="Возвращение к теме">
      <details>
        <summary>Вернуться к теме и записать, что изменилось</summary>
        <p className="reflect-session-return-disclosure">
          Это ваша отдельная запись о результате или наблюдении. Она остаётся
          в сеансе и не передаётся AI автоматически. Ничего не считается выполненным без вашей отметки.
        </p>
        <form onSubmit={submit}>
          <label>Что изменилось с прошлого раза?
            <textarea rows={3} maxLength={1200} value={note} disabled={busy}
              placeholder="Например: прочитал два вечера по 20 минут, один день пропустил…"
              onChange={event => {
                setNote(event.target.value);
                pendingVisitId.current = null;
                setError(''); setNotice('');
              }}/>
          </label>
          <button type="submit" disabled={busy || !note.trim()}>
            {busy ? 'Записываем…' : 'Сохранить наблюдение'}
          </button>
          <ProtectedDraftControls compact ref={protectedDraft} userId={userId}
            surface={`session-return-${session.id}`}
            value={{ text: note }}
            onRestore={draft => setNote(typeof draft?.text === 'string' ? draft.text : '')}/>
        </form>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {entries.length > 0 && (
          <div className="reflect-session-return-history">
            <strong>Подтверждённые записи ({entries.length})</strong>
            {entries.map(entry => (
              <article key={entry.id} className="reflect-session-return-entry">
                <small>Ваше наблюдение · время устройства: {formatDay(entry.recordedAtClient)}</small>
                <p>{entry.text}</p>
              </article>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}
