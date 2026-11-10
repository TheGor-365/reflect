import React, { useEffect, useRef, useState } from 'react';
import { Eye, LockKeyhole } from 'lucide-react';
import { CONTEXT_SCOPE } from '../../api/contextConsentService';
import {
  contextPreviewUiEnabled, requestContextPreview
} from '../../api/contextPreviewService';

const SAFE_CODES = [
  'invalid-argument', 'unauthenticated', 'reauthentication-required',
  'permission-denied', 'not-found', 'resource-exhausted', 'unavailable',
  'invalid-session-history', 'invalid-preview-quota', 'preview-unavailable'
];

/**
 * AI-01K: two independent user actions:
 * 1. request server preview for a selected *active* grant
 * 2. acknowledge exact displayed bytes LOCALLY, without network/persistence.
 * A future xAI send MUST ask for new explicit consent and re-check the grant.
 */
export default function ContextPreviewPanel({
  userId, grants = [], loaded = false, disabled = false, choices = []
}) {
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState(null);
  const [checked, setChecked] = useState(false);
  const [approvedHash, setApprovedHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const generation = useRef(0);

  // A list refresh, account change or grant revoke invalidates all previews
  // and local confirmation. Do not display a stale preview after revocation.
  useEffect(() => {
    generation.current += 1;
    setSelected('');
    setPreview(null);
    setChecked(false);
    setApprovedHash('');
    setBusy(false);
    setErrorCode('');
  }, [userId, grants, loaded]);

  if (!contextPreviewUiEnabled) return null;
  const active = grants.filter(g =>
    g && typeof g.grantId === 'string' &&
    typeof g.sourceId === 'string' &&
    g.scope === CONTEXT_SCOPE &&
    Number.isSafeInteger(g.expiresAtMs) &&
    g.expiresAtMs > Date.now()
  );
  const sourceTitle = sourceId => {
    const source = choices.find(s => s.id === sourceId);
    return typeof source?.title === 'string' && source.title
      ? source.title.slice(0, 90) : 'Сохранённый сеанс';
  };

  const selectedGrant = active.find(g => g.grantId === selected);
  const clear = () => {
    generation.current += 1;
    setPreview(null);
    setChecked(false);
    setApprovedHash('');
    setErrorCode('');
    setBusy(false);
  };

  const load = async () => {
    if (!userId || disabled || busy || !selectedGrant) return;
    const marker = generation.current;
    const grant = selectedGrant;
    setBusy(true); setPreview(null); setChecked(false);
    setApprovedHash(''); setErrorCode('');
    try {
      const result = await requestContextPreview({
        grantId: grant.grantId, sourceId: grant.sourceId, scope: CONTEXT_SCOPE
      });
      if (marker !== generation.current) return;
      if (grant.expiresAtMs <= Date.now() || result.sourceId !== grant.sourceId ||
          active.find(g => g.grantId === grant.grantId)?.sourceId !== grant.sourceId) {
        throw new Error('permission-denied');
      }
      setPreview({ ...result, grantId: grant.grantId, expiresAtMs: grant.expiresAtMs });
    } catch (error) {
      if (marker !== generation.current) return;
      setErrorCode(SAFE_CODES.includes(error?.message)
        ? error.message : 'preview-unavailable');
    } finally {
      if (marker === generation.current) setBusy(false);
    }
  };

  const confirm = () => {
    if (!preview || !checked || busy ||
        preview.grantId !== selectedGrant?.grantId ||
        preview.sourceId !== selectedGrant?.sourceId ||
        preview.expiresAtMs <= Date.now()) return;
    setApprovedHash(preview.previewHash);
  };

  return (
    <section className="reflect-context-preview" aria-label="Просмотр контекста сеанса">
      <div className="reflect-ai-settings-card-title">
        <Eye size={19} aria-hidden="true"/>
        <h4>Предварительный просмотр для Grok</h4>
      </div>
      <p>
        Только по вашему запросу сервер показывает ограниченный фрагмент
        действующего разрешённого сеанса. Текст поступает в этот браузер,
        но <strong>не передаётся в Grok</strong>.
      </p>
      {!loaded ? (
        <p role="status">Сначала нажмите «Проверить разрешения» выше.</p>
      ) : active.length === 0 ? (
        <p role="status">Действующих разрешений для просмотра нет.</p>
      ) : (
        <>
          <label htmlFor="reflect-context-preview-select">
            Выберите один разрешённый сеанс
          </label>
          <select id="reflect-context-preview-select" value={selected}
            disabled={busy || disabled}
            onChange={e => {
              clear(); setSelected(e.target.value);
            }}>
            <option value="">Не выбран</option>
            {active.map(g =>
              <option key={g.grantId} value={g.grantId}>
                {sourceTitle(g.sourceId)}
              </option>)}
          </select>
          <div className="reflect-context-consent-actions">
            <button type="button" disabled={busy || disabled || !selectedGrant}
              onClick={load}>
              {busy ? 'Загружаем фрагмент…' : 'Показать точный фрагмент'}
            </button>
            <button type="button" disabled={!preview && !errorCode}
              onClick={clear}>Очистить просмотр</button>
          </div>
          {errorCode && <p role="alert">
            Просмотр недоступен (код: {errorCode}). Новых разрешений не создано.
          </p>}
          {preview && (
            <div className="reflect-context-preview-result">
              <p role="status">
                {preview.turns.length} сообщений, {preview.totalBytes} байт,
                всего в сеансе {preview.sourceTurnCount}.
                {preview.truncated ? ' Часть истории обрезана по лимиту.' : ''}
              </p>
              <ol className="reflect-context-preview-turns">
                {preview.turns.map((turn, i) => (
                  <li key={i}>
                    <strong>{turn.role === 'user' ? 'Сообщение пользователя' : 'Ответ Reflect AI'}</strong>
                    <pre>{turn.content}</pre>
                    {turn.truncated && <small>Это сообщение обрезано.</small>}
                  </li>
                ))}
              </ol>
              <p className="reflect-context-preview-disclosure">
                Выше показаны точные символы и порядок фрагмента, который
                *может быть предложен* будущему AI-запросу. Формат и
                стоимость будущей отправки ещё не согласованы.
                Текст может содержать личные сведения — проверьте его.
              </p>
              <label className="reflect-context-consent-confirm">
                <input type="checkbox" checked={checked}
                  onChange={e => {
                    setChecked(e.target.checked);
                    setApprovedHash('');
                  }} disabled={busy}/>
                Я прочитал именно этот фрагмент и понимаю, что при будущей
                отдельной отправке он может попасть третьей стороне (xAI).
              </label>
              <button type="button" disabled={!checked || busy || !!approvedHash ||
                  preview.expiresAtMs <= Date.now()}
                onClick={confirm}>
                Подтвердить состав (без отправки)
              </button>
              {approvedHash === preview.previewHash && (
                <p role="status" className="reflect-context-preview-verified">
                  Состав фрагмента подтверждён только в этом окне.
                  Никакой отправки в Grok не произошло. Для будущей передачи
                  потребуется отдельное новое подтверждение.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
