import React from 'react';
import { BookOpen, Sparkles, NotebookPen, Smile, Lightbulb, Target } from 'lucide-react';

/**
 * UI-only diary lenses. "recommendation" is intentionally an empty lens
 * until owner-scoped, consented, evidence-backed recommendations exist.
 * No AI calls, storage writes or generated suggestions happen here.
 */
export const DIARY_KINDS = Object.freeze([
  { key: 'all', label: 'Весь дневник', icon: BookOpen },
  { key: 'session', label: 'Мысли Reflect', icon: Sparkles },
  { key: 'note', label: 'Мои записи', icon: NotebookPen },
  { key: 'mood', label: 'Настроение', icon: Smile },
  { key: 'recommendation', label: 'Рекомендации', icon: Lightbulb },
  { key: 'goal', label: 'Цели', icon: Target }
]);

export default function DiaryKindSwitcher({ selected, onSelect }) {
  return (
    <div className="reflect-diary-type-switch" role="group"
      aria-label="Показать тип записей дневника">
      {DIARY_KINDS.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" title={label}
          aria-label={label} aria-pressed={selected === key}
          className={selected === key ? 'is-current' : ''}
          onClick={() => onSelect(key)}>
          <Icon size={18} strokeWidth={selected === key ? 2.2 : 1.8}
            aria-hidden="true"/>
        </button>
      ))}
    </div>
  );
}
