import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, RefreshCcw, ShieldCheck } from 'lucide-react';
import { readRailwayTurnStatus } from '../../api/reflectRailwayService';

/**
 * P0: A missing reply is never regenerated automatically.
 * "Check status" is a signed, NO-provider request. A new Grok call requires
 * an explicit owner confirmation acknowledging that the old one may be paid.
 * The original user turn remains in Firestore and is never posted again.
 */
const STATES = {
  not_tracked: 'Для этого старого запроса нет серверной квитанции. Он мог быть оплачен.',
  provider_pending: 'Предыдущий запрос ещё выполняется. Новая генерация заблокирована.',
  outcome_unknown: 'Результат запроса неизвестен. Оплата могла произойти.',
  failed_before_provider: 'Запрос не дошёл до Grok. Сообщение сохранено.',
  failed_after_provider: 'Grok не вернул пригодный ответ. Запрос мог быть оплачен.',
  persisted_reply: 'Ответ уже сохранён сервером. Он должен появиться в сеансе.',
  reply_exists: 'Ответ уже есть в сохранённой истории.'
};
// Server-signed, privacy-safe diagnosis. Never render provider bodies,
// untrusted text, request IDs, Auth headers or hidden error stacks.
const SAFE_ERROR_EXPLANATIONS = Object.freeze({
  'invalid-provider-response': 'Ответ провайдера не прошёл проверку структуры Reflect.',
  'xai-invalid-request': 'xAI отклонил формат запроса.',
  'xai-unauthorized': 'xAI отклонил авторизацию сервера.',
  'xai-forbidden': 'xAI запретил выполнение запроса.',
  'xai-endpoint-not-found': 'Запрошенный маршрут xAI недоступен.',
  'xai-rate-limited': 'На стороне xAI сработало ограничение запросов.',
  'xai-upstream-timeout': 'Истекло время ожидания ответа xAI.',
  'xai-upstream-error': 'Сервис xAI завершил запрос с ошибкой.',
  'xai-request-too-large': 'xAI отклонил размер переданного запроса.',
  'xai-unavailable': 'xAI отклонил запрос; категория отказа не уточнена.',
  'xai-response-incomplete': 'Grok не завершил ответ в установленном лимите генерации.',
  'xai-envelope-invalid': 'Grok ответил, но служебная структура ответа не прошла проверку.',
  'xai-interaction-invalid': 'Получен ответ Grok, но он нарушает правила структуры Reflect.',
  'xai-transport-invalid': 'Ответ Grok не был корректным JSON-ответом API.',
  'unavailable': 'Сервис не смог подтвердить ответ. Уточнение причины недоступно.',
  'resource-exhausted': 'Сработал лимит на сервере Reflect.',
  'permission-denied': 'Операция отклонена проверкой доступа.',
  'already-exists': 'Для этой реплики уже есть ответ либо попытка.'
});
export default function ReplyRecoveryPanel({
  sessionId, turn, disabled = false, onRetry, allowRetry = true
}) {
  const [state, setState] = useState(null);
  const [checking, setChecking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [retried, setRetried] = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    if (checking || retrying || disabled) return;
    setExpanded(true);
    setChecking(true); setError(''); setConfirming(false);
    try {
      // Signed status endpoint, NO request body sent to Grok and NO charge.
      const result = await readRailwayTurnStatus(sessionId, turn.id);
      setState(result);
    } catch (failure) {
      setState(null);
      setError(failure?.message === 'permission-denied'
        ? 'Доступ к Grok ограничен. Проверьте приватное разрешение аккаунта и повторите бесплатную проверку.'
        : 'Не удалось проверить статус. Нового запроса к Grok не было.');
    } finally {
      setChecking(false);
    }
  };
  const retry = async () => {
    if (disabled || retrying || !allowRetry || !onRetry ||
        !confirming || !state?.canRetry) return;
    setRetrying(true); setConfirming(false); setError('');
    try {
      // One explicit paid request; the original Firestore turn is NOT copied.
      await onRetry(turn);
      setState(null);
      setRetried(true);
    } catch {
      // The provider may have been billed. No automatic second attempt.
      setState(null);
      setError('Результат новой попытки неизвестен. Сначала снова проверьте статус бесплатно.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="reflect-ai-recovery" aria-label="Восстановление ответа Reflect">
      <div className="reflect-ai-recovery-top">
        <span className="reflect-ai-recovery-mark" aria-hidden="true">
          <AlertCircle size={16}/>
        </span>
        <div className="reflect-ai-recovery-summary">
          <strong>Ответ Reflect не получен</strong>
          <span>Ваше сообщение сохранено.</span>
        </div>
        {!retried && <button type="button" className="reflect-ai-recovery-check"
          onClick={check} disabled={disabled || checking || retrying}
          aria-expanded={expanded}
          aria-label="Проверить статус бесплатно">
          <RefreshCcw size={14} aria-hidden="true"/>
          {checking ? 'Проверяем…' : 'Проверить и восстановить'}
          <ChevronDown className={expanded ? 'is-open' : ''} size={13} aria-hidden="true"/>
        </button>}
      </div>
      {(expanded || retried) && (
        <div className="reflect-ai-recovery-detail">
          {retried ? (
            <p role="status" className="reflect-ai-recovery-status">
              <CheckCircle2 size={15} aria-hidden="true"/>
              Ответ получен. Он появится в сохранённой истории сеанса.
            </p>
          ) : (
            <>
              {state ? (
                <p role="status" className="reflect-ai-recovery-status">
                  {state.status === 'persisted_reply' || state.status === 'reply_exists'
                    ? <CheckCircle2 size={15} aria-hidden="true"/>
                    : <ShieldCheck size={15} aria-hidden="true"/>}
                  {STATES[state.status] || 'Состояние требует проверки.'}
                </p>
              ) : !error && !checking && (
                <p>Сначала проверяется серверная квитанция, без вызова Grok.</p>
              )}
              {state && Object.hasOwn(SAFE_ERROR_EXPLANATIONS, state.errorCode) && (
                <p role="note" className="reflect-ai-recovery-diagnosis">
                  {SAFE_ERROR_EXPLANATIONS[state.errorCode]}
                </p>
              )}
              {state?.canRetry && allowRetry && onRetry && !confirming && (
                <div className="reflect-ai-recovery-actions">
                  <button type="button" disabled={disabled || retrying}
                    onClick={() => setConfirming(true)}>
                    Сгенерировать ответ повторно
                  </button>
                </div>
              )}
              {allowRetry && onRetry && confirming && state?.canRetry && (
                <div className="reflect-ai-recovery-confirm" role="group"
                  aria-label="Подтвердить новую генерацию">
                  <strong>Новая генерация может быть платной.</strong>
                  <p>Если прежняя попытка дошла до провайдера, она тоже могла быть
                    оплачена. Исходное сообщение останется одним в истории.</p>
                  <div className="reflect-ai-recovery-actions">
                    <button type="button" disabled={disabled || retrying}
                      onClick={retry}>Подтверждаю новую генерацию</button>
                    <button type="button" onClick={() => setConfirming(false)}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {!allowRetry && <p role="note">Это сообщение было отправлено с
                отдельным разрешением на контекст. Его нельзя повторить без
                нового разрешения. Статус по-прежнему можно проверить бесплатно.</p>}
              {retrying && <p role="status">Отправляем один запрос. Не нажимайте повторно:
                результат фиксируется на сервере.</p>}
              {error && <p role="alert">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
