import React, { useState } from 'react';
import { railwayAiEnabled, checkRailwayReadiness } from '../../api/reflectRailwayService';

/**
 * Owner-invoked staging diagnostics: signed Auth + one-time App Check and
 * private access verification, without sending any message or calling xAI.
 * Never show UID, tokens, account email, private document values or secrets.
 */
const STATUS = Object.freeze({
  ready: 'Firebase Auth, App Check и приватный доступ подтверждены. Сервер готов к запросу Grok.',
  'outbound-disabled': 'Авторизация и доступ подтверждены. Платный выход к xAI временно выключен.',
  'runtime-disabled': 'Авторизация подтверждена. Приватный переключатель AI пока выключен.'
});
const ERROR = Object.freeze({
  'reauthentication-required': 'Текущая сессия Firebase отозвана, например после смены email. Войдите заново в существующий аккаунт; не создавайте новый.',
  'unauthenticated': 'Firebase не подтвердил вход. Войдите в существующий аккаунт повторно.',
  'auth-permission-missing': 'У серверного Firebase service account нет разрешения на чтение Firebase Authentication. Нужна роль Firebase Authentication Viewer в staging.',
  'auth-verification-unavailable': 'Сервер не смог проверить Firebase Authentication. Платный запрос не отправлялся.',
  'attestation-unavailable': 'Проверка App Check недоступна. Платный запрос не отправлялся.',
  'permission-denied': 'Для этого аккаунта нет действующего закрытого разрешения на Grok.',
  'invalid-argument': 'Некорректный формат диагностики.',
  'diagnostics-unavailable': 'Сервис диагностики недоступен. Платный запрос не отправлялся.'
});

export default function RailwayReadinessCheck() {
  const [state, setState] = useState('idle');
  if (!railwayAiEnabled) return null;

  const check = async () => {
    if (state === 'checking') return;
    setState('checking');
    try {
      const status = await checkRailwayReadiness();
      setState(Object.hasOwn(STATUS, status) ? status : 'diagnostics-unavailable');
    } catch (error) {
      const code = error?.message;
      setState(Object.hasOwn(ERROR, code) ? code : 'diagnostics-unavailable');
    }
  };
  const good = Object.hasOwn(STATUS, state);
  const message = good ? STATUS[state] : ERROR[state];

  return (
    <details className="reflect-xai-local-diagnostic">
      <summary>Railway staging · проверка доступа к AI без списания</summary>
      <div className="reflect-xai-local-diagnostic-body">
        <p>Проверка входа Firebase, App Check, доступа к Grok и переключателей.
          Отправляется только пустой JSON; текст сеанса не передаётся.</p>
        <button type="button" onClick={check} disabled={state === 'checking'}>
          {state === 'checking' ? 'Проверка…' : 'Проверить без запроса к Grok'}
        </button>
        {message && <p role={good ? 'status' : 'alert'}>{message}</p>}
      </div>
    </details>
  );
}
