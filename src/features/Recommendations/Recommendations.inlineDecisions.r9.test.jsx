import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Recommendations from './Recommendations';
import { applyRecommendationDecision } from '../Sessions/recommendationDecisions';

vi.mock('../Sessions/recommendationDecisions', () => ({
  applyRecommendationDecision: vi.fn()
}));

const sessions = [{
  id: 'session-a', title: 'План запуска', chatHistory: [
    { id: 'user-a', role: 'user', content: 'Нужно начать запуск' },
    { id: 'assistant-a', role: 'assistant', content: 'Предлагаю шаг',
      interaction: {
        version: 'reflect.interaction.v1', stage: 'synthesize',
        clarifyingQuestion: '', insights: [], unknowns: [],
        recommendationCandidates: [{
          title: 'Опубликовать первый результат',
          rationale: 'Это проверяемый первый шаг.',
          sourceRefs: ['current-message']
        }]
      }
    }
  ]
}];

beforeEach(() => vi.clearAllMocks());

test('R9.2.1 saves a pending recommendation through the existing owner transaction', async () => {
  vi.mocked(applyRecommendationDecision).mockResolvedValue({ status: 'saved' });
  render(<Recommendations key="owner-a" sessions={sessions} userId="owner-a"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить идею' }));
  expect(applyRecommendationDecision).toHaveBeenCalledExactlyOnceWith({
    userId: 'owner-a', sessionId: 'session-a',
    assistantMessageId: 'assistant-a', candidateIndex: 0, action: 'saved'
  });
  await waitFor(() => {
    expect(screen.getByText(/Идея сохранена\. Обновляем список/)).toBeInTheDocument();
  });
  expect(screen.queryByRole('button', { name: 'Сохранить идею' })).not.toBeInTheDocument();
});

test('R9.2.1 double click never initiates two writes', async () => {
  let finish;
  vi.mocked(applyRecommendationDecision).mockImplementation(() =>
    new Promise(resolve => { finish = resolve; }));
  render(<Recommendations sessions={sessions} userId="owner-a"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Отложить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отложить' }));
  expect(applyRecommendationDecision).toHaveBeenCalledTimes(1);
  expect(applyRecommendationDecision).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'postponed' }));
  finish({ status: 'postponed' });
  await waitFor(() => expect(screen.getByText(/Идея отложена/)).toBeInTheDocument());
});

test('R9.2.1 rejection preserves card and requires an explicit new click', async () => {
  vi.mocked(applyRecommendationDecision)
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce({ status: 'dismissed' });
  render(<Recommendations sessions={sessions} userId="owner-a"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Не подходит' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/не сохранено/));
  expect(applyRecommendationDecision).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Опубликовать первый результат')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Не подходит' }));
  await waitFor(() => expect(screen.getByText(/Идея отклонена/)).toBeInTheDocument());
  expect(applyRecommendationDecision).toHaveBeenCalledTimes(2);
});

test('R9.2.1 no owner means no Firestore writes', () => {
  render(<Recommendations sessions={sessions}/>);
  expect(screen.getByRole('button', { name: 'Сохранить идею' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Отложить' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Не подходит' })).toBeDisabled();
  expect(applyRecommendationDecision).not.toHaveBeenCalled();
});
