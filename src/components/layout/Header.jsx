import React from 'react';
import { Menu, Moon, Sun, SlidersHorizontal } from 'lucide-react';

export const SECTION_TITLES = Object.freeze({
  dashboard: 'Обзор',
  diary: 'Дневник',
  sessions: 'Сеансы',
  goals: 'Цели',
  sessionSchema: 'Схема сеансов',
  aiSettings: 'Настройки AI'
});

const Header = ({ onMenuClick, activeTab, theme, onToggleTheme, onOpenAiSettings }) => (
  <header className="reflect-topbar">
    <div className="reflect-topbar-inner">
      <div className="reflect-topbar-heading">
        <button type="button" className="reflect-icon-button reflect-menu-trigger"
          aria-label="Открыть меню" onClick={onMenuClick}>
          <Menu size={21} aria-hidden="true" />
        </button>
        <div>
          <p className="reflect-overline">Личное пространство</p>
          <p className="reflect-topbar-title">{SECTION_TITLES[activeTab] || 'Reflect'}</p>
        </div>
      </div>
      <div className="reflect-topbar-actions">
        <span className="reflect-topbar-caption">Reflect 2.0</span>
        <button type="button" className="reflect-icon-button"
          aria-label="Настройки AI" title="Настройки AI"
          aria-current={activeTab === 'aiSettings' ? 'page' : undefined}
          onClick={onOpenAiSettings}>
          <SlidersHorizontal size={19} aria-hidden="true"/>
        </button>
        <button type="button" className="reflect-icon-button"
          aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
        </button>
      </div>
    </div>
  </header>
);

export default Header;
