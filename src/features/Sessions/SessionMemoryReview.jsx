import React, { useEffect, useRef, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { requestContextConsent, CONTEXT_SCOPE } from '../../api/contextConsentService';
import {
  sessionMemoryPreviewUiEnabled, requestSessionMemoryPreview
} from '../../api/sessionMemoryPreviewService';

/**
 * M3d.2a: owner-driven, preview-only inspector. Never sends any transcript
 * to Grok and never writes an external-dispatch approval. Existing one-message
 * composer remains the only SEND pathway.
 */
export default function SessionMemoryReview({
  sessionId, userId, draftMessage = '', disabled = false
}) {
  const [grant, setGrant] = useState(null);
  const [preview, setPreview] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);

  useEffect(() => {
    generation.current++;
    setGrant(null); setPreview(null); setAcknowledged(false);
    setBusy(false); setNotice('');
  }, [userId, sessionId, draftMessage]);

  if (!sessionMemoryPreviewUiEnabled || !userId || !sessionId) return null;

  const bytes = new TextEncoder().encode(draftMessage.trim()).length;
  const draftReady = bytes > 0 && bytes <= 2000;
  const safeGrant = grant && grant.sourceId === sessionId &&
    grant.scope === CONTEXT_SCOPE && grant.expiresAtMs > Date.now();
  const canInteract = !disabled && !busy;
  const failMessage = 'Просмотр не подтверждён. Разрешение могло истечь или быть отозвано. ' +
    'Проверьте его заново; история не отправлялась в Grok.';

  const refreshGrant = async () => {
    if (!canInteract) return;
    const marker = generation.current;
    setGrant(null); setPreview(null); setAcknowledged(false);
    setBusy(true); setNotice('');
    try {
      const result = await requestContextConsent({ action: 'list' });
      if (marker !== generation.current) return;
      const valid = (result.grants || []).filter(item =>
        item.sourceId === sessionId && item.scope === CONTEXT_SCOPE &&
        Number.isSafeInteger(item.expiresAtMs) && item.expiresAtMs > Date.now()
      ).sort((a,b) => a.expiresAtMs - b.expiresAtMs);
      if (!valid.length) {
        setNotice('Действующего разрешения на эту беседу нет. ' +
          'Выдайте его в «Настройках AI → Контекст и доступ к истории».');
      } else {
        setGrant(valid[0]);
        setNotice('Разрешение найдено. Просмотр выбранных фрагментов требует отдельного нажатия.');
      }
    } catch { if (marker === generation.current) setNotice(failMessage); }
    finally { if (marker === generation.current) setBusy(false); }
  };

  const inspect = async () => {
    if (!canInteract || !draftReady || !safeGrant) return;
    const marker = generation.current;
    const requestId = globalThis.crypto?.randomUUID?.();
    if (!requestId) { setNotice('Предпросмотр на этом устройстве недоступен.'); return; }
    setBusy(true); setPreview(null); setAcknowledged(false); setNotice('');
    try {
      const result = await requestSessionMemoryPreview({
        grantId: grant.grantId, sourceId: sessionId, requestId,
        message: draftMessage.trim()
      });
      if (marker !== generation.current) return;
      setPreview(result);
      setNotice('Выдержки получены только с сервера Reflect. В Grok они не отправлялись.');
    } catch { if (marker === generation.current) setNotice(failMessage); }
    finally { if (marker === generation.current) setBusy(false); }
  };

  return (
    <details className="reflect-evidence-ledger reflect-memory-review"
      aria-label="Просмотр истории перед отправкой">
      <summary><ShieldCheck size={17} aria-hidden="true"/>
        Контекст текущей беседы — отдельное разрешение</summary>
      <div className="reflect-evidence-ledger-content">
        <p>Для просмотра выдержек нужно выдать разрешение на конкретный сеанс
          в настройках AI. Сначала мы проверим его на сервере. Текст текущего
          черновика при просмотре передаётся только на сервер Reflect, не в Grok.</p>
        <p><LockKeyhole size={15} aria-hidden="true"/>
          <strong>Это предварительный просмотр, не разрешение передать историю в xAI.</strong>
          В текущем режиме кнопка «Отправить» по-прежнему передаёт Grok
          только текст поля ввода; история автоматически не прикладывается.</p>
        <div className="reflect-memory-review-actions">
          <button type="button" disabled={!canInteract}
            onClick={refreshGrant}>Проверить разрешение</button>
          <button type="button" onClick={inspect}
            disabled={!canInteract || !draftReady || !safeGrant}>
            Посмотреть до четырёх реплик
          </button>
        </div>
        {!draftReady && <p>Чтобы проверить контекст, сначала напишите
          сообщение в поле ввода (не больше 2000 байт).</p>}
        {notice && <p role="status">{notice}</p>}
        {preview && safeGrant && (
          <section aria-label="Просмотр разрешённой истории">
            <p>Источники: {preview.turns.length} ·
              объём {preview.totalBytes} байт.
              {preview.truncated ? ' Некоторые фрагменты сокращены.' : ''}</p>
            <ol className="reflect-memory-review-turns">
              {preview.turns.map(turn => (
                <li key={turn.sourceTurnId}>
                  <strong>{turn.role === 'user' ? 'Ваше сообщение' : 'Ответ Reflect'}</strong>
                  <p>{turn.content}</p>
                  {turn.truncated && <small>Фрагмент сокращён</small>}
                </li>
              ))}
            </ol>
            <label><input type="checkbox"
              checked={acknowledged}
              onChange={event => setAcknowledged(event.target.checked)} />
              Я ознакомился с показанными фрагментами. Это пока не разрешение
              отправить их в Grok.
            </label>
            {acknowledged && <p role="status">
              Просмотр отмечен только на этом экране. Передача истории
              провайдеру останется запрещена, пока не будет реализован
              отдельный подтверждаемый запрос.</p>}
            <button type="button" onClick={() => {
              setPreview(null); setAcknowledged(false);
            }}>Скрыть просмотр</button>
          </section>
        )}
      </div>
    </details>
  );
}
