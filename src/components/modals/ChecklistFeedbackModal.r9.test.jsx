import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ChecklistFeedbackModal from './ChecklistFeedbackModal';

const goal = { text:'Выпущен релиз', checklistFeedback: {
  rating:3, comment:'Первоначальный отзыв'
} };

test('R9.2.3 reopens with stored rating and text, without auto-saving', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<ChecklistFeedbackModal goal={goal} onSave={onSave} onCancel={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'Оценка 3 из 5'}))
    .toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('textbox',{name:'Комментарий (необязательно)'}))
    .toHaveValue('Первоначальный отзыв');
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Оценка 5 из 5'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Комментарий (необязательно)'}),
    {target:{value:'Итог исправлен'}});
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave).toHaveBeenCalledWith({rating:5,comment:'Итог исправлен'});
});

test('R9.2.3 failed update preserves edited comment without hidden retry', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('Итог изменён в другой вкладке.'));
  render(<ChecklistFeedbackModal goal={goal} onSave={onSave} onCancel={vi.fn()}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'Комментарий (необязательно)'}),
    {target:{value:'Мой несохранённый отзыв'}});
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Итог изменён'));
  expect(screen.getByRole('textbox',{name:'Комментарий (необязательно)'}))
    .toHaveValue('Мой несохранённый отзыв');
  expect(onSave).toHaveBeenCalledTimes(1);
});
