import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import JourneyMap from './JourneyMap';
import SessionSchema from './SessionSchema';

const at=iso=>({seconds:Math.floor(Date.parse(iso)/1000)});
const sessions=[{
  id:'s1',title:'Вечернее чтение',
  chatHistory:[
    {id:'u1',role:'user',content:'Хочу прочитать книгу',timestamp:at('2026-11-10T12:00:00Z')},
    {id:'a1',role:'assistant',content:'Начните с небольших шагов',
      timestamp:at('2026-11-10T12:01:00Z'),
      interaction:{version:'reflect.interaction.v1',recommendationCandidates:[
        {title:'Читать по 20 минут',rationale:'Небольшая задача'}
      ]}
    }
  ],
  recommendationDecisions:{
    'r-a1-0':{status:'accepted',title:'Читать по 20 минут',
      assistantMessageId:'a1',candidateIndex:0,goalId:'g1',decidedAt:at('2026-11-10T12:02:00Z')}
  },
  returnCheckIns:[
    {id:'v1',author:'user',type:'return-check-in',
      text:'За два дня читал один раз',recordedAtClient:at('2026-11-12T18:00:00Z')}
  ]
}];
const goals=[{
  id:'g1',text:'Читать каждый вечер',sessionId:'s1',
  sourceAssistantMessageId:'a1',sourceRecommendationKey:'r-a1-0',
  createdAt:at('2026-11-10T12:02:15Z'),
  subItems:[{id:'st1',text:'Открыть книгу',completed:false}]
}];
describe('PRODUCT-04 Journey interactive UX',()=>{
  it('renders user-centered map by default and source links to saved turn',()=>{
    const open=vi.fn();
    render(<JourneyMap sessions={sessions} goals={goals} onOpenSource={open}/>);
    expect(screen.getByRole('region',{name:'Интерактивная диаграмма связей'})).toBeTruthy();
    expect(screen.getByText('Карта пути')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{
      name:/Решение: Читать по 20 минут/
    }));
    expect(screen.getByRole('complementary',{name:'Источник выбранного события'}))
      .toHaveTextContent('Принято пользователем');
    fireEvent.click(screen.getByRole('button',{name:'Открыть источник'}));
    expect(open).toHaveBeenCalledExactlyOnceWith({
      kind:'turn',sessionId:'s1',turnId:'a1'
    });
  });
  it('reaches exact goal and does not create a new goal on map interaction',()=>{
    const open=vi.fn();
    render(<JourneyMap sessions={sessions} goals={goals} onOpenSource={open}/>);
    fireEvent.click(screen.getByRole('button',{name:/Цель: Читать каждый вечер/}));
    fireEvent.click(screen.getByRole('button',{name:'Открыть источник'}));
    expect(open).toHaveBeenCalledExactlyOnceWith({
      kind:'goal',sessionId:'s1',goalId:'g1'
    });
  });
  it('provides keyboard-readable zoom, stable buttons and data filters',()=>{
    render(<JourneyMap sessions={sessions} goals={goals}/>);
    expect(screen.getByLabelText('Масштаб')).toHaveTextContent('80%');
    fireEvent.click(screen.getByRole('button',{name:'Увеличить масштаб'}));
    expect(screen.getByLabelText('Масштаб')).toHaveTextContent('90%');
    fireEvent.click(screen.getByRole('button',{name:'Сбросить масштаб и смещение'}));
    expect(screen.getByLabelText('Масштаб')).toHaveTextContent('80%');
    fireEvent.change(screen.getByRole('combobox',{name:'Тип событий'}),{
      target:{value:'returns'}
    });
    expect(screen.getByRole('button',{name:/Возвращение: За два дня читал один раз/}))
      .toBeTruthy();
    expect(screen.queryByRole('button',{name:/Цель: Читать каждый вечер/})).toBeNull();
    expect(screen.getByRole('heading',{name:'Лента карты'})).toBeTruthy();
  });
  it('preserves empty state without invented achievements or zero self-worth scores',()=>{
    render(<JourneyMap sessions={[]} goals={[]}/>);
    expect(screen.getByText('Пока нет сохранённых сеансов')).toBeTruthy();
    expect(screen.queryByText(/0% роста личности/)).toBeNull();
    expect(screen.queryByRole('button',{name:'Открыть источник'})).toBeNull();
  });
  it('retains original read-only chronological table via explicit switch',()=>{
    render(<SessionSchema sessions={sessions} goals={goals}/>);
    expect(screen.getByRole('heading',{name:'Карта пути'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Хронология'}));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('За два дня читал один раз')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Карта пути'}));
    expect(screen.getByRole('region',{name:'Интерактивная диаграмма связей'}))
      .toBeTruthy();
  });
});
