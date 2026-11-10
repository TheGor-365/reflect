import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { railwayAiEnabled } from '../../api/reflectRailwayService';
import { auditStagingAuthAppCheck } from '../../api/stagingSecurityAudit';

const CODES = ['unauthenticated', 'permission-denied', 'attestation-unavailable',
  'reauthentication-required', 'auth-permission-missing',
  'auth-verification-unavailable', 'security-audit-unavailable'];

export default function StagingSecurityAuditPanel({ userId }) {
  const [state, setState] = useState('idle');
  const [code, setCode] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setState('idle');
    setCode(null);
    setReadiness(null);
  }, [userId]);

  if (!railwayAiEnabled) return null;

  async function check() {
    if (!userId || state === 'checking') return;
    const requestGeneration = generation.current;
    setState('checking');
    setCode(null);
    setReadiness(null);
    try {
      const result = await auditStagingAuthAppCheck();
      if (requestGeneration !== generation.current) return;
      setReadiness(result.readiness);
      setState('passed');
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      setCode(CODES.includes(error?.message) ? error.message : 'security-audit-unavailable');
      setState('failed');
    }
  }

  return (
    <section className="reflect-ai-settings-card reflect-staging-security-audit"
      aria-label="Проверка защиты staging">
      <div className="reflect-ai-settings-card-title">
        <ShieldCheck size={19} aria-hidden="true"/>
        <h3>Диагностика защиты staging</h3>
      </div>
      <p>
        Ручная проверка существующего AI API без отправки личных данных и без
        запроса к Grok. Проверяет отклонение анонимного запроса, принятие настоящих
        Firebase Auth + App Check и запрет повторного использования того же токена.
      </p>
      <button type="button" className="reflect-ai-settings-reset"
        disabled={!userId || state === 'checking'} onClick={check}>
        {state === 'checking' ? 'Проверяем защиту…' : 'Проверить Auth и App Check'}
      </button>
      {state === 'passed' && (
        <p role="status" className="reflect-ai-settings-feedback">
          PASS 3/3: анонимный запрос отклонён, подписанный запрос принят,
          повторное использование App Check отклонено. Состояние AI: {readiness}.
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="reflect-ai-settings-error">
          Проверка не пройдена. Код: {code}. Разрешения на историю не включайте.
        </p>
      )}
      <p className="reflect-staging-security-audit-note">
        Эта проверка касается <code>/v1/ai/diagnostics</code>, а не нового
        API разрешений. Выдача доступа и чтение истории моделью остаются выключены.
      </p>
    </section>
  );
}
