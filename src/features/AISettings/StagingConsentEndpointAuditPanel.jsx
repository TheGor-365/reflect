import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { railwayAiEnabled } from '../../api/reflectRailwayService';
import { auditStagingConsentEndpoint } from '../../api/stagingConsentEndpointAudit';

const ERROR_CODES = [
  'unauthenticated', 'reauthentication-required', 'permission-denied',
  'attestation-unavailable', 'invalid-argument', 'resource-exhausted',
  'unavailable', 'not-found', 'consent-audit-unavailable'
];

/**
 * Separate from the actual ContextConsentPanel and its feature flag.
 * This does not create any grant or expose source/grant IDs.
 */
export default function StagingConsentEndpointAuditPanel({ userId }) {
  const [state, setState] = useState('idle');
  const [code, setCode] = useState(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setState('idle');
    setCode(null);
  }, [userId]);

  if (!railwayAiEnabled) return null;

  const run = async () => {
    if (!userId || state === 'checking') return;
    const requestGeneration = generation.current;
    setState('checking');
    setCode(null);
    try {
      const result = await auditStagingConsentEndpoint();
      if (generation.current !== requestGeneration) return;
      setState(result?.status === 'verified' && result.checks === 4
        ? 'passed' : 'failed');
      if (result?.status !== 'verified' || result.checks !== 4) {
        setCode('consent-audit-unavailable');
      }
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      setState('failed');
      setCode(ERROR_CODES.includes(error?.message)
        ? error.message : 'consent-audit-unavailable');
    }
  };

  return (
    <section className="reflect-ai-settings-card reflect-staging-security-audit"
      aria-label="Диагностика API разрешений">
      <div className="reflect-ai-settings-card-title">
        <ShieldCheck size={19} aria-hidden="true"/>
        <h3>Диагностика API разрешений</h3>
      </div>
      <p>
        Отдельная ручная проверка нового staging API. Проверяет анонимный запрет,
        Firebase Auth + App Check, защиту от повторного токена и безопасный отзыв
        заведомо отсутствующего тестового разрешения. Новые разрешения не создаются.
      </p>
      <button type="button" className="reflect-ai-settings-reset"
        disabled={!userId || state === 'checking'} onClick={run}>
        {state === 'checking' ? 'Проверяем API…' : 'Проверить API разрешений'}
      </button>
      {state === 'passed' && (
        <p role="status" className="reflect-ai-settings-feedback">
          PASS 4/4: анонимный запрос отклонён, подписанный список получен,
          повторный App Check отклонён, тестовый отзыв подтверждён.
          Реальная выдача доступа к истории ещё не выполнялась.
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="reflect-ai-settings-error">
          Проверка API не пройдена. Код: {code}. Не включайте выдачу разрешений.
        </p>
      )}
      <p className="reflect-staging-security-audit-note">
        Это не тест Grok или чтения истории. Запросы не содержат сеансов,
        текста дневника и персональных данных.
      </p>
    </section>
  );
}
