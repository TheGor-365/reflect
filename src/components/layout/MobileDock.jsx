import React from 'react';
import { BookOpen, GitBranch, MessageSquare, Plus, Target } from 'lucide-react';

const shortcuts = [
  { id: 'diary', label: 'Дневник', icon: BookOpen },
  { id: 'sessions', label: 'Сеансы', icon: MessageSquare },
  { id: 'new', label: 'Новый', icon: Plus },
  { id: 'goals', label: 'Цели', icon: Target },
  { id: 'sessionSchema', label: 'Схема', icon: GitBranch }
];

const MobileDock = ({ activeTab, currentSessionId, changeTab, handleNewSession }) => (
  <nav className="reflect-mobile-dock" aria-label="Нижняя навигация">
    <div className="reflect-mobile-dock-inner">
      {shortcuts.map(({ id, label, icon: Icon }) => {
        const action = id === 'new';
        const selected = action
          ? activeTab === 'sessions' && currentSessionId === 'new'
          : activeTab === id && !(id === 'sessions' && currentSessionId === 'new');
        return (
          <button key={id} type="button"
            className={`reflect-dock-item ${action ? 'reflect-dock-item--create' : ''} ${selected ? 'reflect-dock-item--active' : ''}`}
            aria-label={action ? 'Новый сеанс' : label}
            aria-current={selected ? 'page' : undefined}
            onClick={action ? handleNewSession : () => changeTab(id)}>
            <span className="reflect-dock-icon"><Icon size={action ? 24 : 20} aria-hidden="true" /></span>
            <span className="reflect-dock-label">{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);

export default MobileDock;
