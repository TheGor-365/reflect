import React, { useEffect, useState } from 'react';
import { BookOpen, BrainCircuit, GitBranch, LayoutDashboard, Lightbulb, MessageSquare, Plus, Target, User, ShieldCheck, SlidersHorizontal, X, Search } from 'lucide-react';
import NavItem from './NavItem';
import SessionQuickSwitcher from './SessionQuickSwitcher';
import { sessionDisplayTitle, sessionExcerpt } from '../../features/Diary/diaryPresentation';
import { buildRecommendationInbox } from '../../features/Recommendations/recommendationInbox';
import { isArchivedRecord } from '../../features/Archive/archiveSelectors';

const Sidebar = ({
  isOpen, onClose, activeTab, changeTab, sessions, goals = [], currentSessionId,
  selectSession, handleNewSession, onOpenSessionLibrary, profile, userId, onProfileClick, onAccountClick, accountLabel
}) => {
  const [quickSwitcherOwner, setQuickSwitcherOwner] = useState(null);
  useEffect(() => setQuickSwitcherOwner(null), [userId]);
  const currentSessions = sessions.filter(session => !isArchivedRecord(session));
  return (
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
          <NavItem tabName="dashboard" icon={<LayoutDashboard size={20} />} label="Главная" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="diary" icon={<BookOpen size={20} />} label="Дневник" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="sessions" icon={<MessageSquare size={20} />} label="Сеансы" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="recommendations" icon={<Lightbulb size={20} />} label="Рекомендации"
            count={buildRecommendationInbox(sessions).pendingCount}
            activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="goals" icon={<Target size={20} />} label="Цели"
            count={goals.filter(goal => goal && goal.completed !== true &&
              goal.status !== 'completed' && !isArchivedRecord(goal)).length}
            activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="sessionSchema" icon={<GitBranch size={20} />} label="Схема сеансов" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="mindspace" icon={<BrainCircuit size={20} />} label="Mindspace" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="aiSettings" icon={<SlidersHorizontal size={20} />} label="Настройки AI" activeTab={activeTab} changeTab={changeTab} />
        </nav>

        <button type="button" className="reflect-new-session" onClick={handleNewSession}>
          <Plus size={19} aria-hidden="true" />
          <span>Новый сеанс</span>
        </button>

        <div className="reflect-session-history-head">
            <p className="reflect-sidebar-section-title">История сеансов</p>
            <div className="reflect-session-history-actions">
              <button type="button" className="reflect-session-library-link"
                aria-label="Все сеансы" title="Открыть библиотеку сеансов"
                onClick={() => onOpenSessionLibrary?.()}>Все</button>
              <button type="button" className="reflect-session-picker-trigger reflect-session-picker-trigger--icon"
                aria-label="Открыть полный список сеансов" title="Быстрый выбор сеанса" onClick={() => {
                  setQuickSwitcherOwner(userId);
                  if (isOpen) onClose?.();
                }}><Search size={14} aria-hidden="true" /></button>
            </div>
        </div>
        <div className="reflect-session-history">
          {currentSessions.length === 0 ? (
            <p className="reflect-sidebar-empty">Текущих сеансов нет. Архив доступен через «Сеансы».</p>
          ) : currentSessions.map(session => (
            <button key={session.id} type="button" onClick={() => selectSession(session.id)}
              className={`reflect-session-link ${activeTab === 'sessions' && currentSessionId === session.id ? 'reflect-session-link--active' : ''}`}>
              <span className="reflect-session-name">{sessionDisplayTitle(session)}</span>
              {sessionDisplayTitle(session) === 'Размышление с Reflect' &&
                sessionExcerpt(session).question && (
                  <span className="reflect-session-preview">
                    {sessionExcerpt(session).question.slice(0, 66)}
                  </span>
              )}
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
        <button type="button" onClick={onAccountClick} className="reflect-account-link" aria-label="Аккаунт и вход">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>Аккаунт и вход</span>
          <span className="reflect-account-state">{accountLabel}</span>
        </button>
        <details className="reflect-account-details">
          <summary>Идентификатор аккаунта</summary>
          <code>{userId}</code>
        </details>
      </div>
    </aside>
    {quickSwitcherOwner && quickSwitcherOwner === userId &&
      <SessionQuickSwitcher key={userId} sessions={sessions}
        activeSessionId={currentSessionId} onSelectSession={selectSession}
        onClose={() => setQuickSwitcherOwner(null)}/>}
  </>
  );
};

export default Sidebar;
