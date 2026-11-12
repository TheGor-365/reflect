import React, { useEffect, useRef, useState } from 'react';
import {
  GATE5_SESSION_ID, GATE5_SESSION_TITLE, gate5PreviewQaUiEnabled,
  gate5SafeError, runGate5PreviewAudit
} from '../../api/stagingPreviewGate5Audit';
import {
  prepareGate5Fixture, auditGate5PrivateEntitlement
} from '../../api/stagingGate5Fixture';

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
  onRevokeAttempt, onRevokeFinished
}) {
  const [armed, setArmed] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [privateStatus, setPrivateStatus] = useState('');
  const [privateBusy, setPrivateBusy] = useState(false);
  const [fixtureArmed, setFixtureArmed] = useState(false);
  const [fixtureBusy, setFixtureBusy] = useState(false);
  const [fixtureStatus, setFixtureStatus] = useState('');
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
    setPrivateStatus('');
    setPrivateBusy(false);
    setFixtureArmed(false);
    setFixtureBusy(false);
    setFixtureStatus('');
    setResults({});
    setError('');
    return () => {
      generation.current += 1;
      ongoing.current?.abort();
      ongoing.current = null;
    };
  }, [userId, grants, loaded]);

  async function verifyPrivateRules() {
    if (!gate5PreviewQaUiEnabled || !userId || busy || fixtureBusy ||
        privateBusy || disabled) return;
    const ownerGeneration = generation.current;
    setPrivateBusy(true);
    setPrivateStatus('');
    setFixtureArmed(false);
    try {
      const state = await auditGate5PrivateEntitlement(userId);
      if (generation.current !== ownerGeneration) return;
      setPrivateStatus(state);
    } catch {
      if (generation.current === ownerGeneration) setPrivateStatus('unavailable');
    } finally {
      if (generation.current === ownerGeneration) setPrivateBusy(false);
    }
  }

  async function createFixture() {
    if (!gate5PreviewQaUiEnabled || !userId || !fixtureArmed ||
        privateStatus !== 'denied' || privateBusy || fixtureBusy ||
        busy || disabled) return;
    const ownerGeneration = generation.current;
    setFixtureBusy(true);
    setFixtureStatus('');
    try {
      const outcome = await prepareGate5Fixture(userId);
      if (generation.current !== ownerGeneration) return;
      setFixtureStatus(outcome === 'created'
        ? 'Синтетический сеанс создан только в вашем аккаунте. Обновите список сеансов или страницу. Разрешение и доступ к AI не созданы.'
        : 'Точный синтетический сеанс уже существует. Ничего не перезаписано.');
      setFixtureArmed(false);
    } catch (failure) {
      if (generation.current !== ownerGeneration) return;
      const safe = ['fixture-disabled', 'fixture-account-not-ready',
        'fixture-id-collision', 'fixture-owner-changed',
        'fixture-write-unavailable'].includes(failure?.message)
        ? failure.message : 'fixture-write-unavailable';
      setFixtureStatus('Создание остановлено (' + safe +
        '). Права доступа не менялись.');
    } finally {
      if (generation.current === ownerGeneration) setFixtureBusy(false);
    }
  }

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
    !disabled && !busy && !fixtureBusy && armed;
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
        if (kind === 'revoke-deny') {
          setRevokeArmed(false);
          onRevokeFinished?.();
        }
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
      {!fixturePresent && (
        <div className="reflect-context-consent-controls">
          <p>Для этого аккаунта пока нет точного синтетического сеанса
            «{GATE5_SESSION_TITLE}». Подготовка возможна только вручную,
            без Grok и без изменения чужих или существующих записей.</p>
          <button type="button" disabled={disabled || !!busy ||
              privateBusy || fixtureBusy} onClick={verifyPrivateRules}>
            Проверить защиту приватного реестра
          </button>
          {privateStatus === 'denied' &&
            <p role="status">PASS: браузеру запрещено читать приватный реестр.
              Это предварительная проверка, не полный аудит Rules.</p>}
          {privateStatus === 'unsafe-readable' &&
            <p role="alert">STOP: приватный реестр доступен из браузера.
              Не создавайте тестовые разрешения. Требуется аудит Rules.</p>}
          {privateStatus === 'unavailable' &&
            <p role="alert">Проверка приватного реестра не завершена.
              Не создавайте тестовые разрешения.</p>}
          <label className="reflect-context-consent-confirm">
            <input type="checkbox" checked={fixtureArmed}
              disabled={privateStatus !== 'denied' || privateBusy ||
                disabled || !!busy || fixtureBusy}
              onChange={event => setFixtureArmed(event.target.checked)}/>
            Я сейчас в отдельном тестовом аккаунте Jack и разрешаю
            создать один синтетический сеанс с фиксированным ID.
          </label>
          <button type="button" disabled={!fixtureArmed ||
              privateStatus !== 'denied' || privateBusy || fixtureBusy ||
              !!busy || disabled} onClick={createFixture}>
            Создать синтетический сеанс (без AI)
          </button>
          {fixtureStatus && <p role="status">{fixtureStatus}</p>}
        </div>
      )}
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
