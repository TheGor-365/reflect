import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';
import MobileDock from '../../components/layout/MobileDock';

const at=iso=>({seconds:Math.floor(Date.parse(iso)/1000)});
const nowMs=Date.parse('2026-11-13T10:00:00Z');
const sessions=[{
  id:'saved-session',title:'Настоящая тема',
  chatHistory:[],
  returnCheckIns:[{
    id:'visit1',author:'user',type:'return-check-in',
    text:'Вчера выполнил свой шаг',recordedAtClient:at('2026-11-12T12:00:00Z')
  }]
}];
const goals=[{
  id:'real-goal',text:'Выпустить MVP',
  status:'active',subItems:[{id:'step1',text:'Проверить форму',completed:false}]
}];

describe('PRODUCT-05 dashboard interaction',()=>{
  it('shows truthful goals and visit, opens exact goal without any AI call',()=>{
    const onOpenGoal=vi.fn(),onOpenSession=vi.fn();
    render(<Dashboard sessions={sessions} goals={goals}
      nowMs={nowMs} onOpenGoal={onOpenGoal} onOpenSession={onOpenSession}/>);
    expect(screen.getByRole('heading',{name:'Главная'})).toBeInTheDocument();
    expect(screen.getByText('Выпустить MVP')).toBeInTheDocument();
    expect(screen.getByText(/Проверить форму/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Открыть цель/}));
    expect(onOpenGoal).toHaveBeenCalledExactlyOnceWith('real-goal');
    fireEvent.click(screen.getByRole('button',{name:'Открыть сеанс'}));
    expect(onOpenSession).toHaveBeenCalledExactlyOnceWith('saved-session');
    expect(screen.getByText(/время устройства/)).toBeInTheDocument();
  });
  it('7/30 period switch counts only dated user actions with no fake success',()=>{
    render(<Dashboard sessions={sessions} goals={goals}
      nowMs={nowMs} diaryNotes={[{
        id:'old-note',entries:[{
          text:'Написал месяц назад',createdAt:at('2026-10-22T10:00:00Z')
        }]
      }]}/>);
    expect(screen.getByRole('button',{name:'7 дней'}))
      .toHaveAttribute('aria-pressed','true');
    expect(screen.getByRole('img',{name:/Активность за 7 дней: 1/}))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'30 дней'}));
    expect(screen.getByRole('img',{name:/Активность за 30 дней: 2/}))
      .toBeInTheDocument();
    expect(screen.queryByText(/психологического роста 100%/)).not.toBeInTheDocument();
  });
  it('empty state gives a meaningful next action, not fake numbers',()=>{
    const onNewSession=vi.fn();
    render(<Dashboard sessions={[]} goals={[]} diaryNotes={[]}
      nowMs={nowMs} onNewSession={onNewSession}/>);
    expect(screen.getByText('Ваше пространство пока пусто')).toBeInTheDocument();
    expect(screen.queryByRole('img',{name:/Активность/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Начать сеанс'}));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });
  it('mobile dock includes the new Dashboard and retains existing destinations',()=>{
    const changeTab=vi.fn(),handleNewSession=vi.fn();
    render(<MobileDock activeTab="dashboard" currentSessionId={null}
      changeTab={changeTab} handleNewSession={handleNewSession}/>);
    expect(screen.getByRole('button',{name:'Главная'}))
      .toHaveAttribute('aria-current','page');
    fireEvent.click(screen.getByRole('button',{name:'Главная'}));
    expect(changeTab).toHaveBeenCalledWith('dashboard');
    expect(screen.getByRole('button',{name:'Дневник'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Схема'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Новый сеанс'}));
    expect(handleNewSession).toHaveBeenCalledTimes(1);
  });
});

it('opens the exact diary entry provenance rather than only the diary section',()=>{
  const onOpenDiaryNote=vi.fn();
  render(<Dashboard sessions={[]} goals={[]} nowMs={nowMs}
    diaryNotes={[{
      id:'real-note',title:'Личный журнал',entries:[
        {text:'Первая мысль',createdAt:at('2026-11-11T10:00:00Z')},
        {text:'Вторая мысль',createdAt:at('2026-11-12T10:00:00Z')}
      ]
    }]} onOpenDiaryNote={onOpenDiaryNote}/>);
  const buttons=screen.getAllByRole('button',{name:'Открыть запись'});
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]);
  expect(onOpenDiaryNote).toHaveBeenCalledExactlyOnceWith({
    kind:'diaryNote',recordId:'real-note',entryIndex:1
  });
});
