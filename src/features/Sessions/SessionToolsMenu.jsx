import React, { useEffect, useRef, useState } from 'react';
import { Ellipsis, Check, Trash2, X } from 'lucide-react';
import ReflectContentIcon from '../../components/common/ReflectContentIcon';

export const SESSION_TOOL_LABELS = Object.freeze({
  return: 'Вернуться к теме',
  evidence: 'Гипотезы и источники',
  facts: 'Подтверждённые сведения',
  context: 'Контекст и история'
});
const TOOLS = Object.freeze([
  ['return', 'return', 'Вернуться к теме'],
  ['evidence', 'insight', 'Гипотезы и источники'],
  ['facts', 'evidence', 'Подтверждённые сведения'],
  ['context', 'context', 'Контекст и история']
]);

/** Technical details live behind ONE scoped menu, outside the dialog flow. */
export default function SessionToolsMenu({
  activePanel, onChange, hasSavedSession = false, contextAvailable = false,
  onDeleteRequest
}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const pointer = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const escape = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="reflect-session-tools-menu" ref={root}>
      <button type="button" className="reflect-session-tool-trigger"
        aria-label="Инструменты сеанса" aria-haspopup="menu" aria-expanded={open}
        title="Инструменты сеанса"
        onClick={() => setOpen(value => !value)}>
        <Ellipsis size={22} aria-hidden="true"/>
      </button>
      {open && (
        <div className="reflect-session-tool-list" role="menu"
          aria-label="Инструменты текущего сеанса">
          <p className="reflect-session-tool-list-title">
            Дополнительные действия
          </p>
          {TOOLS.filter(([id]) => hasSavedSession &&
            (id !== 'context' || contextAvailable)).map(([id, kind, label]) => (
            <button type="button" role="menuitem" key={id}
              aria-current={activePanel === id ? 'true' : undefined}
              onClick={() => {
                onChange(activePanel === id ? null : id);
                setOpen(false);
              }}>
              <ReflectContentIcon kind={kind}/>
              <span>{label}</span>
              {activePanel === id && <Check size={15} aria-hidden="true"/>}
            </button>
          ))}
          {hasSavedSession && onDeleteRequest && (
            <div className="reflect-session-tool-danger-area">
              <button type="button" role="menuitem"
                className="reflect-session-tool-delete"
                onClick={() => { setOpen(false); onDeleteRequest(); }}>
                <Trash2 size={16} aria-hidden="true"/>
                <span>Удалить сеанс</span>
              </button>
            </div>
          )}
          {!hasSavedSession &&
            <p className="reflect-session-tool-list-hint">
              Инструменты появятся после сохранения первого сообщения.
            </p>}
        </div>
      )}
    </div>
  );
}

export function SessionToolPanel({ id, onClose, children }) {
  const kind = id === 'return' ? 'return' :
    id === 'evidence' ? 'insight' : id === 'facts' ? 'evidence' : 'context';
  return (
    <aside className="reflect-session-tool-drawer" role="region"
      aria-label={SESSION_TOOL_LABELS[id] || 'Инструменты сеанса'}>
      <header className="reflect-session-tool-drawer-head">
        <ReflectContentIcon kind={kind} size={20}/>
        <h3>{SESSION_TOOL_LABELS[id]}</h3>
        <button type="button" onClick={onClose} aria-label="Закрыть инструменты">
          <X size={19} aria-hidden="true"/>
        </button>
      </header>
      <div className="reflect-session-tool-drawer-body">
        {children}
      </div>
    </aside>
  );
}
