import React, { useState } from 'react';
import { railwayAiEnabled, checkRailwayReadiness, checkRailwayProviderAccess } from '../../api/reflectRailwayService';

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
const PROVIDER_STATUS = Object.freeze({
  'model-accessible': 'xAI подтвердил действующий API-ключ и доступ к grok-4.3. Это только чтение каталога моделей; генерации не было.',
  'credentials-unavailable': 'Серверный ключ xAI отсутствует или имеет недопустимый формат.',
  'credentials-rejected': 'xAI отклонил API-ключ (HTTP 400/401). Проверьте действующий ключ в xAI Console, не присылая его в чат.',
  'access-denied': 'xAI отказал в доступе (HTTP 403): проверьте права API-ключа и команды.',
  'model-unavailable': 'grok-4.3 не найден или недоступен этой команде xAI (HTTP 404).',
  'provider-rate-limited': 'xAI ограничил запросы к каталогу моделей (HTTP 429).',
  'provider-unavailable': 'xAI не смог подтвердить доступ к модели; ошибка соединения либо HTTP 5xx.',
  'runtime-disabled': 'Приватный переключатель AI сейчас выключен.'
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
  const [providerState, setProviderState] = useState('idle');
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
  const checkProvider = async () => {
    if (providerState !== 'idle' || state === 'checking') return;
    setProviderState('checking');
    try {
      const status = await checkRailwayProviderAccess();
      setProviderState(Object.hasOwn(PROVIDER_STATUS, status)
        ? status : 'diagnostics-unavailable');
    } catch (error) {
      setProviderState(Object.hasOwn(ERROR, error?.message)
        ? error.message : 'diagnostics-unavailable');
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
        <p>Отдельная проверка API-ключа: сервер только читает каталог xAI,
          без генерации ответа и расхода токенов модели.</p>
        <button type="button" onClick={checkProvider}
          disabled={providerState !== 'idle' || state === 'checking'}>
          {providerState === 'checking'
            ? 'Проверяем xAI…' : 'Проверить доступ к Grok без генерации'}
        </button>
        {providerState !== 'idle' && providerState !== 'checking' &&
          <p role={providerState === 'model-accessible' ? 'status' : 'alert'}>
            {PROVIDER_STATUS[providerState] || ERROR[providerState]}
          </p>}
      </div>
    </details>
  );
}
