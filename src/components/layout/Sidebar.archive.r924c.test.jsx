import React from 'react';
import { fireEvent,render,screen } from '@testing-library/react';
import { expect,test,vi } from 'vitest';
import Sidebar from './Sidebar';

test('active navigation excludes archived goals and sessions while retaining archive in library',()=>{
  const select=vi.fn();
  render(<Sidebar isOpen onClose={vi.fn()} activeTab="dashboard" changeTab={vi.fn()}
    sessions={[{id:'current',title:'Живая тема'},{id:'historical',title:'Архивный сеанс',archivedAt:{seconds:1}}]}
    goals={[{id:'goal1',status:'active'},{id:'goal2',status:'active',archivedAt:{seconds:2}}]}
    selectSession={select} handleNewSession={vi.fn()} onProfileClick={vi.fn()}
    onAccountClick={vi.fn()} userId="owner1" />);
  expect(screen.getByText('Живая тема')).toBeInTheDocument();
  expect(screen.queryByText('Архивный сеанс')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Живая тема'));
  expect(select).toHaveBeenCalledExactlyOnceWith('current');
  expect(screen.getByText('Цели').closest('button')).toHaveTextContent('1');
});
