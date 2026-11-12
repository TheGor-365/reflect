import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import MobileDock from './MobileDock';

test('mobile navigation marks the active tab and switches sections', () => {
  const changeTab = vi.fn();
  render(<MobileDock activeTab="diary" currentSessionId={null}
    changeTab={changeTab} handleNewSession={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Дневник' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Цели' }));
  expect(changeTab).toHaveBeenCalledWith('goals');
});

test('new session invokes the existing creation action', () => {
  const handleNewSession = vi.fn();
  render(<MobileDock activeTab="sessions" currentSessionId="new"
    changeTab={vi.fn()} handleNewSession={handleNewSession} />);
  expect(screen.getByRole('button', { name: 'Новый сеанс' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Новый сеанс' }));
  expect(handleNewSession).toHaveBeenCalledOnce();
});

test('Dashboard is reachable on mobile without losing the new-session action', () => {
  const changeTab = vi.fn();
  render(<MobileDock activeTab="dashboard" currentSessionId={null}
    changeTab={changeTab} handleNewSession={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Обзор' }))
    .toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Сеансы' }));
  expect(changeTab).toHaveBeenCalledWith('sessions');
  expect(screen.getByRole('button', { name: 'Новый сеанс' })).toBeInTheDocument();
});
