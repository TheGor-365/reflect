import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import SessionLibrary from './SessionLibrary';

const record = (id, archive) => ({
  id, title: id, createdAt: {seconds:1750000000},
  ...(archive ? {archivedAt:{seconds:1750001000}} : {}),
  chatHistory:[{id:`user-${id}`,role:'user',content:`Сообщение ${id}`}]
});

test('R9.2.4B active and archived sessions are different library views, no writes on render', () => {
  const onSetArchived=vi.fn();
  render(<SessionLibrary sessions={[record('active-one',false),record('old-one',true)]}
    onSetArchived={onSetArchived} onNewSession={()=>{}} onSelectSession={()=>{}}/>);
  expect(screen.getByText('active-one')).toBeInTheDocument();
  expect(screen.queryByText('old-one')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Архив сеансов/}));
  expect(screen.getByText('old-one')).toBeInTheDocument();
  expect(screen.queryByText('active-one')).not.toBeInTheDocument();
  expect(onSetArchived).not.toHaveBeenCalled();
});

test('R9.2.4B restores exact session ID with owner handler', async () => {
  const onSetArchived=vi.fn().mockResolvedValue({changed:true,archived:false});
  render(<SessionLibrary sessions={[record('archived-id',true)]}
    onSetArchived={onSetArchived} onNewSession={()=>{}} onSelectSession={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:/Архив сеансов/}));
  fireEvent.click(screen.getByRole('button',{name:/Восстановить: сеанс/}));
  await waitFor(()=>expect(onSetArchived).toHaveBeenCalledExactlyOnceWith('archived-id',false));
});
