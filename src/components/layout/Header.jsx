import React from 'react';
import { Menu } from 'lucide-react';

const Header = ({ onMenuClick, activeTab }) => (
  <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-stone-200 sticky top-0 z-10">
    <button onClick={onMenuClick} className="p-2"><Menu className="w-6 h-6 text-stone-600" /></button>
    <h2 className="text-lg font-bold truncate text-stone-800 capitalize">{activeTab}</h2>
    <div className="w-8"></div>
  </header>
);

export default Header;
