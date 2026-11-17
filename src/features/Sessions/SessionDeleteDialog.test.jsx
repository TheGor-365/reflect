import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SessionDeleteDialog from './SessionDeleteDialog';
const example = { id: 'session-a', title: 'Нервничаю перед первым заказом' };
test('deletion is a separate accessible confirmation, not performed on opening', () => {
  const onCancel = vi.fn(), onConfirm = vi.fn();
  render(<SessionDeleteDialog session={example} linkedGoalCount={2}
    onCancel={onCancel} onConfirm={onConfirm}/>);
  const dialog = screen.getByRole('alertdialog', { name: 'Удалить сеанс?' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByText('Нервничаю перед первым заказом')).toBeInTheDocument();
  expect(screen.getByText(/Связанные цели \(2\)/)).toBeInTheDocument();
  expect(screen.getByText(/Технические квитанции AI/)).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Оставить сеанс' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Оставить сеанс' }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
});
test('Escape cancels; no silent destructive callback', () => {
  const onCancel = vi.fn(), onConfirm = vi.fn();
  render(<SessionDeleteDialog session={example}
    onCancel={onCancel} onConfirm={onConfirm}/>);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
});
test('confirm action fires exactly once when explicitly clicked', () => {
  const confirm = vi.fn();
  render(<SessionDeleteDialog session={example}
    onCancel={vi.fn()} onConfirm={confirm}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }));
  expect(confirm).toHaveBeenCalledExactlyOnceWith();
});
test('pending and failed deletion remain visible, do not expose private error', () => {
  const { rerender } = render(<SessionDeleteDialog session={example}
    busy onCancel={vi.fn()} onConfirm={vi.fn()}/>);
  expect(screen.getByRole('button', { name: 'Удаление…' })).toBeDisabled();
  rerender(<SessionDeleteDialog session={example}
    error="Не удалось удалить сеанс" onCancel={vi.fn()} onConfirm={vi.fn()}/>);
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось удалить сеанс');
});
