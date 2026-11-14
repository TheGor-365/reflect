import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Mindspace from './Mindspace';

vi.mock('./mindspaceOperations',()=>({
  saveMindLink:vi.fn(),removeMindLink:vi.fn(),renameMindTopic:vi.fn()
}));
const sessions=[
  {id:'work-topic',title:'Запуск веб-приложения',chatHistory:[]},
  {id:'friend-topic',title:'Отношения с друзьями',chatHistory:[]}
];
const goals=[{id:'mvp',text:'Релиз MVP',sessionId:'work-topic'}];
describe('RC05 Mindspace navigation',()=>{
  it('shows eight perimeter sectors, real counts and reversible owner-controlled filter',()=>{
    render(<Mindspace sessions={sessions} goals={goals} userId="fixture"/>);
    const filters=screen.getByRole('group',{name:'Предварительные направления карты'});
    expect(within(filters).getAllByRole('button')).toHaveLength(9);
    expect(within(filters).getByRole('button',{name:/Все направления/}))
      .toHaveAttribute('aria-pressed','true');
    expect(screen.getByText(/навигация, не оценка личности/)).toBeInTheDocument();
    expect(document.querySelectorAll('.reflect-mindspace-sector-label')).toHaveLength(8);
    fireEvent.click(within(filters).getByRole('button',{name:/Работа и карьера/}));
    expect(screen.getByRole('button',{name:/Тема: Запуск веб-приложения/}))
      .toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Тема: Отношения с друзьями/}))
      .not.toBeInTheDocument();
    fireEvent.click(within(filters).getByRole('button',{name:/Все направления/}));
    expect(screen.getByRole('button',{name:/Тема: Отношения с друзьями/}))
      .toBeInTheDocument();
  });
  it('does not turn proposal placement into confirmed links or goals',()=>{
    const aiSession={...sessions[0],chatHistory:[{
      role:'assistant',id:'assistant-1',
      interaction:{version:'reflect.interaction.v1',
        recommendationCandidates:[{title:'Ограничить MVP',rationale:'Предложение'}]}
    }]};
    render(<Mindspace sessions={[aiSession]} goals={[]} userId="fixture"/>);
    const item=screen.getByRole('button',{name:/Рекомендация AI: Ограничить MVP/});
    expect(item.querySelector('svg')).toBeTruthy();
    expect(screen.getByLabelText('Подтверждённые смысловые связи'))
      .toHaveTextContent('0');
    expect(screen.getByText(/Близость карточек не подтверждает связь/))
      .toBeInTheDocument();
  });
});
