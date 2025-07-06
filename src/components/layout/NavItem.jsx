import React from 'react';

const NavItem = ({ tabName, icon, label, activeTab, changeTab }) => (
  <button onClick={() => changeTab(tabName)} className={`flex items-center w-full p-3 my-1 rounded-lg text-left transition-colors ${activeTab === tabName ? 'bg-teal-100 text-teal-800 font-semibold' : 'hover:bg-stone-100 text-stone-700'}`}>
    {icon}
    <span className="ml-3">{label}</span>
  </button>
);

export default NavItem;
