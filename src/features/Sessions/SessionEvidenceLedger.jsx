import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ClipboardList, MessageCircleQuestion,
  ShieldCheck, ArrowRight } from 'lucide-react';
import { buildSessionEvidenceLedger, prepareOwnerContextDraft }
  from './sessionEvidenceLedger';

const LABELS = {
  'unreviewed': 'Пока не оценено',
  'user-disputed': 'Вы не согласились',
  'user-partial': 'Частично соответствует',
  'user-aligned': 'По вашей оценке близко'
};
const idOk = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);

export default function SessionEvidenceLedger({ session, onCompose, onFocusTurn }) {
  const ledger = useMemo(() => buildSessionEvidenceLedger(session), [session]);
  const [selected, setSelected] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [reviewedPreview, setReviewedPreview] = useState(false);
  useEffect(() => {
    setSelected([]);
    setShowPreview(false);
    setReviewedPreview(false);
  }, [session?.id]);
  const ownerTurns = (Array.isArray(session?.chatHistory) ? session.chatHistory : [])
    .filter(turn => turn?.role === 'user' && idOk(turn.id) &&
      typeof turn.content === 'string' && turn.content.trim());
  const preview = useMemo(() =>
    prepareOwnerContextDraft(session, selected),
  [session, selected]);
  const toggle = id => {
    setShowPreview(false);
    setReviewedPreview(false);
    setSelected(items =>
      items.includes(id) ? items.filter(x => x !== id) :
      items.length >= 3 ? items : [...items, id]);
  };
  if (!session?.id) return null;
  const { metrics } = ledger;
  return (
    <details className="reflect-evidence-ledger"
      aria-label="Проверка гипотез и источников">
      <summary><BookOpenCheck size={17} aria-hidden="true"/>
        Что Reflect знает и что ещё не проверено
        <span>{metrics.hypotheses} гипотез · {metrics.reviewed} оценено ·
          {metrics.disputed} оспорено</span>
      </summary>
      <div className="reflect-evidence-ledger-content">
        <p>Это карта только сохранённых данных текущего сеанса.
          Совпадение вашей оценки с гипотезой не доказывает причину;
          длина разговора не равна качеству анализа.</p>
        <div className="reflect-evidence-ledger-facts" aria-label="Фактическое покрытие">
          <span>Ваши сообщения: <strong>{metrics.userTurns}</strong></span>
          <span>Ответы Reflect: <strong>{metrics.aiTurns}</strong></span>
          <span>Гипотезы без оценки: <strong>{metrics.stillUnreviewed}</strong></span>
          <span>Частично похожи: <strong>{metrics.partial}</strong></span>
          <span>По вашей оценке близко: <strong>{metrics.aligned}</strong></span>
          <span>Задано уточнений: <strong>{metrics.questionsRaised}</strong></span>
        </div>
        {ledger.hypotheses.length > 0 ? (
          <div className="reflect-evidence-ledger-items">
            <h3><ClipboardList size={16} aria-hidden="true"/>
              Гипотезы и ваш отклик</h3>
            <ul>
              {ledger.hypotheses.map(item => (
                <li key={item.id} data-status={item.status}>
                  <p>{item.statement}</p>
                  <strong>{LABELS[item.status]}</strong>
                  {item.ownerComment && <p>Ваш комментарий: {item.ownerComment}</p>}
                  {onFocusTurn && <button type="button"
                    onClick={() => onFocusTurn(item.assistantMessageId)}>
                    Открыть исходный ответ
                  </button>}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>В этом сеансе нет сохранённых структурированных гипотез.
            Старые ответы не превращаются в новые выводы автоматически.</p>
        )}
        {ledger.questions.length > 0 && (
          <div className="reflect-evidence-ledger-items">
            <h3><MessageCircleQuestion size={16} aria-hidden="true"/>
              Вопросы, заданные Reflect</h3>
            <ul>{ledger.questions.map((item,i) =>
              <li key={item.assistantMessageId + ':' + i}>
                {item.question}
                <small>Ответ не установлен автоматически</small>
              </li>)}</ul>
          </div>
        )}
        <div className="reflect-evidence-context">
          <h3><ShieldCheck size={16} aria-hidden="true"/>
            Вспомнить прошлые слова — только по вашему выбору</h3>
          <p>Отметьте до трёх своих сообщений. Мы покажем точные выдержки
            и сможем вставить их в черновик следующего сообщения. Ничего
            не отправляется в Grok без отдельного нажатия «Отправить».</p>
          <div className="reflect-evidence-context-choices">
            {ownerTurns.map((item,i)=>
              <label key={item.id}>
                <input type="checkbox" checked={selected.includes(item.id)}
                  disabled={!selected.includes(item.id) && selected.length >= 3}
                  onChange={() => toggle(item.id)} />
                <span>Сообщение {i+1}: {item.content.trim().slice(0,180)}</span>
              </label>)}
          </div>
          {selected.length > 0 && (
            <button type="button" onClick={() => {setShowPreview(true);setReviewedPreview(false);}}>
              Посмотреть выбранный контекст
            </button>
          )}
          {showPreview && preview && (
            <section aria-label="Предпросмотр выбранного контекста">
              <pre className="reflect-evidence-context-preview">{preview}</pre>
              <label><input type="checkbox"
                checked={reviewedPreview}
                onChange={e => setReviewedPreview(e.target.checked)} />
                Я проверил текст и разрешаю вставить его в свой черновик
              </label>
              <button type="button" disabled={!reviewedPreview || !onCompose}
                onClick={() => {
                  onCompose(preview + '\n\nМой текущий вопрос: ');
                  setShowPreview(false);
                  setReviewedPreview(false);
                }}>
                <ArrowRight size={15} aria-hidden="true" />
                Вставить в черновик (не отправлять)
              </button>
            </section>
          )}
        </div>
      </div>
    </details>
  );
}
