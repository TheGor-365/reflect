import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, Check, CirclePause, ClipboardList, Pencil, Plus, SlidersHorizontal,
  RotateCcw, Sparkles, Target, Trash2, X
} from 'lucide-react';
import { dateLabel, dueDayOf, dueState, progressOf, statusOf } from './goalDomain';
import { createGoal, newGoalId, newSubtaskId, removeGoal, updateGoal } from './goalOperations';

const STATUS = [
  ['active', 'В работе'],
  ['paused', 'На паузе'],
  ['completed', 'Завершены']
];
const DEFAULT_DRAFT = { type: 'checklist', text: '', purpose: '', dueDay: '', subItems: [] };

const todayLocalDay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const targetFor = (item, index) => item?.id
  ? { id: item.id, text: item.text }
  : { index, text: item?.text };

function GoalCard({ goal, userId, onAppend, onFeedback }) {
  const status = statusOf(goal);
  const progress = progressOf(goal);
  const dueDay = dueDayOf(goal);
  const due = dueState(goal, todayLocalDay());
  const subItems = Array.isArray(goal.subItems) ? goal.subItems : [];
  const reflections = Array.isArray(goal.reflections) ? goal.reflections : [];
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [subText, setSubText] = useState('');
  const [editSub, setEditSub] = useState(null);
  const [editSubText, setEditSubText] = useState('');
  const pendingSubId = useRef(null);

  const execute = async (action, after) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await updateGoal(userId, goal.id, action);
      setNotice('Сохранено');
      after?.();
      return true;
    } catch (failure) {
      setError(failure?.message || 'Не удалось сохранить изменения. Проверьте сеть и повторите.');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const addSubtask = async event => {
    event.preventDefault();
    if (!subText.trim()) return;
    pendingSubId.current ||= newSubtaskId(userId);
    await execute({
      kind: 'addSubtask', id: pendingSubId.current, text: subText.trim()
    }, () => {
      pendingSubId.current = null;
      setSubText('');
    });
  };

  const saveGoalEdits = async event => {
    event.preventDefault();
    if (!editDraft) return;
    await execute({
      kind: 'edit', text: editDraft.text, purpose: editDraft.purpose,
      dueDay: editDraft.dueDay, expected: editDraft.expected
    }, () => { setEditing(false); setEditDraft(null); });
  };

  const deleteGoal = async () => {
    if (busyRef.current || !window.confirm('Удалить эту цель и все её подзадачи? Действие необратимо.')) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await removeGoal(userId, goal.id);
      setNotice('Цель удалена');
    } catch (failure) {
      setError(failure?.message || 'Удаление не выполнено. Повторите попытку.');
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  return (
    <article className="reflect-goal-card" aria-label={goal.text || 'Цель без названия'}>
      <div className="reflect-goal-card-top">
        <div className="reflect-goal-card-title">
          <div className="reflect-goal-type">
            {goal.type === 'reflection' ? <Sparkles size={16} /> : <ClipboardList size={16} />}
            {goal.type === 'reflection' ? 'Рефлексия' : 'Задачи'}
            {goal.sessionTitle && <span>· {goal.sessionTitle}</span>}
          </div>
          <h4>{goal.text || 'Цель без названия'}</h4>
          {goal.purpose && <p className="reflect-goal-purpose">{goal.purpose}</p>}
        </div>
        <div className="reflect-goal-card-actions">
          <button type="button" disabled={busy} aria-label="Редактировать цель"
            onClick={() => { setEditing(true); setEditDraft({
              text: goal.text || '', purpose: goal.purpose || '', dueDay: dueDay || '',
              expected: { text: goal.text || '', purpose: goal.purpose || '',
                dueDay: dueDay || '' }
            }); }}>
            <Pencil size={17} aria-hidden="true" />
          </button>
          <button type="button" disabled={busy} aria-label="Удалить цель"
            onClick={deleteGoal}><Trash2 size={17} aria-hidden="true" /></button>
        </div>
      </div>

      {editing && editDraft && (
        <form className="reflect-goal-edit" onSubmit={saveGoalEdits}>
          <label>Название цели
            <input type="text" required maxLength={240} value={editDraft.text}
              onChange={e => setEditDraft(v => ({ ...v, text: e.target.value }))} />
          </label>
          <label>Зачем это нужно? <span>(необязательно)</span>
            <textarea rows={2} maxLength={1000} value={editDraft.purpose}
              onChange={e => setEditDraft(v => ({ ...v, purpose: e.target.value }))} />
          </label>
          <label>Срок выполнения <span>(необязательно)</span>
            <input type="date" value={editDraft.dueDay}
              onChange={e => setEditDraft(v => ({ ...v, dueDay: e.target.value }))} />
          </label>
          <div className="reflect-goal-controls">
            <button type="submit" disabled={busy} className="reflect-goal-primary"><Check size={15}/> Сохранить</button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy}>Отмена</button>
          </div>
        </form>
      )}

      <div className="reflect-goal-meta">
        <span className={`reflect-goal-deadline ${due === 'overdue' ? 'reflect-goal-overdue' : ''}`}>
          <CalendarDays size={15} aria-hidden="true"/>
          {dueDay ? `До ${dateLabel(dueDay)}` : 'Без срока'}
          {due === 'overdue' ? ' · Срок прошёл' : due === 'today' ? ' · Сегодня' : ''}
        </span>
        {goal.type !== 'reflection' && (
          <span>{progress.total ? `${progress.done} из ${progress.total} подзадач` : 'Подзадач пока нет'}</span>
        )}
      </div>

      {goal.type !== 'reflection' && progress.percent !== null && (
        <div className="reflect-goal-progress" role="progressbar" aria-label="Выполнено подзадач"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
          <div style={{ width: `${progress.percent}%` }} />
        </div>
      )}

      <div className="reflect-goal-status-actions" role="group" aria-label="Статус цели">
        {STATUS.map(([value, label]) => (
          <button key={value} type="button" disabled={busy}
            aria-pressed={status === value}
            onClick={() => execute({ kind: 'status', status: value }, () => {
              if (value === 'completed' && status !== 'completed') onFeedback?.(goal);
            })}>
            {label}
          </button>
        ))}
      </div>

      {goal.type === 'reflection' ? (
        <div className="reflect-goal-reflections">
          <button type="button" onClick={() => onAppend?.({ id: goal.id, type: 'goal', data: goal })}
            className="reflect-goal-secondary" disabled={busy}>
            <Plus size={16}/> Добавить размышление
          </button>
          {reflections.length > 0 && (
            <details>
              <summary>Размышления ({reflections.length})</summary>
              {reflections.map((reflection, index) => (
                <p key={index} className="reflect-goal-reflection">{typeof reflection?.text === 'string' ? reflection.text : 'Запись без текста'}</p>
              ))}
            </details>
          )}
        </div>
      ) : (
        <div className="reflect-goal-subtasks">
          {subItems.map((item, index) => (!item || typeof item !== 'object' || typeof item.text !== 'string') ? (
            <p key={`malformed-${index}`} className="reflect-goal-error">
              Не удалось прочитать подзадачу. Исходные данные не изменены.
            </p>
          ) : (
            <div key={item.id || `legacy-${index}`} className="reflect-goal-subtask">
              {editSub === (item.id || `legacy-${index}`) ? (
                <form className="reflect-goal-subedit" onSubmit={event => {
                  event.preventDefault();
                  execute({
                    kind: 'editSubtask', target: targetFor(item, index), text: editSubText
                  }, () => setEditSub(null));
                }}>
                  <input type="text" aria-label="Изменить подзадачу" required maxLength={240}
                    value={editSubText} onChange={e => setEditSubText(e.target.value)} />
                  <button type="submit" disabled={busy} aria-label="Сохранить подзадачу"><Check size={16}/></button>
                  <button type="button" disabled={busy} aria-label="Отменить редактирование"
                    onClick={() => setEditSub(null)}><X size={16}/></button>
                </form>
              ) : (
                <>
                  <label className="reflect-goal-check">
                    <input type="checkbox" checked={item.completed === true} disabled={busy}
                      onChange={e => execute({
                        kind: 'toggleSubtask', target: targetFor(item, index),
                        completed: e.target.checked
                      })} />
                    <span className={item.completed === true ? 'reflect-goal-checked' : ''}>{item.text}</span>
                  </label>
                  <button type="button" disabled={busy} aria-label={`Изменить: ${item.text}`}
                    onClick={() => { setEditSub(item.id || `legacy-${index}`); setEditSubText(item.text); }}>
                    <Pencil size={15}/>
                  </button>
                  <button type="button" disabled={busy} aria-label={`Удалить: ${item.text}`}
                    onClick={() => {
                      if (window.confirm('Удалить подзадачу?')) execute({
                        kind: 'deleteSubtask', target: targetFor(item, index)
                      });
                    }}><X size={16}/></button>
                </>
              )}
            </div>
          ))}
          <form className="reflect-goal-subcreate" onSubmit={addSubtask}>
            <input aria-label="Новая подзадача" type="text" maxLength={240} value={subText}
              onChange={e => { setSubText(e.target.value); pendingSubId.current = null; }}
              placeholder="Добавить шаг…" />
            <button type="submit" disabled={!subText.trim() || busy}
              aria-label="Добавить подзадачу"><Plus size={17} /></button>
          </form>
        </div>
      )}

      {error && <p role="alert" className="reflect-goal-error">{error}</p>}
      {busy && <p role="status" className="reflect-goal-feedback">Сохранение…</p>}
      {!busy && notice && <p role="status" className="reflect-goal-feedback">{notice}</p>}
    </article>
  );
}

export default function Goals({ goals = [], userId, onAppend, onFeedback }) {
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [newStep, setNewStep] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('active');
  const [confirmedGoals, setConfirmedGoals] = useState([]);
  const [createError, setCreateError] = useState('');
  const [createNotice, setCreateNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const busyRef = useRef(false);
  const pendingId = useRef(null);
  const currentUserRef = useRef(userId);
  currentUserRef.current = userId;

  // A transaction-confirmed goal may precede the subscription event. Show it
  // once by its allocated ID, then retire the echo at authoritative readback.
  // Never carry a former account's echo into another UID.
  useEffect(() => {
    setConfirmedGoals(current => current.filter(entry =>
      entry.ownerUid === userId && !goals.some(goal => goal.id === entry.id)
    ));
  }, [goals, userId]);

  const visibleGoals = useMemo(() => {
    const known = new Set(goals.map(goal => goal.id));
    return [
      ...confirmedGoals.filter(entry => entry.ownerUid === userId && !known.has(entry.id)),
      ...goals
    ];
  }, [goals, confirmedGoals, userId]);
  const groups = useMemo(() => STATUS.map(([status, title]) => ({
    status, title, items: visibleGoals.filter(goal => statusOf(goal) === status)
  })), [visibleGoals]);
  const currentGroup = groups.find(group => group.status === selectedStatus) || groups[0];

  const addDraftStep = () => {
    const text = newStep.trim();
    if (!text || !userId) return;
    setDraft(current => ({
      ...current, subItems: [
        ...current.subItems, { id: newSubtaskId(userId), text, completed: false }
      ]
    }));
    setNewStep('');
  };

  const submit = async event => {
    event.preventDefault();
    if (busyRef.current || !userId || !draft.text.trim()) return;
    busyRef.current = true;
    setCreating(true);
    setCreateNotice('');
    setCreateError('');
    const owner = userId;
    const savedDraft = {
      ...draft,
      subItems: draft.subItems.map(item => ({ ...item }))
    };
    try {
      pendingId.current ||= newGoalId(owner);
      const id = pendingId.current;
      await createGoal(owner, id, savedDraft);
      if (currentUserRef.current !== owner) return;
      setConfirmedGoals(current => [
        ...current.filter(entry => entry.id !== id),
        {
          ...savedDraft, id, ownerUid: owner,
          text: savedDraft.text.trim(), type: savedDraft.type,
          status: 'active', completed: false, reflections: []
        }
      ]);
      setDraft(DEFAULT_DRAFT);
      setNewStep('');
      setAdvanced(false);
      setSelectedStatus('active');
      pendingId.current = null;
      setCreateNotice('Цель сохранена');
    } catch (failure) {
      if (currentUserRef.current === owner) {
        setCreateError(failure?.message || 'Цель не сохранилась. Проверьте соединение и повторите.');
      }
    } finally {
      busyRef.current = false;
      if (currentUserRef.current === owner) setCreating(false);
    }
  };

  return (
    <section className="reflect-goals-workspace reflect-goals-focused" aria-label="Цели и задачи">
      <header className="reflect-goals-focus-header">
        <h2><Target size={19} aria-hidden="true" /> Ваши цели</h2>
        <span aria-label="Количество целей">Всего {visibleGoals.length}</span>
      </header>

      <form onSubmit={submit} className="reflect-goals-creator reflect-goals-creator--compact">
        <div className="reflect-goals-compose-row">
          <label className="sr-only" htmlFor="reflect-goal-name">Название цели</label>
          <input id="reflect-goal-name" type="text" required maxLength={240}
            placeholder="Новая цель…"
            value={draft.text} disabled={creating}
            onChange={event => {
              setCreateNotice('');
              setDraft(value => ({ ...value, text: event.target.value }));
            }} />
          <button type="button" className="reflect-goals-options-toggle"
            aria-label="Дополнительные параметры цели" aria-controls="reflect-goals-advanced"
            aria-expanded={advanced} title="Параметры цели"
            onClick={() => setAdvanced(open => !open)} disabled={creating}>
            <SlidersHorizontal size={18} aria-hidden="true"/>
          </button>
          <button className="reflect-goals-submit-compact" type="submit"
            aria-label="Создать цель" title="Создать цель"
            disabled={creating || !draft.text.trim()}>
            {creating ? <span className="sr-only">Сохранение…</span> : <Plus size={19} aria-hidden="true"/>}
          </button>
        </div>

        {advanced && (
          <div id="reflect-goals-advanced" className="reflect-goals-advanced">
            <div className="reflect-goal-type-picker" role="group" aria-label="Тип цели">
              <button type="button" aria-pressed={draft.type === 'checklist'}
                onClick={() => setDraft(value => ({ ...value, type: 'checklist' }))}>
                Задачи и шаги
              </button>
              <button type="button" aria-pressed={draft.type === 'reflection'}
                onClick={() => setDraft(value => ({ ...value, type: 'reflection' }))}>
                Рефлексия
              </button>
            </div>
            <div className="reflect-goals-fields">
              <label>Зачем это нужно? <span>(необязательно)</span>
                <textarea rows={2} maxLength={1000} placeholder="Что изменится в результате?"
                  value={draft.purpose} onChange={event =>
                    setDraft(value => ({ ...value, purpose: event.target.value }))} />
              </label>
              <label>Срок <span>(необязательно)</span>
                <input type="date" value={draft.dueDay} onChange={event =>
                  setDraft(value => ({ ...value, dueDay: event.target.value }))}/>
              </label>
            </div>
            {draft.type === 'checklist' && (
              <div className="reflect-goals-draft-steps">
                {draft.subItems.map((item, index) => (
                  <div key={item.id} className="reflect-goals-draft-step">
                    <Check size={15} aria-hidden="true" /> {item.text}
                    <button type="button" aria-label={'Удалить черновую подзадачу: ' + item.text}
                      onClick={() => setDraft(value => ({
                        ...value, subItems: value.subItems.filter((_, i) => i !== index)
                      }))}><X size={16}/></button>
                  </div>
                ))}
                <div className="reflect-goal-subcreate">
                  <input aria-label="Шаг новой цели" value={newStep} maxLength={240}
                    onChange={event => setNewStep(event.target.value)}
                    placeholder="Добавить подзадачу"/>
                  <button type="button" disabled={!newStep.trim()} aria-label="Добавить шаг"
                    onClick={addDraftStep}><Plus size={17}/></button>
                </div>
              </div>
            )}
          </div>
        )}
        {createError && <p role="alert" className="reflect-goal-error">{createError}</p>}
        {createNotice && <p role="status" className="reflect-goal-feedback">{createNotice}</p>}
      </form>

      <div className="reflect-goals-focus-tabs" role="tablist" aria-label="Фильтр статуса целей">
        {groups.map(group => (
          <button key={group.status} role="tab" type="button"
            id={'reflect-goals-tab-' + group.status}
            aria-selected={selectedStatus === group.status}
            aria-controls="reflect-goals-current-panel"
            onClick={() => setSelectedStatus(group.status)}>
            {group.title} <span>{group.items.length}</span>
          </button>
        ))}
      </div>
      <section className="reflect-goals-board reflect-goals-board--focused"
        id="reflect-goals-current-panel" role="tabpanel"
        aria-labelledby={'reflect-goals-tab-' + currentGroup.status}>
        <div className="reflect-goals-column">
          {currentGroup.items.length === 0 && (
            <p className="reflect-goals-empty">
              {selectedStatus === 'active'
                ? 'Активных целей пока нет. Добавьте первую выше.'
                : 'В этом разделе пока нет целей.'}
            </p>
          )}
          {currentGroup.items.map(goal => (
            <GoalCard key={goal.id} goal={goal} userId={userId}
              onAppend={onAppend} onFeedback={onFeedback}/>
          ))}
        </div>
      </section>
    </section>
  );
}
