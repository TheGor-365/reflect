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
    kind: 'toggleSubtask', target: { id: 'b', text: 'Второй шаг' }, completed: true
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

test('malformed legacy subtask is visible as a warning without UI crash', () => {
  render(<Goals userId="synthetic-uid" goals={[{
    ...goal, id: 'malformed', subItems: [null, { text: 'Сохранившийся шаг', completed: false }]
  }]} />);
  expect(screen.getByText('Не удалось прочитать подзадачу. Исходные данные не изменены.'))
    .toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Сохранившийся шаг' }))
    .not.toBeChecked();
});

test('goal creator starts as a single compact field with optional details closed', () => {
  render(<Goals goals={[]} userId="synthetic-uid" />);
  expect(screen.getByRole('textbox', { name: 'Название цели' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Дополнительные параметры цели' }))
    .toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByLabelText(/Зачем это нужно/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Срок/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
});

test('advanced fields keep typed purpose and steps when collapsed and reopened', () => {
  render(<Goals goals={[]} userId="synthetic-uid" />);
  const options = screen.getByRole('button', { name: 'Дополнительные параметры цели' });
  fireEvent.click(options);
  fireEvent.change(screen.getByLabelText(/Зачем это нужно/), {
    target: { value: 'Личное намерение' }
  });
  fireEvent.change(screen.getByLabelText('Шаг новой цели'), {
    target: { value: 'Тихий первый шаг' }
  });
  fireEvent.click(options);
  fireEvent.click(options);
  expect(screen.getByLabelText(/Зачем это нужно/)).toHaveValue('Личное намерение');
  expect(screen.getByLabelText('Шаг новой цели')).toHaveValue('Тихий первый шаг');
  fireEvent.click(screen.getByRole('button', { name: 'Добавить шаг' }));
  expect(screen.getByText('Тихий первый шаг')).toBeInTheDocument();
});

test('transaction-confirmed goal appears immediately and snapshot replaces echo once', async () => {
  const { rerender } = render(<Goals goals={[]} userId="synthetic-uid" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Название цели' }), {
    target: { value: 'Новая подтверждённая цель' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Создать цель' }));
  await waitFor(() => expect(screen.getByRole('article', { name: 'Новая подтверждённая цель' }))
    .toBeInTheDocument());
  rerender(<Goals userId="synthetic-uid" goals={[{
    ...goal, id: 'synthetic-goal-id', text: 'Новая подтверждённая цель'
  }]} />);
  await waitFor(() => expect(screen.getAllByRole('article', { name: 'Новая подтверждённая цель' }))
    .toHaveLength(1));
});

test('paused and completed goals are accessible but hidden until their filter is selected', () => {
  render(<Goals userId="synthetic-uid" goals={[
    goal,
    { ...goal, id: 'g2', text: 'Пауза', status: 'paused' },
    { ...goal, id: 'g3', text: 'Сделано', status: 'completed', completed: true }
  ]} />);
  expect(screen.queryByRole('article', { name: 'Пауза' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /На паузе/ }));
  expect(screen.getByRole('article', { name: 'Пауза' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /Завершены/ }));
  expect(screen.getByRole('article', { name: 'Сделано' })).toBeInTheDocument();
});

test('user-confirmed linked goal exposes its actual source session without mutations', () => {
  const onOpenSession = vi.fn();
  render(<Goals userId="synthetic-uid" goals={[{
    ...goal, sessionId: 'saved-session', sourceRecommendationKey: 'r-a1-0'
  }]} onOpenSession={onOpenSession}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Источник: открыть сеанс' }));
  expect(onOpenSession).toHaveBeenCalledExactlyOnceWith('saved-session');
  expect(updateGoal).not.toHaveBeenCalled();
  expect(createGoal).not.toHaveBeenCalled();
});

test('authored success criterion is visible but never marks goal complete', () => {
  render(<Goals userId="synthetic-uid" goals={[{
    ...goal, successCriteria: 'URL открывается и форма работает',
    completed: false, status: 'active'
  }]}/>);
  expect(screen.getByText(/URL открывается и форма работает/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'В работе' })).toHaveAttribute('aria-pressed', 'true');
});
