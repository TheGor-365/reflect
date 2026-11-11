import React, { useEffect, useRef, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  CONTEXT_CONSENT_VERSION, CONTEXT_SCOPE,
  contextConsentUiEnabled, requestContextConsent
} from '../../api/contextConsentService';
import ContextPreviewPanel from './ContextPreviewPanel';
import StagingPreviewGate5AuditPanel from './StagingPreviewGate5AuditPanel';

/**
 * Owner-visible consent management ONLY. Session titles come from the
 * already owner-scoped app state; no session transcript goes to the server.
 * These grants are NOT consumed by Grok yet.
 */
export default function ContextConsentPanel({ userId, sessions = [] }) {
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [grants, setGrants] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // A separate QA harness may revoke a grant without updating this list.
  // Invalidate cached permissions immediately; never show a stale grant as active.
  const [auditRevokePending, setAuditRevokePending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setSelected('');
    setConfirmed(false);
    setGrants([]);
    setLoaded(false);
    setAuditRevokePending(false);
    setBusy(false);
    setMessage('');
  }, [userId]);

  const choices = sessions.filter(s => typeof s?.id === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(s.id)).slice(0, 100);

  const call = async (payload, action) => {
    if (!contextConsentUiEnabled || !userId || busy ||
        (auditRevokePending && action !== 'list')) return;
    const ownerGeneration = generation.current;
    setBusy(true); setMessage('');
    try {
      const result = await requestContextConsent(payload);
      if (generation.current !== ownerGeneration) return;
      if (action === 'list') {
        setGrants(result.grants);
        setLoaded(true);
        setAuditRevokePending(false);
        setMessage('Список действующих разрешений обновлён.');
      } else {
        // Refresh from server rather than assuming a grant was committed.
        const current = await requestContextConsent({ action: 'list' });
        if (generation.current !== ownerGeneration) return;
        // A successful write/revoke response alone is not enough to show
        // success. Re-check exactly this grant on the authenticated server.
        const serverGrants = current.grants;
        if (!Array.isArray(serverGrants)) {
          throw new Error('consent-unavailable');
        }
        if (action === 'grant' && !serverGrants.some(g =>
          g.grantId === payload.grantId &&
          g.sourceId === payload.sourceId &&
          g.scope === CONTEXT_SCOPE &&
          Number.isSafeInteger(g.expiresAtMs) &&
          g.expiresAtMs > Date.now())) {
          throw new Error('grant-readback-mismatch');
        }
        if (action === 'revoke' && serverGrants.some(g =>
          g.grantId === payload.grantId)) {
          throw new Error('revoke-readback-mismatch');
        }
        setGrants(serverGrants);
        setLoaded(true);
        setConfirmed(false);
        setMessage(action === 'grant'
          ? 'Разрешение подтверждено сервером на 15 минут. Передача истории в Grok ещё выключена.'
          : 'Отзыв доступа подтверждён сервером. История в Grok не передавалась.');
      }
    } catch (error) {
      if (generation.current !== ownerGeneration) return;
      setMessage('Не удалось подтвердить операцию (код: ' +
        (['unauthenticated', 'reauthentication-required', 'permission-denied',
          'not-found', 'already-exists', 'resource-exhausted', 'invalid-argument',
          'unavailable', 'consent-unavailable', 'grant-readback-mismatch',
          'revoke-readback-mismatch'].includes(error?.message)
          ? error.message : 'consent-unavailable') +
        '). Проверьте действующие разрешения: операция могла выполниться, даже если подтверждение не удалось.');
      // On ambiguous errors do not imply grant or revoke succeeded.
      setLoaded(false);
      setGrants([]);
    } finally {
      if (generation.current === ownerGeneration) setBusy(false);
    }
  };

  const grant = () => {
    if (auditRevokePending || !selected || !confirmed ||
        !choices.some(s => s.id === selected) ||
        !globalThis.crypto?.randomUUID) return;
    call({
      action: 'grant', grantId: globalThis.crypto.randomUUID(),
      scope: CONTEXT_SCOPE, sourceId: selected,
      consentVersion: CONTEXT_CONSENT_VERSION
    }, 'grant');
  };

  return (
    <section className="reflect-ai-settings-card reflect-context-consent"
      aria-label="Разрешения на историю">
      <div className="reflect-ai-settings-card-title">
        <LockKeyhole size={19} aria-hidden="true"/>
        <h3>Контекст и доступ к истории</h3>
      </div>
      <p className="reflect-context-consent-intro">
        <ShieldCheck size={16} aria-hidden="true"/>
        По умолчанию доступ закрыт. Можно разрешить только один конкретный
        сохранённый сеанс на 15 минут и отозвать доступ в любое время.
        Даже после выдачи разрешения Grok пока не читает историю.
      </p>
      {!contextConsentUiEnabled ? (
        <p role="status" className="reflect-context-consent-off">
          Управление разрешениями ещё не включено на этом сервере.
          Никакие данные истории не отправляются в AI.
        </p>
      ) : (
        <div className="reflect-context-consent-controls">
          <label htmlFor="reflect-consent-source">Выберите сохранённый сеанс</label>
          <select id="reflect-consent-source" value={selected}
            disabled={busy || auditRevokePending}
            onChange={event => { setSelected(event.target.value); setConfirmed(false); }}>
            <option value="">Не выбран</option>
            {choices.map(s => <option key={s.id} value={s.id}>
              {String(s.title || 'Сеанс без названия').slice(0, 90)}
            </option>)}
          </select>
          <label className="reflect-context-consent-confirm">
            <input type="checkbox" checked={confirmed} disabled={busy || auditRevokePending || !selected}
              onChange={event => setConfirmed(event.target.checked)}/>
            Я разрешаю доступ только к выбранному сеансу на 15 минут.
          </label>
          <div className="reflect-context-consent-actions">
            <button type="button" disabled={busy || auditRevokePending || !selected || !confirmed}
              onClick={grant}>Разрешить на 15 минут</button>
            <button type="button" disabled={busy}
              onClick={() => call({ action: 'list' }, 'list')}>Проверить разрешения</button>
          </div>
          {message && <p role="status" className="reflect-context-consent-message">{message}</p>}
          {auditRevokePending && loaded && <p role="alert">
            После запуска QA-отзыва список разрешений может быть устаревшим.
            Для подтверждения текущего состояния нажмите «Проверить разрешения».
            До обновления выдача и использование разрешений заблокированы.
          </p>}
          {loaded && !auditRevokePending && (grants.length ? (
            <ul className="reflect-context-consent-grants">
              {grants.map(g => {
                const title = choices.find(s => s.id === g.sourceId)?.title ||
                  'Сохранённый сеанс';
                return <li key={g.grantId}>
                  <span>{String(title).slice(0, 90)} · до {new Date(g.expiresAtMs).toLocaleTimeString('ru-RU')}</span>
                  <button type="button" disabled={busy}
                    onClick={() => call({ action: 'revoke', grantId: g.grantId }, 'revoke')}>
                    Отозвать
                  </button>
                </li>;
              })}
            </ul>
          ) : <p role="status">Действующих разрешений нет.</p>)}
          <ContextPreviewPanel userId={userId} grants={grants}
            loaded={loaded} disabled={busy || auditRevokePending} choices={choices}/>
          <StagingPreviewGate5AuditPanel userId={userId} grants={grants}
            loaded={loaded} disabled={busy || auditRevokePending} choices={choices}
            onRevokeAttempt={() => setAuditRevokePending(true)}/>
        </div>
      )}
    </section>
  );
}
