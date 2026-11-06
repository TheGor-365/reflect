import React, {
  forwardRef, useEffect, useImperativeHandle, useRef, useState
} from 'react';
import { CheckCircle2, KeyRound, LockKeyhole, ShieldAlert, Trash2 } from 'lucide-react';
import {
  discardProtectedDraft, openProtectedDraft, protectedDraftExists
} from '../../security/protectedDraft';

/**
 * Optional encrypted draft; not a substitute for server-confirmed persistence.
 * The user supplies a separate phrase in each tab. No plaintext or CryptoKey
 * is stored in localStorage. All saves are serialized and checked for conflicts.
 */
const ProtectedDraftControls = forwardRef(function ProtectedDraftControls({
  userId, surface, value, onRestore
}, ref) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [editingPhrase, setEditingPhrase] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('off');
  const [error, setError] = useState('');
  const controllerRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const timerRef = useRef(null);
  const scopeRef = useRef({ userId, surface });
  scopeRef.current = { userId, surface };

  useEffect(() => {
    clearTimeout(timerRef.current);
    controllerRef.current = null;
    queueRef.current = Promise.resolve();
    setEnabled(false);
    setEditingPhrase(false);
    setPhrase('');
    setError('');
    setStatus('off');
    try { setAvailable(protectedDraftExists(userId, surface)); }
    catch { setAvailable(false); }
    return () => {
      clearTimeout(timerRef.current);
      controllerRef.current = null;
    };
  }, [userId, surface]);

  useEffect(() => {
    if (!enabled || !controllerRef.current) return;
    const active = controllerRef.current;
    const uid = userId;
    const draftSurface = surface;
    clearTimeout(timerRef.current);
    setStatus('pending');
    timerRef.current = setTimeout(() => {
      // A previous write may be encrypting; serialize updates so an older
      // result cannot win over a newer edit in the same tab.
      queueRef.current = queueRef.current.then(async () => {
        if (controllerRef.current !== active ||
            scopeRef.current.userId !== uid ||
            scopeRef.current.surface !== draftSurface) return;
        setStatus('saving');
        await active.write({ title: value.title || '', text: value.text || '' });
        if (controllerRef.current === active) {
          setStatus('saved');
          setAvailable(true);
          setError('');
        }
      }).catch(failure => {
        if (controllerRef.current === active) {
          setStatus('error');
          setError(failure?.message || 'Не удалось зашифровать локальный черновик.');
        }
      });
    }, 350);
    return () => clearTimeout(timerRef.current);
  }, [value?.title, value?.text, enabled, userId, surface]);

  useImperativeHandle(ref, () => ({
    async clearAfterCommit() {
      clearTimeout(timerRef.current);
      const old = controllerRef.current;
      controllerRef.current = null;
      setEnabled(false);
      setStatus('off');
      if (!old) return;
      await queueRef.current.catch(() => undefined);
      try {
        old.discard();
        setAvailable(false);
        setError('');
      } catch (failure) {
        // Firestore save already succeeded. Keep encrypted copy if another
        // tab has changed it; never silently delete the other tab's draft.
        setAvailable(true);
        setError(failure?.message || 'Локальный черновик не удалён.');
      }
    }
  }), []);

  const unlock = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { userId: owner, surface: area } = scopeRef.current;
      const handle = await openProtectedDraft({
        uid: owner, surface: area, passphrase: phrase
      });
      if (scopeRef.current.userId !== owner || scopeRef.current.surface !== area) return;
      if (handle.recovered) {
        if ((value.text || value.title) &&
            !window.confirm('В форме есть текст. Заменить его восстановленным черновиком?')) {
          return;
        }
        onRestore(handle.recovered);
      }
      controllerRef.current = handle;
      queueRef.current = Promise.resolve();
      setEnabled(true);
      setEditingPhrase(false);
      setPhrase('');
      setStatus('pending');
    } catch (failure) {
      setError(failure?.message || 'Не удалось открыть защищённый черновик.');
    } finally {
      setBusy(false);
    }
  };

  const deleteLocal = () => {
    if (!window.confirm('Удалить только локальную зашифрованную копию? Текст в форме останется.')) return;
    clearTimeout(timerRef.current);
    controllerRef.current = null;
    setEnabled(false);
    try {
      discardProtectedDraft(userId, surface);
      setAvailable(false);
      setStatus('off');
      setError('');
    } catch (failure) {
      setError(failure?.message || 'Не удалось удалить локальную копию.');
    }
  };

  return (
    <section className="reflect-protected-draft" aria-label="Защищённый локальный черновик">
      <div className="reflect-protected-draft-heading">
        <LockKeyhole size={17} aria-hidden="true"/>
        <strong>Защищённый черновик</strong>
        {enabled && status === 'saved' && <CheckCircle2 size={17} aria-hidden="true" />}
      </div>
      <p className="reflect-protected-draft-help">
        По желанию: шифрование AES-GCM на этом устройстве. Ключ из отдельной фразы
        не сохраняется. В другом браузере черновик не появится.
      </p>

      {!enabled && !editingPhrase && (
        <div className="reflect-protected-draft-actions">
          <button type="button" onClick={() => setEditingPhrase(true)}>
            <KeyRound size={15} aria-hidden="true" />
            {available ? 'Восстановить локальный черновик' : 'Включить шифрование черновика'}
          </button>
          {available && <button type="button" onClick={deleteLocal} aria-label="Удалить локальную зашифрованную копию">
            <Trash2 size={15} aria-hidden="true"/> Удалить копию
          </button>}
        </div>
      )}

      {editingPhrase && (
        <form className="reflect-protected-draft-unlock" onSubmit={unlock}>
          <label htmlFor={'reflect-draft-phrase-' + surface.replace(/[^a-z0-9]/gi, '-')}>
            {available ? 'Фраза для восстановления' : 'Новая фраза для шифрования'}
          </label>
          <input
            id={'reflect-draft-phrase-' + surface.replace(/[^a-z0-9]/gi, '-')}
            type="password" autoComplete="new-password" minLength={12}
            required value={phrase} disabled={busy}
            placeholder="Минимум 12 символов" onChange={event => setPhrase(event.target.value)}
          />
          <div className="reflect-protected-draft-actions">
            <button type="submit" disabled={busy || phrase.length < 12}>
              {busy ? 'Проверка шифрования…' : available ? 'Расшифровать' : 'Включить'}
            </button>
            <button type="button" disabled={busy} onClick={() => {
              setEditingPhrase(false); setPhrase(''); setError('');
            }}>Отмена</button>
          </div>
          <p className="reflect-protected-draft-help">
            Не используйте пароль Firebase. Если потеряете эту фразу, локальный
            черновик нельзя будет расшифровать.
          </p>
        </form>
      )}

      {enabled && (
        <div className="reflect-protected-draft-actions">
          <p role="status" className="reflect-protected-draft-state">
            {status === 'saved' ? 'Черновик зашифрован и сохранён на устройстве.' :
              status === 'error' ? 'Не удалось сохранить локальную копию.' :
                'Шифруем изменения… Не закрывайте вкладку до подтверждения.'}
          </p>
          <button type="button" onClick={deleteLocal}><Trash2 size={15} aria-hidden="true"/> Удалить копию</button>
        </div>
      )}
      {error && <p className="reflect-protected-draft-error" role="alert">
        <ShieldAlert size={15} aria-hidden="true" /> {error}
      </p>}
    </section>
  );
});

export default ProtectedDraftControls;
