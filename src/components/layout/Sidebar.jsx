import React from 'react';
import { BookOpen, GitBranch, MessageSquare, Plus, Target, User, X } from 'lucide-react';
import NavItem from './NavItem';

const Sidebar = ({
  isOpen, onClose, activeTab, changeTab, sessions, currentSessionId,
  selectSession, handleNewSession, profile, userId, onProfileClick
}) => (
  <>
    {isOpen && (
      <button type="button" className="reflect-backdrop"
        aria-label="Закрыть меню" onClick={onClose} />
    )}

    <aside className={`reflect-sidebar ${isOpen ? 'reflect-sidebar--open' : ''}`}
      aria-label="Боковое меню Reflect">
      <div className="reflect-brand">
        <span className="reflect-brand-mark" aria-hidden="true">R</span>
        <div className="reflect-brand-copy">
          <span className="reflect-brand-name">reflect<span className="reflect-brand-point">.</span></span>
          <span className="reflect-brand-caption">Время для себя</span>
        </div>
        <button type="button" className="reflect-sidebar-close"
          aria-label="Закрыть меню" onClick={onClose}>
          <X size={21} aria-hidden="true" />
        </button>
      </div>

      <div className="reflect-sidebar-scroll">
        <p className="reflect-sidebar-section-title">Пространство</p>
        <nav aria-label="Основные разделы" className="reflect-side-nav">
          <NavItem tabName="diary" icon={<BookOpen size={20} />} label="Дневник" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="sessions" icon={<MessageSquare size={20} />} label="Сеансы" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="goals" icon={<Target size={20} />} label="Цели" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="sessionSchema" icon={<GitBranch size={20} />} label="Схема сеансов" activeTab={activeTab} changeTab={changeTab} />
        </nav>

        <button type="button" className="reflect-new-session" onClick={handleNewSession}>
          <Plus size={19} aria-hidden="true" />
          <span>Новый сеанс</span>
        </button>

        <div className="reflect-session-history">
          <p className="reflect-sidebar-section-title">История сеансов</p>
          {sessions.length === 0 ? (
            <p className="reflect-sidebar-empty">Ваши сеансы появятся здесь.</p>
          ) : sessions.map(session => (
            <button key={session.id} type="button" onClick={() => selectSession(session.id)}
              className={`reflect-session-link ${activeTab === 'sessions' && currentSessionId === session.id ? 'reflect-session-link--active' : ''}`}>
              <span className="reflect-session-name">{session.title || 'Без названия'}</span>
              <span className="reflect-session-date">
                {session.createdAt && typeof session.createdAt.toDate === 'function'
                  ? session.createdAt.toDate().toLocaleDateString('ru-RU')
                  : 'Дата не указана'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="reflect-sidebar-footer">
        <button type="button" onClick={onProfileClick} className="reflect-profile-button">
          <span className="reflect-profile-avatar" aria-hidden="true"><User size={19} /></span>
          <span className="reflect-profile-copy">
            <span className="reflect-profile-name">{profile?.name || 'Мой профиль'}</span>
            <span className="reflect-profile-subtitle">Настройки профиля</span>
          </span>
        </button>
        <details className="reflect-account-details">
          <summary>Идентификатор аккаунта</summary>
          <code>{userId}</code>
        </details>
      </div>
    </aside>
  </>
);

export default Sidebar;
