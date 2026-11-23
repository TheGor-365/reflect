import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Goals from './Goals';

vi.mock('./goalOperations', () => ({
  createGoal: vi.fn(), newGoalId: vi.fn(), newSubtaskId: vi.fn(),
  removeGoal: vi.fn(), updateGoal: vi.fn()
}));
const done = {
  id:'goal-1', text:'Завершённая проверка', type:'checklist',
  status:'completed', completed:true, subItems:[],
  checklistFeedback:{ rating:4, comment:'Сохранённый результат', createdAt:{ seconds:1 } }
};

test('R9.2.3 shows persisted feedback on completed goal without opening a dialog', () => {
  const onFeedback = vi.fn();
  render(<Goals userId='owner-a' goals={[done]} onFeedback={onFeedback}/>);
  fireEvent.click(screen.getByRole('tab',{name:/Завершены/}));
  expect(screen.getByText('Оценка: 4 из 5')).toBeInTheDocument();
  expect(screen.getByText('Сохранённый результат')).toBeInTheDocument();
  expect(onFeedback).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Изменить итог'}));
  expect(onFeedback).toHaveBeenCalledExactlyOnceWith(done);
});

test('R9.2.3 completed goal with no feedback permits later entry; active goal does not', () => {
  const onFeedback = vi.fn();
  render(<Goals userId='owner-a' goals={[{ ...done, checklistFeedback:undefined }]} onFeedback={onFeedback}/>);
  fireEvent.click(screen.getByRole('tab',{name:/Завершены/}));
  expect(screen.getByRole('button',{name:'Добавить итог'})).toBeInTheDocument();
  expect(screen.getByText('Итог выполнения ещё не записан.')).toBeInTheDocument();
});
