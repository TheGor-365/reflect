import React, { useEffect, useRef, useState } from 'react';
import {
  GATE5_SESSION_ID, GATE5_SESSION_TITLE, gate5PreviewQaUiEnabled,
  gate5SafeError, runGate5PreviewAudit
} from '../../api/stagingPreviewGate5Audit';

const EXPECTED = Object.freeze({
  replay: '200 → 401',
  'cross-route': '200 → 401 → 200 → 401',
  'revoke-deny': '200 → 200 → 200 → 403'
});

/**
 * Temporary staging QA only. Not a product feature.
 * Controls are explicit; no automatic grant, preview, revoke, or Grok traffic.
 * Results are numeric HTTP codes only, never headers, tokens, IDs, or history.
 */
export default function StagingPreviewGate5AuditPanel({
  userId, grants = [], choices = [], disabled = false, loaded = false,
  onRevokeAttempt
}) {
  const [armed, setArmed] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState({});
  const [error, setError] = useState('');
  const generation = useRef(0);
  const ongoing = useRef(null);

  useEffect(() => {
    generation.current += 1;
    ongoing.current?.abort();
    ongoing.current = null;
    setArmed(false);
    setRevokeArmed(false);
    setBusy('');
    setResults({});
    setError('');
    return () => {
      generation.current += 1;
      ongoing.current?.abort();
      ongoing.current = null;
    };
  }, [userId, grants, loaded]);

  if (!gate5PreviewQaUiEnabled || !userId) return null;
  // The fixture must exist in the owner's loaded session choices with exact title.
  // Never allow diagnostics to target diary, goals or arbitrary sessions.
  const fixturePresent = choices.some(s => s.id === GATE5_SESSION_ID &&
    s.title === GATE5_SESSION_TITLE);
  const active = grants.filter(g => g?.sourceId === GATE5_SESSION_ID &&
    g.scope === 'session-turns' && Number.isSafeInteger(g.expiresAtMs) &&
    g.expiresAtMs > Date.now());
  // Duplicate grants have distinct grantIds: require owner to disambiguate
  // with the existing per-grant revoke UI instead of selecting implicitly.
  const ready = loaded && fixturePresent && active.length === 1 &&
    !disabled && !busy && armed;
  const expectedGrant = active.length === 1 ? active[0] : null;

  async function run(kind) {
    if (!ready || results[kind] || !expectedGrant ||
        (kind === 'revoke-deny' && !revokeArmed)) return;
    const marker = generation.current;
    const controller = new AbortController();
    ongoing.current = controller;
    // A revoke may commit even if the receipt/readback fails. The parent
    // must withhold its old grant list until a fresh signed list succeeds.
    if (kind === 'revoke-deny') onRevokeAttempt?.();
    setBusy(kind);
    setError('');
    try {
      const result = await runGate5PreviewAudit({
        kind, ownerUid: userId, grantId: expectedGrant.grantId,
        sourceId: GATE5_SESSION_ID, signal: controller.signal
      });
      if (marker !== generation.current || controller.signal.aborted) return;
      setResults(previous => ({ ...previous, [kind]: result }));
    } catch (failure) {
      if (marker !== generation.current || controller.signal.aborted) return;
      setError(gate5SafeError(failure));
    } finally {
      if (marker === generation.current) {
        ongoing.current = null;
        setBusy('');
        if (kind === 'revoke-deny') setRevokeArmed(false);
      }
    }
  }

  return (
    <section className="reflect-ai-settings-card reflect-staging-security-audit"
      aria-label="AI-01K Gate 5: синтетическая диагностика">
      <div className="reflect-ai-settings-card-title">
        <h4>Gate 5 · контроль Preview (staging)</h4>
      </div>
      <p>Ручные проверки только существующего сеанса
        «AI-01K Gate 4 Synthetic QA». Результат — только HTTP-коды.
        Ни один тест не вызывает Grok и не создаёт разрешение.
        Каждая успешная проверка Preview расходует один слот квоты 20/час.</p>
      {!loaded && <p role="status">Сначала обновите действующие разрешения.</p>}
      {loaded && !fixturePresent &&
        <p role="status">Синтетический сеанс не найден в списке владельца. Тест заблокирован.</p>}
      {loaded && fixturePresent && active.length !== 1 &&
        <p role="status">Для диагностики нужен ровно один действующий grant
          этого тестового сеанса. Сейчас: {active.length}.
          Создавать его автоматически нельзя; дополнительные разрешения
          можно отозвать отдельно выше.</p>}
      <label className="reflect-context-consent-confirm">
        <input type="checkbox" checked={armed}
          disabled={disabled || !!busy || !loaded || !fixturePresent ||
            active.length !== 1}
          onChange={event => {
            setArmed(event.target.checked);
            setRevokeArmed(false);
          }}/>
        Я выбираю ручную проверку только синтетического сеанса;
        Preview должен быть временно разрешён на сервере отдельно.
      </label>
      <div className="reflect-context-consent-actions">
        <button type="button" disabled={!ready || !!results.replay}
          onClick={() => run('replay')}>Same-token replay</button>
        <button type="button" disabled={!ready || !!results['cross-route']}
          onClick={() => run('cross-route')}>Cross-route replay</button>
      </div>
      <label className="reflect-context-consent-confirm">
        <input type="checkbox" checked={revokeArmed}
          disabled={!ready || !!results['revoke-deny']}
          onChange={event => setRevokeArmed(event.target.checked)}/>
        Я отдельно подтверждаю отзыв ровно одного действующего
        тестового grant. После этого он станет недоступен.
      </label>
      <button type="button" disabled={!ready || !revokeArmed ||
          !!results['revoke-deny']}
        onClick={() => run('revoke-deny')}>Отозвать и проверить прямой отказ 403</button>
      {busy && <p role="status">Выполняется {busy}. Ничего не отправляется в xAI.</p>}
      {error && <p role="alert">Диагностика остановлена: {error}.</p>}
      {Object.entries(results).map(([kind, result]) => (
        <p role={result.passed ? 'status' : 'alert'} key={kind}>
          {kind}: {result.passed ? 'PASS' : 'FAIL'}.
          HTTP: {result.statuses.join(' → ') || 'нет ответа'}.
          Ожидалось: {EXPECTED[kind]}.
        </p>
      ))}
      <p className="reflect-staging-security-audit-note">
        Снимки экрана: только этот блок с кодами, без DevTools Headers/HAR.
        Для live-acceptance нужны отдельные разрешения на Hosting deploy
        и временный Preview ON. Сейчас проверка не запускалась.
      </p>
    </section>
  );
}
