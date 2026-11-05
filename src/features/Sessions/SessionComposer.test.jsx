import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SessionComposer from './SessionComposer';

const makeProps = (extra = {}) => ({
  value: '',
  onChange: vi.fn(),
  onSubmit: vi.fn(event => event.preventDefault()),
  onToggleRecording: vi.fn(),
  aiAvailable: false,
  ...extra
});

test('uses accessible multiline textarea rather than a single-line input', () => {
  const props = makeProps();
  render(<SessionComposer {...props} />);
  const field = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  expect(field.tagName).toBe('TEXTAREA');
  expect(field).toHaveAttribute('aria-describedby', 'reflect-session-message-hint');
  fireEvent.change(field, { target: { value: 'Первая строка\nВторая строка' } });
  expect(props.onChange).toHaveBeenCalledWith('Первая строка\nВторая строка');
});

test('never sends while server AI is disabled and explains lack of autosave', () => {
  const props = makeProps({ value: 'Большая личная история' });
  render(<SessionComposer {...props} />);
  expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeDisabled();
  expect(screen.getByText(/ИИ-сеансы отключены/)).toBeInTheDocument();
  const field = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
  expect(props.onSubmit).not.toHaveBeenCalled();
  expect(field).toHaveValue('Большая личная история');
});

test('supports Ctrl+Enter submit when backend is enabled, normal Enter remains newline', () => {
  const props = makeProps({ value: 'Размышления', aiAvailable: true });
  render(<SessionComposer {...props} />);
  const field = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(props.onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
  expect(props.onSubmit).toHaveBeenCalledOnce();
});

test('grows input and caps its height without leaving a single-line composer', () => {
  const props = makeProps({ value: 'Старт' });
  const { rerender } = render(<SessionComposer {...props} />);
  const field = screen.getByRole('textbox', { name: 'Сообщение для сеанса' });
  expect(field.style.height).toBe('112px');
  Object.defineProperty(field, 'scrollHeight', { configurable: true, value: 550 });
  rerender(<SessionComposer {...props} value={'Длинное сообщение\n'.repeat(40)} />);
  expect(field.style.height).toBe('280px');
  expect(field.style.overflowY).toBe('auto');
});
