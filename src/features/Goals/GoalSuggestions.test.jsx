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
  expect(screen.getByRole('heading', {name:'Можно превратить в цель'}))
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
