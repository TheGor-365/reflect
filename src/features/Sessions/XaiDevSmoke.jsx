import React, { useState } from 'react';

const service = 'http://127.0.0.1:19107';
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
        const safeCode = typeof payload?.error === 'string' ? payload.error : 'unavailable';
        setResult({
          error: 'Тест не выполнен (' + safeCode + ', HTTP ' + response.status + '). ' +
            'Проверьте локальный сервер и xAI; повторный вызов требует его перезапуска.'
        });
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
