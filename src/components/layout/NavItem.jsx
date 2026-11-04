import React from 'react';

const NavItem = ({ tabName, icon, label, activeTab, changeTab }) => (
  <button type="button" onClick={() => changeTab(tabName)}
    className={`reflect-nav-item ${activeTab === tabName ? 'reflect-nav-item--active' : ''}`}
    aria-current={activeTab === tabName ? 'page' : undefined}>
    <span className="reflect-nav-icon" aria-hidden="true">{icon}</span>
    <span>{label}</span>
  </button>
);

export default NavItem;
