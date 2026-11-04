import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Header from './Header';

test('header translates all route names into Russian labels', () => {
  render(<Header activeTab="diary" theme="dark" onMenuClick={vi.fn()} onToggleTheme={vi.fn()} />);
  expect(screen.getByText('Дневник')).toBeInTheDocument();
  expect(screen.queryByText('diary')).not.toBeInTheDocument();
});

test('menu and theme controls invoke separate handlers', () => {
  const onMenuClick = vi.fn();
  const onToggleTheme = vi.fn();
  render(<Header activeTab="goals" theme="dark" onMenuClick={onMenuClick} onToggleTheme={onToggleTheme} />);
  fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
  fireEvent.click(screen.getByRole('button', { name: 'Включить светлую тему' }));
  expect(onMenuClick).toHaveBeenCalledOnce();
  expect(onToggleTheme).toHaveBeenCalledOnce();
});
