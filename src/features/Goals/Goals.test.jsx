import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Goals from './Goals';
import {
  createGoal, newGoalId, newSubtaskId, removeGoal, updateGoal
} from './goalOperations';

vi.mock('./goalOperations', () => ({
  createGoal: vi.fn(), newGoalId: vi.fn(), newSubtaskId: vi.fn(),
  removeGoal: vi.fn(), updateGoal: vi.fn()
}));
beforeEach(() => {
  vi.clearAllMocks();
  newGoalId.mockReturnValue('synthetic-goal-id');
  newSubtaskId.mockReturnValue('synthetic-subtask-id');
  createGoal.mockResolvedValue('synthetic-goal-id');
  updateGoal.mockResolvedValue(undefined);
  removeGoal.mockResolvedValue(undefined);
});

const goal = {
  id: 'g1', text: 'Синтетическая цель', type: 'checklist',
  subItems: [
    { id: 'a', text: 'Первый шаг', completed: true },
    { id: 'b', text: 'Второй шаг', completed: false }
  ], completed: false
};

test('new goal needs no due date and uses idempotent document ID', async () => {
  render(<Goals goals={[]} userId="synthetic-uid" />);
  fireEvent.change(screen.getByLabelText('Название цели'), {
    target: { value: 'Цель без срока' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Создать цель' }));
  await waitFor(() => expect(createGoal).toHaveBeenCalledWith(
    'synthetic-uid', 'synthetic-goal-id',
    expect.objectContaining({ text: 'Цель без срока', dueDay: '' })
  ));
  expect(screen.getByText('Цель сохранена')).toBeInTheDocument();
});

test('status board shows exact progress without auto-completing parent goal', () => {
  render(<Goals goals={[goal]} userId="synthetic-uid" />);
  expect(screen.getByText('1 из 2 подзадач')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Выполнено подзадач' }))
    .toHaveAttribute('aria-valuenow', '50');
  expect(screen.getByRole('button', { name: 'В работе' })).toHaveAttribute('aria-pressed', 'true');
});

test('checked subtask uses absolute transaction update and only backend-verified feedback', async () => {
  const onFeedback = vi.fn();
  render(<Goals goals={[goal]} userId="synthetic-uid" onFeedback={onFeedback} />);
  const checkbox = screen.getByRole('checkbox', { name: 'Второй шаг' });
  fireEvent.click(checkbox);
  await waitFor(() => expect(updateGoal).toHaveBeenCalledWith('synthetic-uid', 'g1', {
    kind: 'toggleSubtask', target: { id: 'b' }, completed: true
  }));
  expect(onFeedback).not.toHaveBeenCalled();
  expect(checkbox).not.toBeChecked();
});

test('write failure remains visible and does not falsely change a checkbox', async () => {
  updateGoal.mockRejectedValue(new Error('Сеть недоступна'));
  render(<Goals goals={[goal]} userId="synthetic-uid" />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Второй шаг' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна');
  expect(screen.getByRole('checkbox', { name: 'Второй шаг' })).not.toBeChecked();
});

test('explicit completed action triggers feedback only after confirmed transaction', async () => {
  const onFeedback = vi.fn();
  render(<Goals goals={[goal]} userId="synthetic-uid" onFeedback={onFeedback} />);
  fireEvent.click(screen.getByRole('button', { name: 'Завершены' }));
  await waitFor(() => expect(updateGoal).toHaveBeenCalledWith(
    'synthetic-uid', 'g1', { kind: 'status', status: 'completed' }));
  expect(onFeedback).toHaveBeenCalledTimes(1);
});

test('goal delete requires explicit confirmation', async () => {
  const oldConfirm = window.confirm;
  window.confirm = vi.fn(() => false);
  try {
    render(<Goals goals={[goal]} userId="synthetic-uid" />);
    fireEvent.click(screen.getByRole('button', { name: 'Удалить цель' }));
    expect(removeGoal).not.toHaveBeenCalled();
  } finally {
    window.confirm = oldConfirm;
  }
});
