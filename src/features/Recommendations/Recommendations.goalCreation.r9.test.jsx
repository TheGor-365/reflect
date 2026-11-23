import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Recommendations from './Recommendations';
import { applyRecommendationDecision } from '../Sessions/recommendationDecisions';

vi.mock('../Sessions/recommendationDecisions', () => ({
  applyRecommendationDecision: vi.fn()
}));

const baseInteraction = {
  version: 'reflect.interaction.v1', stage: 'synthesize',
  clarifyingQuestion: '', insights: [], unknowns: [],
  recommendationCandidates: [{
    title: 'Проверить MVP с клиентом',
    rationale: 'В сообщении есть конкретный нерешённый вопрос.',
    sourceRefs: ['current-message']
  }]
};
const makeSessions = (interaction = baseInteraction, decisions) => [{
  id: 'session-a', title: 'Подготовка релиза',
  ...(decisions ? { recommendationDecisions: decisions } : {}),
  chatHistory: [
    {id: 'user-a', role: 'user', content: 'Нужно проверить прототип'},
    {id: 'assistant-a', role: 'assistant', interaction}
  ]
}];
const props = {
  userId: 'owner-a',
  onNewGoalId: vi.fn(() => 'goal-local-1'),
  onOpenGoals: vi.fn()
};

beforeEach(() => vi.clearAllMocks());

function fillGoal() {
  fireEvent.change(screen.getByRole('textbox', {name: 'Название цели'}), {
    target: {value: 'Проверить MVP'}
  });
  fireEvent.change(screen.getByRole('textbox', {name: 'Первый проверяемый шаг'}), {
    target: {value: 'Назначить встречу с одним клиентом'}
  });
  fireEvent.change(screen.getByRole('textbox', {name: 'Как я пойму, что цель достигнута?'}), {
    target: {value: 'Получен документированный отзыв'}
  });
}

test('R9.2.2 does not persist a goal until all required inputs are explicitly confirmed', async () => {
  vi.mocked(applyRecommendationDecision).mockResolvedValue({status: 'accepted', goalId: 'goal-local-1'});
  render(<Recommendations sessions={makeSessions()} {...props}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Превратить в цель'}));
  expect(applyRecommendationDecision).not.toHaveBeenCalled();
  const confirm = screen.getByRole('button', {name: 'Подтвердить создание цели'});
  expect(confirm).toBeDisabled();
  fillGoal();
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.getByText(/Цель подтверждена и связана/)).toBeInTheDocument());
  expect(applyRecommendationDecision).toHaveBeenCalledExactlyOnceWith({
    userId: 'owner-a', sessionId: 'session-a',
    assistantMessageId: 'assistant-a', candidateIndex: 0, action: 'goal',
    goalId: 'goal-local-1', goalTitle: 'Проверить MVP',
    goalPurpose: '', goalStep: 'Назначить встречу с одним клиентом',
    goalDueDay: '', goalCriteria: 'Получен документированный отзыв'
  });
  fireEvent.click(screen.getByRole('button', {name: 'Открыть цели'}));
  expect(props.onOpenGoals).toHaveBeenCalledExactlyOnceWith('goal-local-1');
});

test('R9.2.2 fails closed when hypothesis review is not confirmed', () => {
  render(<Recommendations {...props} sessions={makeSessions({
    ...baseInteraction, insights: ['Причина может быть в сроках']
  })}/>);
  expect(screen.getByRole('button', {name: 'Превратить в цель'})).toBeDisabled();
  expect(screen.getByText(/Сначала оцените все гипотезы/)).toBeInTheDocument();
  expect(applyRecommendationDecision).not.toHaveBeenCalled();
});

test('R9.2.2 preserves goal draft and document ID after ambiguous failure; no automatic repeat', async () => {
  vi.mocked(applyRecommendationDecision)
    .mockRejectedValueOnce(new Error('network-ambiguous'))
    .mockResolvedValueOnce({status: 'accepted', goalId: 'goal-local-1'});
  const onNewGoalId = vi.fn(() => 'goal-local-1');
  render(<Recommendations sessions={makeSessions()} {...props} onNewGoalId={onNewGoalId}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Превратить в цель'}));
  fillGoal();
  fireEvent.click(screen.getByRole('button', {name: 'Подтвердить создание цели'}));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/не подтверждено/));
  expect(applyRecommendationDecision).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox', {name: 'Название цели'})).toHaveValue('Проверить MVP');
  expect(screen.getByRole('textbox', {name: 'Первый проверяемый шаг'})).toHaveValue('Назначить встречу с одним клиентом');
  fireEvent.click(screen.getByRole('button', {name: 'Подтвердить создание цели'}));
  await waitFor(() => expect(screen.getByText(/Цель подтверждена и связана/)).toBeInTheDocument());
  expect(applyRecommendationDecision).toHaveBeenCalledTimes(2);
  expect(onNewGoalId).toHaveBeenCalledTimes(1);
  expect(vi.mocked(applyRecommendationDecision).mock.calls[0][0].goalId)
    .toBe(vi.mocked(applyRecommendationDecision).mock.calls[1][0].goalId);
});

test('R9.2.2 allows converting a previously saved suggestion', async () => {
  vi.mocked(applyRecommendationDecision).mockResolvedValue({status: 'accepted', goalId: 'goal-local-1'});
  render(<Recommendations {...props} sessions={makeSessions(baseInteraction, {
    'r-assistant-a-0': { status: 'saved' }
  })}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Превратить в цель'}));
  fillGoal();
  fireEvent.click(screen.getByRole('button', {name: 'Подтвердить создание цели'}));
  await waitFor(() => expect(screen.getByText(/Цель подтверждена и связана/)).toBeInTheDocument());
  expect(applyRecommendationDecision).toHaveBeenCalledTimes(1);
});

test('R9.2.2 blocks goal generation without a valid owner or ID allocator', () => {
  render(<Recommendations sessions={makeSessions()} />);
  expect(screen.getByRole('button', {name: 'Превратить в цель'})).toBeDisabled();
  expect(applyRecommendationDecision).not.toHaveBeenCalled();
});
