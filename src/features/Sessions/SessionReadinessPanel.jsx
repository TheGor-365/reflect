import React, { useEffect, useMemo, useState } from 'react';
import { readOwnerInteractionMode } from '../../api/ownerContextLevel';
import { READINESS_SLOTS, exactOwnerSource, isReadinessApplicable,
  validatedReadiness } from './readinessEvidence';
import { saveReadinessEvidence, clearReadinessEvidence } from './readinessPersistence';

const NAMES = {
  missing: 'Не подтверждено',
  confirmed: 'Вы подтвердили',
  disputed: 'Вы отметили противоречие',
  unverified: 'Источник изменён или не найден'
};
const firstExcerpt = text => (typeof text === 'string'
  ? text.split(/[\r\n]/)[0].slice(0, 220).trim() : '');
/**
 * This is NOT a clinical/readiness-of-the-person score. It counts exact,
 * owner-confirmed quote categories from saved turns of ONE session.
 *
 * No provider transport, access grant, or AI call is triggered on mount/save.
 * Follow-up M5b will separately validate server-side AI clarification.
 */
export default function SessionReadinessPanel({
  userId, session, mode = 'account', currentDraft = '', onFocusTurn
}) {
  const [accountMode, setAccountMode] = useState(null);
  const [slot, setSlot] = useState('situation');
  const [sourceTurnId, setSourceTurnId] = useState('');
  const [quote, setQuote] = useState('');
  const [status, setStatus] = useState('confirmed');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setAccountMode(null);
    if (mode !== 'account') {
      setAccountMode(mode);
    } else if (userId) {
      readOwnerInteractionMode(userId)
        .then(value => { if (active) setAccountMode(value); })
        .catch(() => { if (active) setAccountMode(null); });
    }
    return () => { active = false; };
  }, [mode, userId, session?.id]);
  useEffect(() => {
    setSlot('situation'); setSourceTurnId('');
    setQuote(''); setStatus('confirmed'); setAck(false);
    setBusy(false); setNotice('');
  }, [userId, session?.id]);
  const reviewed = useMemo(() => validatedReadiness(session), [session]);
  const saved = reviewed.slots.find(item => item.id === slot);
  const ownerTurns = (Array.isArray(session?.chatHistory)
    ? session.chatHistory : []).filter(turn =>
      turn?.role === 'user' && typeof turn.content === 'string' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(turn.id || '')).slice(-40);
  const activeMode = mode === 'account' ? accountMode : mode;
  const applicable = isReadinessApplicable(session, activeMode, currentDraft);
  const validQuote = Boolean(exactOwnerSource(session, sourceTurnId, quote));
  const changeTurn = event => {
    const id = event.target.value;
    setSourceTurnId(id); setAck(false); setNotice('');
    setQuote(firstExcerpt(ownerTurns.find(t => t.id === id)?.content));
  };
  const changeSlot = event => {
    setSlot(event.target.value); setAck(false);
    setSourceTurnId(''); setQuote(''); setStatus('confirmed'); setNotice('');
  };
  const save = async () => {
    if (!applicable || busy || !ack || !validQuote || !userId || !session?.id) return;
    const snapshot = { userId, sessionId: session.id };
    setBusy(true); setNotice('');
    try {
      await saveReadinessEvidence({
        ...snapshot, slot, sourceTurnId, quote, status, confirmed: true
      });
      setAck(false);
      setNotice('Подтверждение записано в Firebase. Обновление индикатора происходит по данным сеанса.');
    } catch {
      setNotice('Не удалось подтвердить источник и сохранение. Индикатор не изменён.');
    } finally { setBusy(false); }
  };
  const clear = async () => {
    if (!applicable || busy || !userId || !session?.id) return;
    setBusy(true); setNotice('');
    try {
      await clearReadinessEvidence({ userId, sessionId: session.id, slot });
      setAck(false);
      setNotice('Отметка удалена из Firebase. Индикатор обновится из сеанса.');
    } catch {
      setNotice('Не удалось подтвердить удаление. Проверьте соединение.');
    } finally { setBusy(false); }
  };
  if (!session?.id || !applicable) return null;
  return (
    <details className="reflect-evidence-ledger reflect-readiness"
      aria-label="Подтверждённые сведения для совета">
      <summary>Сведения для обоснованного совета
        <span>{reviewed.confirmedSlots} из 4 категорий подтверждены</span>
      </summary>
      <div className="reflect-evidence-ledger-content">
        <p>Показатель отражает только полноту четырёх категорий ваших
          подтверждённых сообщений. Это <strong>не</strong> вероятность
          успешного совета, диагноз или оценка вашего состояния.
          Ситуацию можно обсуждать и без заполнения всех категорий.</p>
        <progress max="4" value={reviewed.confirmedSlots}
          aria-label="Полнота подтверждённых категорий сведений"/>
        <p>{reviewed.percentage}% категорий отмечено вами</p>
        <ul aria-label="Четыре категории доказательных сведений">
          {reviewed.slots.map(item => (
            <li key={item.id} data-status={item.state}>
              <strong>{item.label}</strong>: {NAMES[item.state]}
              {item.quote && (
                <div>
                  <q>{item.quote}</q>{' '}
                  <button type="button" onClick={() => onFocusTurn?.(item.sourceTurnId)}>
                    Показать исходную реплику
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="reflect-readiness-editor"
          role="group" aria-label="Подтверждение сведений владельцем">
          <h3>Подтвердить один факт из своего сообщения</h3>
          <label>Категория
            <select value={slot} onChange={changeSlot} disabled={busy}>
              {READINESS_SLOTS.map(item =>
                <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <p>{READINESS_SLOTS.find(item => item.id === slot)?.hint}</p>
          <label>Моё сохранённое сообщение
            <select value={sourceTurnId} onChange={changeTurn} disabled={busy}>
              <option value="">Выберите сообщение</option>
              {ownerTurns.map(turn => (
                <option key={turn.id} value={turn.id}>
                  {firstExcerpt(turn.content).slice(0, 85)}
                </option>
              ))}
            </select>
          </label>
          <label>Точная цитата из выбранного сообщения
            <textarea value={quote} maxLength={220} rows={2}
              onChange={event => { setQuote(event.target.value);
                setAck(false); setNotice(''); }} disabled={busy}
              placeholder="Отредактируйте цитату, не меняя слов источника"/>
          </label>
          <label>Статус
            <select value={status} disabled={busy}
              onChange={event => { setStatus(event.target.value);
                setAck(false); setNotice(''); }}>
              <option value="confirmed">Подтверждаю</option>
              <option value="disputed">Противоречит моим текущим сведениям</option>
            </select>
          </label>
          <label><input type="checkbox" checked={ack} disabled={busy}
            onChange={event => setAck(event.target.checked)}/>
            Я самостоятельно подтверждаю категорию, точную цитату
            и выбранный статус.
          </label>
          <button type="button" onClick={save}
            disabled={!ack || !validQuote || busy}>Сохранить подтверждение</button>
          {saved?.state !== 'missing' && (
            <button type="button" onClick={clear} disabled={busy}>
              Убрать отметку категории
            </button>
          )}
          {notice && <p role="status">{notice}</p>}
        </div>
      </div>
    </details>
  );
}
