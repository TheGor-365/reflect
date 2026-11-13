import React from 'react';

const NavItem = ({ tabName, icon, label, count = 0, activeTab, changeTab }) => (
  <button type="button" onClick={() => changeTab(tabName)}
    className={`reflect-nav-item ${activeTab === tabName ? 'reflect-nav-item--active' : ''}`}
    aria-current={activeTab === tabName ? 'page' : undefined}>
    <span className="reflect-nav-icon" aria-hidden="true">{icon}</span>
    <span>{label}</span>
    {Number.isInteger(count) && count > 0 && <span className="reflect-nav-count"
      aria-label={`Ожидают действий: ${count}`}>
      {count > 99 ? '99+' : count}
    </span>}
  </button>
);

export default NavItem;
