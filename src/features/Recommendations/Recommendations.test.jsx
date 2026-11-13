import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Recommendations from './Recommendations';

const structured = {
  version: 'reflect.interaction.v1', intent: 'plan', stage: 'synthesize',
  clarifyingQuestion: '', insights: [], unknowns: [], safetyFlags: [],
  recommendationCandidates: [{
    title: 'Назначить день публикации',
    rationale: 'Срок из текущей записи делает решение конкретным.',
    sourceRefs: ['current-message']
  }],
  goalCandidates: [], sourceRefs: ['current-message']
};
const sessions = [{
  id: 'saved-source', title: 'План публикации',
  chatHistory: [
    { id: 'user-1', role: 'user', content: 'Срок через неделю' },
    { id: 'assistant-1', role: 'assistant', content: 'Разберите срок', interaction: structured }
  ]
}];

test('saved structured recommendations immediately appear in separate section with source link', () => {
  const onOpenSession = vi.fn();
  render(<Recommendations sessions={sessions} onOpenSession={onOpenSession}/>);
  expect(screen.getByRole('heading', { name: 'Рекомендации', level: 2 })).toBeInTheDocument();
  expect(screen.getByText('Назначить день публикации')).toBeInTheDocument();
  expect(screen.getByText(/Ожидает вашего решения/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Обсудить или принять/ }));
  expect(onOpenSession).toHaveBeenCalledExactlyOnceWith('saved-source', 'assistant-1');
});

test('legacy chatter is not misreported as user goals or AI recommendations', () => {
  render(<Recommendations sessions={[{
    id: 'synthetic', title: 'Бессмысленная запись',
    chatHistory: [{ role: 'assistant', content: 'Построй 10 целей без оснований' }]
  }]}/>);
  expect(screen.getByText('Пока нет структурированных рекомендаций')).toBeInTheDocument();
  expect(screen.queryByText('Построй 10 целей без оснований')).not.toBeInTheDocument();
});
