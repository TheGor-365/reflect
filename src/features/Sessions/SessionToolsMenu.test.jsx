import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SessionToolsMenu, { SessionToolPanel }
  from './SessionToolsMenu';

test('UX R1: no technical panels on first paint, open only via ellipsis', () => {
  const onChange = vi.fn();
  render(<SessionToolsMenu activePanel={null} onChange={onChange}
    hasSavedSession contextAvailable/>);
  expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: 'Инструменты сеанса' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('menuitem', {
    name: 'Гипотезы и источники'
  }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith('evidence');
  expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
});

test('UX R1: hide history tool if no owner context, no side effects', () => {
  const onChange = vi.fn();
  render(<SessionToolsMenu activePanel={null} onChange={onChange}
    hasSavedSession contextAvailable={false}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Инструменты сеанса' }));
  expect(screen.queryByRole('menuitem', {
    name: 'Контекст и история'
  })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', {
    name: 'Вернуться к теме'
  }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith('return');
});

test('UX R1: new session has no account history actions', () => {
  render(<SessionToolsMenu activePanel={null} onChange={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Инструменты сеанса' }));
  expect(screen.getByText(/Инструменты появятся после сохранения/))
    .toBeInTheDocument();
  expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
});

test('UX R1: focused tool drawer is closeable and separate from transcript', () => {
  const onClose = vi.fn();
  render(<SessionToolPanel id="facts" onClose={onClose}>
    <p>Четыре категории сведений пользователя</p>
  </SessionToolPanel>);
  const drawer = screen.getByRole('region', {
    name: 'Подтверждённые сведения'
  });
  expect(drawer).toHaveTextContent('Четыре категории сведений');
  fireEvent.click(screen.getByRole('button', {name:'Закрыть инструменты'}));
  expect(onClose).toHaveBeenCalledOnce();
});
