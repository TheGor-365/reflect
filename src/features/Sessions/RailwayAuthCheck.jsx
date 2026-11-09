import React, { useState } from 'react';
import {
  railwayPrecheckEnabled, checkRailwayAttestation
} from '../../api/reflectRailwayService';

/**
 * Staging-only QA: verifies real Firebase Auth + one-time App Check with
 * empty JSON against the Railway HTTP boundary; xAI egress must be OFF.
 * Never reads/sends diary, profile, input, chat history or API credentials.
 */
export default function RailwayAuthCheck() {
  const [state, setState] = useState('idle');
  if (!railwayPrecheckEnabled) return null;

  const check = async () => {
    if (state !== 'idle') return;
    setState('checking');
    try {
      await checkRailwayAttestation();
      setState('verified');
    } catch {
      setState('failed');
    }
  };

  return (
    <details className="reflect-xai-local-diagnostic">
      <summary>Railway staging · проверка защищённого подключения</summary>
      <div className="reflect-xai-local-diagnostic-body">
        <p>Одноразовый тест Firebase Auth и App Check без текста сеанса,
          вызова Grok и списания за AI. Доступ к модели остаётся выключенным.</p>
        <button type="button" onClick={check}
          disabled={state !== 'idle'}>
          {state === 'checking' ? 'Проверяем подпись…' :
            state === 'verified' ? 'Проверка выполнена' :
              state === 'failed' ? 'Проверка завершилась ошибкой' :
                'Проверить защищённое соединение'}
        </button>
        {state === 'verified' && (
          <p role="status">Firebase Auth и App Check подтверждены сервером.
            Grok остаётся выключенным.</p>
        )}
        {state === 'failed' && (
          <p role="alert">Сервер не подтвердил подписанное подключение.
            Проверьте Firebase App Check / Authentication. Запрос к Grok
            не отправлялся.</p>
        )}
      </div>
    </details>
  );
}
