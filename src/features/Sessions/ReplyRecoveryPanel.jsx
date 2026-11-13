import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCcw, ShieldCheck } from 'lucide-react';
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
export default function ReplyRecoveryPanel({
  sessionId, turn, disabled = false, onRetry
}) {
  const [state, setState] = useState(null);
  const [checking, setChecking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    if (checking || retrying || disabled) return;
    setChecking(true); setError(''); setConfirming(false);
    try {
      const result = await readRailwayTurnStatus(sessionId, turn.id);
      setState(result);
    } catch {
      setState(null);
      setError('Не удалось проверить квитанцию. Ответ не запрашивался у Grok.');
    } finally {
      setChecking(false);
    }
  };
  const retry = async () => {
    if (disabled || retrying || !confirming || !state?.canRetry) return;
    setRetrying(true); setConfirming(false); setError('');
    try {
      await onRetry(turn);
      setState(null); // the new reply must appear from Firebase readback
    } catch {
      // Provider outcome may be billable. Never run an automatic second try.
      setState(null);
      setError('Результат новой попытки не подтверждён. Сначала снова проверьте статус бесплатно.');
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div className="reflect-ai-recovery" aria-label="Восстановление ответа Reflect">
      <p className="reflect-ai-recovery-heading">
        <AlertCircle size={16} aria-hidden="true"/> На это сообщение нет сохранённого ответа
      </p>
      {state ? (
        <p role="status" className="reflect-ai-recovery-status">
          {state.status === 'persisted_reply' || state.status === 'reply_exists'
            ? <CheckCircle2 size={15} aria-hidden="true"/>
            : <ShieldCheck size={15} aria-hidden="true"/>}
          {STATES[state.status] || 'Состояние требует проверки.'}
        </p>
      ) : <p>Текст сообщения сохранён. Проверьте результат прежней попытки
        перед созданием новой.</p>}
      <div className="reflect-ai-recovery-actions">
        <button type="button" onClick={check}
          disabled={disabled || checking || retrying}>
          <RefreshCcw size={15} aria-hidden="true"/>
          {checking ? 'Проверка…' : 'Проверить статус бесплатно'}
        </button>
        {state?.canRetry && !confirming && (
          <button type="button" disabled={disabled || retrying}
            onClick={() => setConfirming(true)}>
            Сгенерировать ответ повторно
          </button>
        )}
      </div>
      {confirming && state?.canRetry && (
        <div className="reflect-ai-recovery-confirm" role="group"
          aria-label="Подтвердить возможную новую оплату">
          <strong>Это новый платный запрос к Grok.</strong>
          <p>Предыдущий мог быть оплачен, даже если ответ не получен.
            Мы используем сохранённый текст и не создаём вторую копию
            вашего сообщения. Продолжить?</p>
          <div className="reflect-ai-recovery-actions">
            <button type="button" disabled={disabled || retrying}
              onClick={retry}>Подтверждаю новую генерацию</button>
            <button type="button" onClick={() => setConfirming(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {retrying && <p role="status">Запрашиваем ответ один раз. Не закрывайте
        страницу для повторного нажатия — результат сохранит сервер.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
