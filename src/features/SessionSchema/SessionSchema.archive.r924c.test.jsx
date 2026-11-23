import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import SessionSchema from './SessionSchema';
import JourneyMap from './JourneyMap';
const sessions=[
  {id:'historic',title:'Историческая тема',archivedAt:{seconds:12},
    chatHistory:[{id:'u1',role:'user',content:'Старое сообщение'}]},
  {id:'current',title:'Актуальная тема',
    chatHistory:[{id:'u2',role:'user',content:'Новое сообщение'}]}
];
const goals=[
  {id:'g1',sessionId:'current',text:'Архивная цель',archivedAt:{seconds:3}},
  {id:'g2',sessionId:'current',text:'Активная цель'}
];

it('map defaults to active session and hides independently archived goal',()=>{
  render(<SessionSchema sessions={sessions} goals={goals}/>);
  expect(screen.getByRole('combobox',{name:'Тема карты'})).toHaveTextContent('Актуальная тема');
  expect(screen.queryByRole('button',{name:/Цель: Архивная цель/})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Цель: Активная цель/})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'С архивом'}));
  fireEvent.click(screen.getByRole('combobox',{name:'Тема карты'}));
  expect(screen.getByRole('option',{name:'Историческая тема'})).toBeInTheDocument();
});

it('exact archived session request remains viewable and source navigation is read-only',()=>{
  const open=vi.fn();
  render(<SessionSchema sessions={sessions} goals={goals}
    selectedSessionId="historic" onOpenSource={open}/>);
  expect(screen.getByRole('combobox',{name:'Тема карты'})).toHaveTextContent('Историческая тема');
  expect(screen.getByText(/Архивный сеанс · история доступна только для чтения/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Сообщение: Старое сообщение/}));
  fireEvent.click(screen.getByRole('button',{name:'Открыть источник'}));
  expect(open).toHaveBeenCalledExactlyOnceWith({kind:'turn',sessionId:'historic',turnId:'u1'});
  fireEvent.click(screen.getByRole('button',{name:'Текущие сеансы'}));
  expect(screen.getByRole('combobox',{name:'Тема карты'})).toHaveTextContent('Актуальная тема');
});

it('all archived sources have honest empty state and explicit history access',()=>{
  render(<SessionSchema sessions={[sessions[0]]} goals={[]}/>);
  expect(screen.getByText(/Нет текущих сеансов/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'С архивом'}));
  expect(screen.getByRole('combobox',{name:'Тема карты'})).toHaveTextContent('Историческая тема');
  fireEvent.click(screen.getByRole('button',{name:'Хронология'}));
  expect(screen.getByRole('table')).toBeInTheDocument();
});

it('JourneyMap direct rendering hides archived session unless explicitly requested',()=>{
  const view=render(<JourneyMap sessions={sessions} goals={goals}/>);
  expect(screen.getByRole('combobox',{name:'Тема карты'})).toHaveTextContent('Актуальная тема');
  view.rerender(<JourneyMap sessions={sessions} goals={goals} selectedSessionId="historic"/>);
  expect(screen.getByRole('combobox',{name:'Тема карты'})).toHaveTextContent('Историческая тема');
});

it('separate archived recommendation is absent from active map/chronology but preserved in history',()=>{
  const session={id:'s-recommendation',title:'Мои идеи',chatHistory:[
    {id:'u1',role:'user',content:'Что проверить'},
    {id:'a1',role:'assistant',content:'Предлагаю один шаг',
      interaction:{version:'reflect.interaction.v1',recommendationCandidates:[
        {title:'Архивная рекомендация'}]}}
  ],recommendationDecisions:{
    'r-a1-0':{status:'saved',title:'Архивная рекомендация',
      assistantMessageId:'a1',candidateIndex:0,archivedAt:{seconds:1}}
  }};
  render(<SessionSchema sessions={[session,{...sessions[0]}]} goals={[]}
    selectedSessionId="s-recommendation"/>);
  expect(screen.queryByRole('button',{name:/AI-предложение: Архивная рекомендация/}))
    .not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Хронология'}));
  expect(screen.queryByText('Архивная рекомендация')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'С архивом'}));
  expect(screen.getByText('Архивная рекомендация')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Карта пути'}));
  expect(screen.getByRole('button',{name:/AI-предложение: Архивная рекомендация/}))
    .toBeInTheDocument();
});
