import React, { useState } from 'react';

const service = 'http://127.0.0.1:19107';
const SYNTHETIC_TRIALS = Object.freeze([
  { id: 'reflection', label: 'Зачем записывать мысли',
    preview: 'Чем помогает запись мыслей?' },
  { id: 'priorities', label: 'Планирование дня',
    preview: 'Выбрать первый маленький шаг между вымышленными задачами' },
  { id: 'clarity', label: 'Прояснение мысли',
    preview: 'Один нейтральный вопрос о вымышленном рабочем дне' }
]);

export function formatActualCost(payload) {
  const ticks = payload?.actualUsdTicks;
  const usd = payload?.actualUsd;
  if (!Number.isSafeInteger(ticks) || ticks < 0 ||
      typeof usd !== 'number' || !Number.isFinite(usd) ||
      Math.abs((ticks / 1e10) - usd) > 1e-10) {
    return 'Фактическая стоимость xAI не подтверждена; отсутствие данных не означает $0.';
  }
  return 'Фактическая стоимость xAI: 
const localOnly = typeof window !== 'undefined' &&
  window.location.hostname === '127.0.0.1' &&
  window.location.port === '3100' &&
  import.meta.env.DEV === true &&
  import.meta.env.VITE_ENABLE_XAI_DEV_SMOKE === 'true' &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
  import.meta.env.VITE_APP_ID === 'reflect-8fdc8' &&
  (() => {
    try {
      return JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || '{}')
        .projectId === 'demo-reflect-auth-qa';
    } catch { return false; }
  })();

/**
 * Display only bounded, known error codes and an upstream HTTP status.
 * Never render the provider response body, key, headers or arbitrary payload.
 * The local proxy's 502 is separate from xAI's own non-2xx status.
 */
const SAFE_SMOKE_ERRORS = new Set([
  'xai-http-error',
  'xai-transport-or-response-invalid',
  'provider-response-too-large',
  'one-shot-already-used',
  'key-file-missing-or-unsafe',
  'invalid-payload',
  'intent-denied',
  'origin-denied',
  'not-found'
]);

export function formatSmokeFailure(proxyStatus, payload) {
  const code = SAFE_SMOKE_ERRORS.has(payload?.error) ? payload.error : 'unavailable';
  const providerStatus = payload?.providerHttpStatus;
  const upstream = code === 'xai-http-error' &&
    Number.isInteger(providerStatus) &&
    providerStatus >= 100 && providerStatus <= 599 &&
    (providerStatus < 200 || providerStatus >= 300)
    ? ' Статус xAI upstream: HTTP ' + providerStatus + '.'
    : '';
  return 'Тест не выполнен (' + code + '). Локальный proxy: HTTP ' +
    proxyStatus + '.' + upstream +
    ' Повторный платный запрос не запускается автоматически.';
}

/**
 * LOCAL DEVELOPMENT DIAGNOSTIC ONLY:
 * - Does not read or send the user's text, journals, profile, session or UID.
 * - Only a fixed synthetic prompt is sent by localhost-only Node backend.
 * - Never exposes the xAI key; does not persist a response to Firestore.
 * - Does not make the ordinary Sessions send button available.
 */
export default function XaiDevSmoke() {
  const [approved, setApproved] = useState(false);
  const [scenario, setScenario] = useState('reflection');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState(null);
  if (!localOnly) return null;

  const handleTest = async () => {
    if (!approved || busy || tried) return;
    setBusy(true);
    setTried(true);
    setResult(null);
    try {
      const response = await fetch(service + '/smoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reflect-Smoke': 'explicit-one-shot'
        },
        body: JSON.stringify({ confirm: 'synthetic-only', scenario }),
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) {
        setResult({ error: formatSmokeFailure(response.status, payload) });
        return;
      }
      setResult({ success: payload });
    } catch {
      setResult({
        error: 'Локальный сервер xAI недоступен. Данные дневника никуда не отправлялись.'
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="reflect-xai-local-diagnostic">
      <summary>Пробный AI-сеанс · реальный Grok 4.3 (локально)</summary>
      <div className="reflect-xai-local-diagnostic-body">
        <p>Выберите один из трёх безопасных примеров. Отправляется только
          заранее подготовленный синтетический текст — не ваши записи.
          Возможен расход общего баланса xAI. Один запрос на запуск сервера,
          без автоматических повторов и сохранения в дневник.</p>
        <label htmlFor="reflect-synthetic-scenario">Тестовый сценарий</label>
        <select id="reflect-synthetic-scenario" value={scenario}
          disabled={busy || tried} onChange={event => setScenario(event.target.value)}>
          {SYNTHETIC_TRIALS.map(item => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <p>Пример: {SYNTHETIC_TRIALS.find(item => item.id === scenario)?.preview}</p>
        <label>
          <input type="checkbox" checked={approved}
            disabled={busy || tried}
            onChange={event => setApproved(event.target.checked)} />
          Разрешаю один реальный платный запрос на выбранном синтетическом примере
        </label>
        <button type="button" onClick={handleTest} disabled={!approved || busy || tried}>
          {busy ? 'Отправляем пробный запрос…' : tried ? 'Запрос уже отправлен' : 'Получить ответ Grok'}
        </button>
        {result?.error && <p role="alert" className="reflect-xai-local-error">{result.error}</p>}
        {result?.success && (
          <div role="status" className="reflect-xai-local-success">
            <strong>Ответ Grok (не сохранён в дневник):</strong>
            <p>{result.success.reply}</p>
            <small>Модель: {result.success.model}. Токены: {result.success.usage?.inputTokens} вход /
              {' '}{result.success.usage?.outputTokens} выход.</small>
            <small>{formatActualCost(result.success)}</small>
            <small>Оценка по базовому тарифу: {'
          </div>
        )}
      </div>
    </details>
  );
}
 + (ticks / 1e10).toFixed(8) + '.';
}
const localOnly = typeof window !== 'undefined' &&
  window.location.hostname === '127.0.0.1' &&
  window.location.port === '3100' &&
  import.meta.env.DEV === true &&
  import.meta.env.VITE_ENABLE_XAI_DEV_SMOKE === 'true' &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
  import.meta.env.VITE_APP_ID === 'reflect-8fdc8' &&
  (() => {
    try {
      return JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || '{}')
        .projectId === 'demo-reflect-auth-qa';
    } catch { return false; }
  })();

/**
 * Display only bounded, known error codes and an upstream HTTP status.
 * Never render the provider response body, key, headers or arbitrary payload.
 * The local proxy's 502 is separate from xAI's own non-2xx status.
 */
const SAFE_SMOKE_ERRORS = new Set([
  'xai-http-error',
  'xai-transport-or-response-invalid',
  'provider-response-too-large',
  'one-shot-already-used',
  'key-file-missing-or-unsafe',
  'invalid-payload',
  'intent-denied',
  'origin-denied',
  'not-found'
]);

export function formatSmokeFailure(proxyStatus, payload) {
  const code = SAFE_SMOKE_ERRORS.has(payload?.error) ? payload.error : 'unavailable';
  const providerStatus = payload?.providerHttpStatus;
  const upstream = code === 'xai-http-error' &&
    Number.isInteger(providerStatus) &&
    providerStatus >= 100 && providerStatus <= 599 &&
    (providerStatus < 200 || providerStatus >= 300)
    ? ' Статус xAI upstream: HTTP ' + providerStatus + '.'
    : '';
  return 'Тест не выполнен (' + code + '). Локальный proxy: HTTP ' +
    proxyStatus + '.' + upstream +
    ' Повторный платный запрос не запускается автоматически.';
}

/**
 * LOCAL DEVELOPMENT DIAGNOSTIC ONLY:
 * - Does not read or send the user's text, journals, profile, session or UID.
 * - Only a fixed synthetic prompt is sent by localhost-only Node backend.
 * - Never exposes the xAI key; does not persist a response to Firestore.
 * - Does not make the ordinary Sessions send button available.
 */
export default function XaiDevSmoke() {
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState(null);
  if (!localOnly) return null;

  const handleTest = async () => {
    if (!approved || busy || tried) return;
    setBusy(true);
    setTried(true);
    setResult(null);
    try {
      const response = await fetch(service + '/smoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reflect-Smoke': 'explicit-one-shot'
        },
        body: JSON.stringify({ confirm: 'synthetic-only' }),
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) {
        setResult({ error: formatSmokeFailure(response.status, payload) });
        return;
      }
      setResult({ success: payload });
    } catch {
      setResult({
        error: 'Локальный сервер xAI недоступен. Данные дневника никуда не отправлялись.'
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="reflect-xai-local-diagnostic">
      <summary>Тест Grok 4.3 · локальная разработка</summary>
      <div className="reflect-xai-local-diagnostic-body">
        <p>Отправляется только фиксированная синтетическая фраза, не ваш дневник.
          Возможен небольшой расход общего баланса xAI. Один запрос на запуск сервера.</p>
        <label>
          <input type="checkbox" checked={approved}
            disabled={busy || tried}
            onChange={event => setApproved(event.target.checked)} />
          Разрешаю один платный тест на синтетическом тексте
        </label>
        <button type="button" onClick={handleTest} disabled={!approved || busy || tried}>
          {busy ? 'Проверяем подключение…' : tried ? 'Тест уже запущен' : 'Проверить Grok'}
        </button>
        {result?.error && <p role="alert" className="reflect-xai-local-error">{result.error}</p>}
        {result?.success && (
          <div role="status" className="reflect-xai-local-success">
            <strong>Ответ Grok (не сохранён в дневник):</strong>
            <p>{result.success.reply}</p>
            <small>Модель: {result.success.model}. Токены: {result.success.usage?.inputTokens} вход /
              {' '}{result.success.usage?.outputTokens} выход.
              {' '}Оценка по базовому тарифу: {'$'}{Number(
                result.success.estimatedUsd || 0
              ).toFixed(5)}. Фактическое списание проверяйте в xAI Usage.</small>
          </div>
        )}
      </div>
    </details>
  );
}
}{Number(
              result.success.estimatedUsd || 0
            ).toFixed(6)}. Сверьте фактическую стоимость с xAI Usage.</small>
          </div>
        )}
      </div>
    </details>
  );
}
 + (ticks / 1e10).toFixed(8) + '.';
}
const localOnly = typeof window !== 'undefined' &&
  window.location.hostname === '127.0.0.1' &&
  window.location.port === '3100' &&
  import.meta.env.DEV === true &&
  import.meta.env.VITE_ENABLE_XAI_DEV_SMOKE === 'true' &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
  import.meta.env.VITE_APP_ID === 'reflect-8fdc8' &&
  (() => {
    try {
      return JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || '{}')
        .projectId === 'demo-reflect-auth-qa';
    } catch { return false; }
  })();

/**
 * Display only bounded, known error codes and an upstream HTTP status.
 * Never render the provider response body, key, headers or arbitrary payload.
 * The local proxy's 502 is separate from xAI's own non-2xx status.
 */
const SAFE_SMOKE_ERRORS = new Set([
  'xai-http-error',
  'xai-transport-or-response-invalid',
  'provider-response-too-large',
  'one-shot-already-used',
  'key-file-missing-or-unsafe',
  'invalid-payload',
  'intent-denied',
  'origin-denied',
  'not-found'
]);

export function formatSmokeFailure(proxyStatus, payload) {
  const code = SAFE_SMOKE_ERRORS.has(payload?.error) ? payload.error : 'unavailable';
  const providerStatus = payload?.providerHttpStatus;
  const upstream = code === 'xai-http-error' &&
    Number.isInteger(providerStatus) &&
    providerStatus >= 100 && providerStatus <= 599 &&
    (providerStatus < 200 || providerStatus >= 300)
    ? ' Статус xAI upstream: HTTP ' + providerStatus + '.'
    : '';
  return 'Тест не выполнен (' + code + '). Локальный proxy: HTTP ' +
    proxyStatus + '.' + upstream +
    ' Повторный платный запрос не запускается автоматически.';
}

/**
 * LOCAL DEVELOPMENT DIAGNOSTIC ONLY:
 * - Does not read or send the user's text, journals, profile, session or UID.
 * - Only a fixed synthetic prompt is sent by localhost-only Node backend.
 * - Never exposes the xAI key; does not persist a response to Firestore.
 * - Does not make the ordinary Sessions send button available.
 */
export default function XaiDevSmoke() {
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState(null);
  if (!localOnly) return null;

  const handleTest = async () => {
    if (!approved || busy || tried) return;
    setBusy(true);
    setTried(true);
    setResult(null);
    try {
      const response = await fetch(service + '/smoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reflect-Smoke': 'explicit-one-shot'
        },
        body: JSON.stringify({ confirm: 'synthetic-only' }),
        cache: 'no-store'
      });
      const payload = await response.json();
      if (!response.ok) {
        setResult({ error: formatSmokeFailure(response.status, payload) });
        return;
      }
      setResult({ success: payload });
    } catch {
      setResult({
        error: 'Локальный сервер xAI недоступен. Данные дневника никуда не отправлялись.'
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="reflect-xai-local-diagnostic">
      <summary>Тест Grok 4.3 · локальная разработка</summary>
      <div className="reflect-xai-local-diagnostic-body">
        <p>Отправляется только фиксированная синтетическая фраза, не ваш дневник.
          Возможен небольшой расход общего баланса xAI. Один запрос на запуск сервера.</p>
        <label>
          <input type="checkbox" checked={approved}
            disabled={busy || tried}
            onChange={event => setApproved(event.target.checked)} />
          Разрешаю один платный тест на синтетическом тексте
        </label>
        <button type="button" onClick={handleTest} disabled={!approved || busy || tried}>
          {busy ? 'Проверяем подключение…' : tried ? 'Тест уже запущен' : 'Проверить Grok'}
        </button>
        {result?.error && <p role="alert" className="reflect-xai-local-error">{result.error}</p>}
        {result?.success && (
          <div role="status" className="reflect-xai-local-success">
            <strong>Ответ Grok (не сохранён в дневник):</strong>
            <p>{result.success.reply}</p>
            <small>Модель: {result.success.model}. Токены: {result.success.usage?.inputTokens} вход /
              {' '}{result.success.usage?.outputTokens} выход.
              {' '}Оценка по базовому тарифу: {'$'}{Number(
                result.success.estimatedUsd || 0
              ).toFixed(5)}. Фактическое списание проверяйте в xAI Usage.</small>
          </div>
        )}
      </div>
    </details>
  );
}
