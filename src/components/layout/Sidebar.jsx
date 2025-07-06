import React from 'react';
import { PlusCircle, BookOpen, User, MessageSquare, GitBranch, Target, X } from 'lucide-react';
import NavItem from './NavItem';

const Sidebar = ({
  isOpen, 
  onClose,
  activeTab,
  changeTab,
  sessions,
  currentSessionId,
  selectSession,
  handleNewSession,
  profile,
  userId,
  onProfileClick
}) => {
  return (
    <div>
      {isOpen && <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"></div>}
      <aside className={`fixed top-0 left-0 h-full w-72 bg-white border-r border-stone-200 flex flex-col p-4 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:w-80 transition-transform duration-300 ease-in-out z-50`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="p-2 bg-teal-100 rounded-lg"><MessageSquare className="text-teal-600" /></div>
            <h1 className="text-2xl font-bold ml-3 text-stone-800">Рефлексия</h1>
          </div>
          <button onClick={onClose} className="lg:hidden p-1"><X className="w-6 h-6 text-stone-500" /></button>
        </div>
        <nav className="mb-4">
          <NavItem tabName="diary" icon={<BookOpen className="w-5 h-5"/>} label="Дневник" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="sessions" icon={<MessageSquare className="w-5 h-5"/>} label="Сеансы" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="sessionSchema" icon={<GitBranch className="w-5 h-5"/>} label="Схема сеансов" activeTab={activeTab} changeTab={changeTab} />
          <NavItem tabName="goals" icon={<Target className="w-5 h-5"/>} label="Цели" activeTab={activeTab} changeTab={changeTab} />
        </nav>
        <div className="flex-grow overflow-y-auto pr-2 border-t border-stone-200 pt-2">
          <button onClick={handleNewSession} className="flex items-center justify-center w-full px-4 py-3 mb-4 font-semibold text-white bg-teal-600 rounded-lg shadow-sm hover:bg-teal-700 transition-colors">
            <PlusCircle className="w-5 h-5 mr-2" />Новый сеанс
          </button>
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">История сеансов</h2>
          {sessions.map(session => (
            <div key={session.id} onClick={() => selectSession(session.id)} className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors ${currentSessionId === session.id && activeTab === 'sessions' ? 'bg-teal-100 text-teal-800' : 'hover:bg-stone-100'}`}>
              <p className="font-semibold truncate">{session.title}</p>
              <p className="text-xs text-stone-500">{session.createdAt?.toDate().toLocaleString('ru-RU')}</p>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-4 border-t border-stone-200 space-y-2">
          <button onClick={onProfileClick} className="flex items-center w-full p-3 rounded-lg text-left transition-colors hover:bg-stone-100 text-stone-700">
            <User className="w-5 h-5 text-stone-500"/>
            <span className="ml-3">{profile?.name || 'Профиль'}</span>
          </button>
          <div className="flex items-center text-sm text-stone-600 p-2 bg-stone-100 rounded-lg">
            <span className="font-mono text-xs break-all">ID: {userId}</span>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Sidebar;
