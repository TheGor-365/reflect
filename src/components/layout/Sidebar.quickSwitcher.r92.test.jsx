import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sidebar from './Sidebar';

const savedSessions = [
  { id: 'current-a', title: 'Рабочая тема', chatHistory: [
    { id: 'u1', role: 'user', content: 'Коллеги перебивают на работе' },
    { id: 'a1', role: 'assistant', content: 'Давайте уточним обстоятельства' }
  ] },
  { id: 'current-b', title: 'Подготовка релиза', chatHistory: [
    { id: 'u2', role: 'user', content: 'Что проверить перед релизом' }
  ] },
  { id: 'archived-c', title: 'Архивная история', archivedAt: {seconds: 1}, chatHistory: [] }
];

const baseProps = {
  isOpen: false, onClose: vi.fn(), activeTab: 'sessions', changeTab: vi.fn(),
  sessions: savedSessions, goals: [], currentSessionId: 'current-a',
  selectSession: vi.fn(), handleNewSession: vi.fn(), onProfileClick: vi.fn(),
  onAccountClick: vi.fn(), userId: 'owner-test', accountLabel: 'QA'
};

beforeEach(() => vi.clearAllMocks());

test('compact sidebar has a direct link to the existing session library', () => {
  const openLibrary = vi.fn();
  render(<Sidebar {...baseProps} onOpenSessionLibrary={openLibrary}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Все сеансы'}));
  expect(openLibrary).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', {name: 'Выбрать сеанс'})).not.toBeInTheDocument();
});

test('sidebar opens a separate searchable, read-only chooser, preserving original shortcuts', () => {
  const select = vi.fn();
  render(<Sidebar {...baseProps} selectSession={select}/>);
  expect(screen.getByText('Рабочая тема')).toBeInTheDocument();
  expect(screen.queryByText('Архивная история')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Открыть полный список сеансов'}));
  const modal = screen.getByRole('dialog', {name:'Выбрать сеанс'});
  expect(modal).toBeInTheDocument();
  expect(screen.getByText('Найдено: 2 из 2')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', {name:'Поиск по списку сеансов'}),
    {target:{value:'релиза'}});
  expect(screen.getByText('Найдено: 1 из 2')).toBeInTheDocument();
  expect(modal).toHaveTextContent('Подготовка релиза');
  expect(modal).not.toHaveTextContent('Рабочая тема');
  fireEvent.click(modal.getElementsByClassName('reflect-session-picker-item')[0]);
  expect(select).toHaveBeenCalledExactlyOnceWith('current-b');
  expect(screen.queryByRole('dialog', {name:'Выбрать сеанс'})).not.toBeInTheDocument();
});

test('archive is reachable without mutation and filter distinguishes unanswered sessions', () => {
  const select = vi.fn();
  render(<Sidebar {...baseProps} selectSession={select}/>);
  fireEvent.click(screen.getByRole('button', {name:'Открыть полный список сеансов'}));
  fireEvent.click(screen.getByRole('button', {name:'Без ответа'}));
  expect(screen.getByText('Найдено: 1 из 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Архив'}));
  expect(screen.getByText('Найдено: 1 из 1')).toBeInTheDocument();
  const modal = screen.getByRole('dialog', {name:'Выбрать сеанс'});
  expect(modal).toHaveTextContent('Архивная история');
  fireEvent.click(modal.querySelector('.reflect-session-picker-item'));
  expect(select).toHaveBeenCalledExactlyOnceWith('archived-c');
});

test('modal Escape closes, and account switch does not expose old owner chooser', async () => {
  const {rerender} = render(<Sidebar {...baseProps}/>);
  fireEvent.click(screen.getByRole('button', {name:'Открыть полный список сеансов'}));
  expect(screen.getByRole('dialog', {name:'Выбрать сеанс'})).toBeInTheDocument();
  fireEvent.keyDown(document, {key:'Escape'});
  expect(screen.queryByRole('dialog', {name:'Выбрать сеанс'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Открыть полный список сеансов'}));
  rerender(<Sidebar {...baseProps} userId="another-owner" sessions={[]}/>);
  await waitFor(() => expect(screen.queryByRole('dialog', {name:'Выбрать сеанс'}))
    .not.toBeInTheDocument());
});
