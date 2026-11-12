import React from 'react';
import { Check, History, Pencil, Plus, Star, X, Sparkles, NotebookPen, Smile, Target, MessageSquareText, GitBranch } from 'lucide-react';
import { entryTitle, entryVersion, entryVersions } from './noteVersions';
import CollapsibleContent from '../../components/common/CollapsibleContent';
import { formatDate } from '../../utils/formatDate';
import { sessionDisplayTitle, sessionExcerpt } from './diaryPresentation';
import { statusOf, progressOf, dueDayOf, dateLabel } from '../Goals/goalDomain';

const MOOD_OPTIONS = { happy: '😊', content: '😌', neutral: '😐', sad: '😟', anxious: '😰' };

const compactDate = date => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(date);
const asDate = value => {
  try {
    const date = value instanceof Date ? value : value?.toDate?.();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
};

const GOAL_STATUS_LABELS = {
  active: 'в работе',
  paused: 'на паузе',
  completed: 'завершена'
};

/** Display only: all facts come from the saved goal, never from AI inference. */
function GoalDiaryDetails({ goal }) {
  const status = statusOf(goal);
  const due = dueDayOf(goal);
  const purpose = typeof goal.purpose === 'string' ? goal.purpose.trim() : '';
  const items = Array.isArray(goal.subItems) ? goal.subItems : [];
  const progress = progressOf(goal);

  return (
    <section className="reflect-journal-goal-details" aria-label="Подробности цели">
      <div className="reflect-journal-goal-meta">
        <span>Статус: <strong>{GOAL_STATUS_LABELS[status]}</strong></span>
        <span>Срок: <strong>{due ? dateLabel(due) : 'без срока'}</strong></span>
      </div>
      {purpose ? (
        <p className="reflect-journal-goal-purpose">
          <strong>Зачем это нужно</strong>
          <span>{purpose}</span>
        </p>
      ) : (
        <p className="reflect-journal-goal-empty">Описание цели не добавлено.</p>
      )}
      {items.length > 0 ? (
        <div className="reflect-journal-goal-steps" aria-label="Сохранённые шаги цели">
          <div className="reflect-journal-goal-steps-heading">
            <strong>Шаги цели</strong>
            <span>{progress.done} из {progress.total} выполнено</span>
          </div>
          <ol>
            {items.map((item, index) => {
              const done = item?.completed === true;
              const text = typeof item?.text === 'string' && item.text.trim()
                ? item.text : 'Текст шага недоступен';
              return (
                <li key={typeof item?.id === 'string' && item.id ? item.id : index}
                  className={done ? 'is-complete' : ''}>
                  <span className="reflect-journal-goal-step-state"
                    aria-label={done ? 'Выполнен' : 'Не выполнен'}>
                    {done ? <Check size={13} aria-hidden="true"/> : null}
                  </span>
                  <span>{text}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : goal.type !== 'reflection' ? (
        <p className="reflect-journal-goal-empty">Шаги пока не добавлены.</p>
      ) : null}
    </section>
  );
}

const DiaryNarrativeCard = React.memo(({ entry, onAppend, onEditNote, onRenameSession, onOpenSession, onOpenJourney }) => {
  const [editing, setEditing] = React.useState(false);
  const [versionsOpen, setVersionsOpen] = React.useState(false);
  const [editDraft, setEditDraft] = React.useState({ title: '', text: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const pendingEdit = React.useRef(null);
  const [renaming, setRenaming] = React.useState(false);
  const [renameDraft, setRenameDraft] = React.useState('');
  const [renameBusy, setRenameBusy] = React.useState(false);
  const [renameError, setRenameError] = React.useState('');
  const item = entry.type === 'note' ? entry.data.entries?.[0] : null;

  const startEditing = () => {
    if (!item || busy) return;
    setEditDraft({ title: entryTitle(entry.data, item), text: item.text || '' });
    pendingEdit.current = null;
    setError('');
    setSaved(false);
    setVersionsOpen(false);
    setEditing(true);
  };

  const submitEdit = async event => {
    event.preventDefault();
    if (busy || !onEditNote || !item || !editDraft.text.trim()) return;
    const fingerprint = editDraft.title + '\u0000' + editDraft.text;
    if (!pendingEdit.current || pendingEdit.current.fingerprint !== fingerprint) {
      pendingEdit.current = {
        fingerprint,
        id: 'rev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 13)
      };
    }
    setError('');
    setBusy(true);
    try {
      await onEditNote({
        noteId: entry.sourceId,
        entryIndex: entry.entryIndex,
        title: editDraft.title,
        text: editDraft.text,
        editId: pendingEdit.current.id,
        expectedVersion: entryVersion(item)
      });
      pendingEdit.current = null;
      setEditing(false);
      setSaved(true);
    } catch (failure) {
      setError(failure?.message || 'Не удалось сохранить правку. Текст сохранён в форме.');
    } finally {
      setBusy(false);
    }
  };
  const submitRename = async event => {
    event.preventDefault();
    const title = renameDraft.trim();
    if (!title || title.length > 100 || renameBusy || !onRenameSession) return;
    setRenameBusy(true); setRenameError('');
    try {
      await onRenameSession(entry.sourceId, title);
      setRenaming(false);
    } catch {
      setRenameError('Не удалось сохранить заголовок. Проверьте подключение и повторите.');
    } finally {
      setRenameBusy(false);
    }
  };
  const renderContent = () => {
    switch (entry.type) {
      case 'session': {
        const { reflection, question, count, history } = sessionExcerpt(entry.data);
        const headline = sessionDisplayTitle(entry.data);
        return (
          <div className="reflect-journal-session">
            <div className="reflect-journal-session-heading">
              <h3 className="reflect-journal-content-title">{headline}</h3>
              {onRenameSession && (
                <button type="button" className="reflect-journal-inline-action"
                  title="Изменить заголовок сеанса" aria-label="Изменить заголовок сеанса"
                  onClick={() => {
                    setRenameDraft(headline === 'Размышление с Reflect' ? '' : headline);
                    setRenameError(''); setRenaming(value => !value);
                  }}><Pencil size={15} aria-hidden="true"/></button>
              )}
            </div>
            {renaming && (
              <form className="reflect-journal-rename" onSubmit={submitRename}>
                <label htmlFor={'rename-' + entry.sourceId}>Название размышления</label>
                <div>
                  <input id={'rename-' + entry.sourceId} value={renameDraft}
                    maxLength={100} disabled={renameBusy} required
                    placeholder="О чём это размышление"
                    onChange={event => setRenameDraft(event.target.value)}/>
                  <button type="submit" disabled={renameBusy || !renameDraft.trim()}>
                    {renameBusy ? 'Сохраняется…' : 'Сохранить'}
                  </button>
                  <button type="button" disabled={renameBusy}
                    onClick={() => { setRenaming(false); setRenameError(''); }}>Отмена</button>
                </div>
                {renameError && <p role="alert">{renameError}</p>}
              </form>
            )}
            {reflection ? (
              <p className="reflect-journal-ai-thought">{reflection}</p>
            ) : (
              <p className="reflect-journal-ai-empty">{question || 'Сеанс пока не содержит размышления Reflect.'}</p>
            )}
            {reflection && question && (
              <CollapsibleContent title="Исходный вопрос">
                <p className="reflect-journal-speaker-text">{question}</p>
              </CollapsibleContent>
            )}
            <CollapsibleContent title="Источник и история">
              <div className="reflect-journal-provenance">
                <p><MessageSquareText size={15} aria-hidden="true"/>
                  Сохранённый сеанс · {count} {count === 1 ? 'сообщение' : 'сообщений'}</p>
                <p>Мысли Reflect и исходные слова пользователя хранятся отдельно.</p>
                <div className="reflect-journal-source-actions">
                  {onOpenSession && <button type="button"
                    onClick={() => onOpenSession(entry.sourceId)}>
                    <MessageSquareText size={15} aria-hidden="true"/> Открыть беседу
                  </button>}
                  {onOpenJourney && <button type="button"
                    onClick={() => onOpenJourney(entry.sourceId)}>
                    <GitBranch size={15} aria-hidden="true"/> Путь сеанса
                  </button>}
                </div>
                <div className="reflect-journal-transcript" aria-label="Полная история сеанса">
                  {history.map((msg, index) => (
                    <div key={msg.id || index} className="reflect-journal-transcript-turn">
                      <strong>{msg.role === 'user' ? 'Вы' : 'Reflect'}</strong>
                      <p className="reflect-journal-speaker-text">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </div>
        );
      }
      case 'goal':
        return (
          <div>
            {entry.isAppend && <p className="reflect-journal-append-caption">Дополнение к цели</p>}
            <h4 className="reflect-journal-content-title">Цель: {entry.data.text}</h4>
            <GoalDiaryDetails goal={entry.data}/>
            {entry.data.type === 'reflection' && (
              <div className="mt-3 space-y-2">
                <h5 className="font-semibold">Проработка:</h5>
                {entry.data.reflections?.map((ref, i) => (
                  <div key={i} className="reflect-journal-detail reflect-journal-detail--reflection">
                    <p className="reflect-journal-content-meta">{formatDate(ref.createdAt)}</p>
                    <p className="whitespace-pre-wrap">{ref.text}</p>
                  </div>
                ))}
                 <button onClick={() => onAppend(entry)} className="reflect-journal-append-button">
                  {entry.data.reflections?.length > 0 ? 'Дополнить' : 'Проработать'}
                </button>
              </div>
            )}
            {entry.data.checklistFeedback && (
              <div className="reflect-journal-detail reflect-journal-detail--feedback">
                <h5 className="font-semibold">Обратная связь по выполнению:</h5>
                {entry.data.checklistFeedback.comment && <p><b>Комментарий:</b> {entry.data.checklistFeedback.comment}</p>}
                <div className="flex items-center gap-1"><b>Оценка:</b> {Array(entry.data.checklistFeedback.rating || 1).fill().map((_, i) => <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />)}</div>
              </div>
            )}
          </div>
        );
      case 'mood':
        return (
          <div className="flex items-center gap-4">
            <span className="text-4xl" aria-hidden="true">{MOOD_OPTIONS[entry.data.mood] || '😐'}</span>
            <div>
              <h4 className="reflect-journal-content-title">Запись о настроении</h4>
              <p className="reflect-journal-content-meta">Интенсивность: {Number.isInteger(entry.data.intensity) && entry.data.intensity >= 1 && entry.data.intensity <= 5 ? entry.data.intensity : 'не указана'} из 5</p>
              {entry.data.comment && <p className="reflect-journal-speaker-text">{entry.data.comment}</p>}
            </div>
          </div>
        );
      case 'note': {
        const noteTitle = entryTitle(entry.data, item);
        const versions = entryVersions(entry.data, item);
        const at = asDate(entry.displayAt);
        return (
          <div className="reflect-journal-note">
            {noteTitle && <h4 className="reflect-journal-note-title">{noteTitle}</h4>}
            <p className="reflect-journal-note-body whitespace-pre-wrap">
              {typeof item?.text === 'string' ? item.text : 'Запись без текста'}
            </p>

            {editing && (
              <form className="reflect-journal-edit" onSubmit={submitEdit} aria-label="Редактирование заметки">
                <label>Заголовок <span>(необязательно)</span>
                  <input type="text" maxLength={240} value={editDraft.title}
                    disabled={busy} placeholder="Добавить заголовок"
                    onChange={event => setEditDraft(value => ({ ...value, title: event.target.value }))}/>
                </label>
                <label>Текст заметки
                  <textarea rows={5} maxLength={20000} required value={editDraft.text}
                    disabled={busy}
                    onChange={event => setEditDraft(value => ({ ...value, text: event.target.value }))}/>
                </label>
                <div className="reflect-journal-edit-actions">
                  <button type="submit" disabled={busy || !editDraft.text.trim()}>
                    <Check size={16} aria-hidden="true"/> {busy ? 'Сохраняется…' : 'Сохранить изменения'}
                  </button>
                  <button type="button" disabled={busy} onClick={() => {
                    setEditing(false); setError(''); pendingEdit.current = null;
                  }}>
                    <X size={16} aria-hidden="true"/> Отмена
                  </button>
                </div>
                {error && <p role="alert" className="reflect-journal-edit-error">{error}</p>}
              </form>
            )}

            {versionsOpen && (
              <section className="reflect-journal-versions" aria-label="Версии записи">
                {versions.map((version, index) => {
                  const versionDate = asDate(version.at);
                  return (
                    <article key={index} className="reflect-journal-version">
                      <div className="reflect-journal-version-heading">
                        <strong>{'Версия ' + version.version}{version.current ? ' · текущая' : ''}</strong>
                        {versionDate && <time dateTime={versionDate.toISOString()}>
                          {compactDate(versionDate)}
                        </time>}
                      </div>
                      {version.title && <p className="reflect-journal-version-title">{version.title}</p>}
                      <p className="whitespace-pre-wrap">{version.text}</p>
                    </article>
                  );
                })}
              </section>
            )}

            <footer className="reflect-journal-note-footer">
              <div className="reflect-journal-note-actions" role="group" aria-label="Действия с записью">
                <button type="button" title="Редактировать запись или заголовок"
                  aria-label="Редактировать запись" disabled={!item || busy || !onEditNote}
                  aria-expanded={editing} onClick={() => editing ? setEditing(false) : startEditing()}>
                  <Pencil size={17} aria-hidden="true"/>
                </button>
                <button type="button" title="Все версии"
                  aria-label="История версий" aria-expanded={versionsOpen}
                  onClick={() => { setEditing(false); setVersionsOpen(open => !open); }}>
                  <History size={17} aria-hidden="true"/>
                </button>
                <button type="button" title="Дополнить заметку" aria-label="Дополнить заметку"
                  disabled={!onAppend} onClick={() => onAppend?.(entry)}>
                  <Plus size={17} aria-hidden="true"/>
                </button>
              </div>
              {at && (
                <time className="reflect-journal-note-date" dateTime={at.toISOString()}
                  title={at.toLocaleString('ru-RU')}>{compactDate(at)}</time>
              )}
            </footer>
            <span className="sr-only" role="status">{saved ? 'Изменения записи сохранены' : ''}</span>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const kind = entry.sourceKind || entry.type;
  const category = {
    note: 'Моя запись', mood: 'Настроение', goal: 'Цель', session: 'Мысль Reflect'
  }[kind] || 'Моя запись';
  const CategoryIcon = {
    note: NotebookPen, mood: Smile, goal: Target, session: Sparkles
  }[kind] || NotebookPen;

  return (
    <article className="reflect-journal-card" data-kind={kind}>
      <div className={kind === 'note' ? 'reflect-journal-kind' : 'reflect-journal-category'}
        aria-label={`Рубрика: ${category}`}>
        <span className="reflect-journal-kind-icon" aria-hidden="true">
          <CategoryIcon size={16}/>
        </span>
        <span>{category}</span>
        {entry.isAppend && <span className="reflect-journal-kind-append">Продолжение</span>}
      </div>
      {renderContent()}
      {kind !== 'note' && asDate(entry.displayAt) && (
        <footer className="reflect-journal-entry-footer">
          <time dateTime={asDate(entry.displayAt).toISOString()}>
            {compactDate(asDate(entry.displayAt))}
          </time>
        </footer>
      )}
    </article>
  );
});

export default DiaryNarrativeCard;
