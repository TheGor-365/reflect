import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Recommendations from './Recommendations';
import GoalSuggestions from '../Goals/GoalSuggestions';

vi.mock('../Sessions/recommendationDecisions',()=>({applyRecommendationDecision:vi.fn()}));
const interaction={version:'reflect.interaction.v1',stage:'synthesize',
  recommendationCandidates:[{title:'Архивная идея',rationale:'Обоснование',
    sourceRefs:['current-message']}]};
const archived=[{id:'archived-session',title:'Архивная тема',archivedAt:{seconds:1},
  chatHistory:[{id:'user-one',role:'user',content:'Запись'},
    {id:'assistant-one',role:'assistant',interaction}]}];

test('R9.2.4C session archive makes recommendation historical and read-only',()=>{
  const onSetArchived=vi.fn();
  const {unmount}=render(<Recommendations sessions={archived} userId="owner"
    onSetArchived={onSetArchived} />);
  expect(screen.queryByText('Архивная идея')).not.toBeInTheDocument();
  expect(screen.getByText(/Пока нет рекомендаций/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Архив рекомендаций/}));
  expect(screen.getByText('Архивная идея')).toBeInTheDocument();
  expect(screen.getByText(/Исходный сеанс в архиве/)).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Сохранить идею/})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Восстановить: рекомендация/})).not.toBeInTheDocument();
  expect(onSetArchived).not.toHaveBeenCalled();
  unmount();
  render(<GoalSuggestions sessions={archived} onOpenSession={vi.fn()}/>);
  expect(screen.queryByText('Архивная идея')).not.toBeInTheDocument();
});
