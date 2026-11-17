import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ChecklistFeedbackModal from './ChecklistFeedbackModal';
import ContentModal from './ContentModal';

test('R9.1 feedback keeps comment editable and submits exactly once', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const cancel = vi.fn();
  render(<ChecklistFeedbackModal goal={{ text: 'Тестовая цель' }}
    onSave={save} onCancel={cancel} />);
  expect(screen.getByRole('dialog', { name: 'Итог по цели' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Оценка 4 из 5' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Комментарий (необязательно)' }), {
    target: { value: 'Результат подтверждён' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith({ rating: 4, comment: 'Результат подтверждён' });
  expect(cancel).not.toHaveBeenCalled();
});

test('R9.1 failed feedback write remains visible and retryable', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  render(<ChecklistFeedbackModal goal={{ text: 'QA' }} onSave={save} onCancel={() => {}} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Комментарий (необязательно)' }), {
    target: { value: 'Не потерять комментарий' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox', { name: 'Комментарий (необязательно)' }))
    .toHaveValue('Не потерять комментарий');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});

test('R9.1 content dialog shows whole text and allows Escape', () => {
  const close = vi.fn();
  render(<ContentModal content={'Первая строка\nВторая строка'} onClose={close} />);
  expect(screen.getByRole('dialog', { name: 'Полное содержание' })).toBeInTheDocument();
  expect(screen.getByText(/Первая строка/)).toHaveTextContent('Вторая строка');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).toHaveBeenCalledTimes(1);
});
