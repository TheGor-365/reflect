import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GoalSuggestions from './GoalSuggestions';

const sessions=[{
  id:'session-one',title:'Работа над MVP',chatHistory:[
    {id:'user-one',role:'user',
      content:'У меня десять дней до релиза. Нужен минимальный набор функций.'},
    {id:'assistant-one',role:'assistant',interaction:{
      version:'reflect.interaction.v2',stage:'synthesize',
      clarifyingQuestion:'',unknowns:[],insights:[],
      evidenceSummary:{completeCount:1,confirmedSlots:['situation'],
        missingSlots:['constraints'],disputedSlots:[]},
      recommendationCandidates:[{
        title:'Зафиксировать три функции MVP',
        rationale:'Ограниченный срок требует малого объёма',
        sourceRefs:['current-message']
      }]
    }}
  ]
}];
test('UX R2 goal suggestions recall recommendation and saved owner source on demand', () => {
  const onOpenSession=vi.fn();
  render(<GoalSuggestions sessions={sessions} onOpenSession={onOpenSession}/>);
  expect(screen.getByRole('heading', {name:'Предложения Reflect'}))
    .toBeInTheDocument();
  expect(screen.getByText('Зафиксировать три функции MVP'))
    .toBeInTheDocument();
  const detail=screen.getByRole('button', {name:'Вспомнить контекст предложения'});
  expect(detail).toHaveAttribute('aria-expanded','false');
  fireEvent.click(detail);
  expect(detail).toHaveAttribute('aria-expanded','true');
  expect(screen.getByText(/У меня десять дней до релиза/)).toBeInTheDocument();
  expect(screen.getByText(/Ограниченный срок требует малого объёма/))
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:/Просмотреть и подтвердить/}));
  expect(onOpenSession).toHaveBeenCalledExactlyOnceWith('session-one','assistant-one');
});

test('UX R2 legacy content never becomes a draft goal', () => {
  const {container}=render(<GoalSuggestions sessions={[{
    id:'legacy', chatHistory:[{role:'assistant',content:'Совет из обычного текста'}]
  }]}/>);
  expect(container).toBeEmptyDOMElement();
});

test('UX R7: goal suggestion has a single main bulb, details retain their provenance icons',()=>{
  const {container}=render(<GoalSuggestions sessions={sessions}/>);
  const section=container.querySelector('.reflect-goal-suggestions');
  expect(section.querySelector('header > svg')).toBeInTheDocument();
  expect(section.querySelector('.reflect-goal-suggestion-main > svg')).toBeNull();
  expect(screen.getByText('Зафиксировать три функции MVP')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Вспомнить контекст предложения'}))
    .toHaveAttribute('aria-expanded','false');
});

test('R139 mixed clarify plus recommendation never advertises direct Goal readiness', () => {
  const onOpenSession = vi.fn();
  const blocked = [{
    id: 'session-blocked', title: 'Демонстрация продукта',
    chatHistory: [
      { id: 'owner-blocked', role: 'user', content: 'Планирую ограниченное демо' },
      { id: 'assistant-blocked', role: 'assistant', interaction: {
        version: 'reflect.interaction.v1',
        stage: 'clarify',
        clarifyingQuestion: 'Каким будет достаточный результат?',
        unknowns: [], insights: [],
        recommendationCandidates: [{
          title: 'Зафиксировать границы демонстрации',
          rationale: 'Показать только готовые функции',
          sourceRefs: ['current-message']
        }]
      }}
    ]
  }];
  render(<GoalSuggestions sessions={blocked} onOpenSession={onOpenSession}/>);
  expect(screen.getByRole('heading', { name: 'Предложения Reflect' }))
    .toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Можно превратить в цель' }))
    .not.toBeInTheDocument();
  expect(screen.getByText('Зафиксировать границы демонстрации')).toBeInTheDocument();
  expect(screen.getByText(/Цель пока недоступна: Сначала ответьте на открытый уточняющий вопрос/))
    .toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Просмотреть и подтвердить/ }))
    .not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Открыть исходный диалог/ }));
  expect(onOpenSession).toHaveBeenCalledExactlyOnceWith(
    'session-blocked', 'assistant-blocked'
  );
});

test('R139 unreviewed hypotheses are not falsely presented as an approvable Goal', () => {
  const withUnreviewed = [{
    ...sessions[0],
    chatHistory: sessions[0].chatHistory.map(turn =>
      turn.id === 'assistant-one'
        ? { ...turn, interaction: {
          ...turn.interaction, insights: ['Причина ещё не подтверждена']
        } }
        : turn)
  }];
  render(<GoalSuggestions sessions={withUnreviewed}/>);
  expect(screen.getByText(/Цель пока недоступна: Сначала оцените все гипотезы/))
    .toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Открыть исходный диалог/ }))
    .toBeInTheDocument();
});

test('R139 a saved decision moves out of pending Goals teaser', () => {
  const acceptedAsIdea = [{
    ...sessions[0],
    recommendationDecisions: {
      'r-assistant-one-0': { status: 'saved', assistantMessageId: 'assistant-one' }
    }
  }];
  const { container } = render(<GoalSuggestions sessions={acceptedAsIdea}/>);
  expect(container).toBeEmptyDOMElement();
});

test('R139 v2 missing or disputed evidence remains blocked in Goals', () => {
  for (const evidenceSummary of [undefined, { disputedSlots: ['situation'] }]) {
    const blocked = [{ ...sessions[0], chatHistory: sessions[0].chatHistory.map(turn =>
      turn.id === 'assistant-one' ? { ...turn, interaction: { ...turn.interaction, evidenceSummary } } : turn) }];
    const { unmount } = render(<GoalSuggestions sessions={blocked}/>);
    expect(screen.queryByRole('button', { name: /Просмотреть и подтвердить/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Открыть исходный диалог/ })).toBeInTheDocument();
    unmount();
  }
});
