import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    const kind=screen.getByRole('combobox',{name:'Тип событий'});
    fireEvent.click(kind);
    expect(document.querySelector('select')).toBeNull();
    fireEvent.click(screen.getByRole('option',{name:'Возвращения'}));
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
  it('shows real mobile graph controls rather than forcing the flat mobile list',()=>{
    vi.stubGlobal('matchMedia',vi.fn().mockImplementation(query=>({
      matches:query==='(max-width: 600px)',media:query,
      addEventListener:vi.fn(),removeEventListener:vi.fn()
    })));
    render(<JourneyMap sessions={sessions} goals={goals}/>);
    expect(screen.getByRole('region',{name:'Интерактивная диаграмма связей'}))
      .toBeTruthy();
    expect(screen.getByLabelText('Масштаб')).toHaveTextContent('62%');
    expect(screen.getByText(/Перемещайте карту пальцем/)).toBeTruthy();
    const toggle=screen.getByRole('button',{name:'Лента'});
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button',{name:'Скрыть ленту'}).getAttribute('aria-expanded'))
      .toBe('true');
    expect(screen.getByRole('heading',{name:'Лента карты'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Сбросить масштаб и смещение'}));
    expect(screen.getByLabelText('Масштаб')).toHaveTextContent('62%');
  });
  it('supports touch pan on background and pinch zoom without writing data',()=>{
    vi.stubGlobal('matchMedia',vi.fn().mockReturnValue({matches:true}));
    // jsdom has no native PointerEvent constructor. Testing-library needs
    // a real pointer-shaped event rather than a generic Event with no coords.
    vi.stubGlobal('PointerEvent',class PointerEvent extends MouseEvent {
      constructor(type,init={}){
        super(type,init);
        Object.defineProperty(this,'pointerId',{value:init.pointerId??1});
        Object.defineProperty(this,'pointerType',{value:init.pointerType??'mouse'});
      }
    });
    render(<JourneyMap sessions={sessions} goals={goals}/>);
    const viewport=screen.getByRole('region',{name:'Интерактивная диаграмма связей'});
    const world=viewport.querySelector('.reflect-journey-world');
    expect(world.style.transform).toContain('scale(0.62)');
    fireEvent.pointerDown(viewport,{pointerType:'touch',pointerId:1,button:0,clientX:90,clientY:120});
    fireEvent.pointerMove(viewport,{pointerType:'touch',pointerId:1,clientX:120,clientY:155});
    expect(world.style.transform).toContain('translate(38px, 43px)');
    fireEvent.pointerDown(viewport,{pointerType:'touch',pointerId:2,button:0,clientX:200,clientY:120});
    fireEvent.pointerMove(viewport,{pointerType:'touch',pointerId:2,clientX:250,clientY:120});
    expect(screen.getByLabelText('Масштаб').textContent).not.toBe('62%');
    fireEvent.pointerUp(viewport,{pointerType:'touch',pointerId:1});
    fireEvent.pointerUp(viewport,{pointerType:'touch',pointerId:2});
  });
  it('resets graph scale when breakpoint changes, not on every resize',()=>{
    let mobile=false;
    vi.stubGlobal('matchMedia',vi.fn().mockImplementation(()=>({get matches(){return mobile;}})));
    render(<JourneyMap sessions={sessions} goals={goals}/>);
    fireEvent.click(screen.getByRole('button',{name:'Увеличить масштаб'}));
    expect(screen.getByLabelText('Масштаб')).toHaveTextContent('90%');
    fireEvent(window,new Event('resize'));
    expect(screen.getByLabelText('Масштаб')).toHaveTextContent('90%');
    mobile=true;
    fireEvent(window,new Event('resize'));
    expect(screen.getByLabelText('Масштаб')).toHaveTextContent('62%');
  });

});

afterEach(()=>vi.unstubAllGlobals());

it('M1.5: journey evidence is an explanatory table, not seven large score cards',()=>{
  render(<JourneyMap sessions={sessions} goals={goals}/>);
  const table=screen.getByRole('table',{name:'Фактические метрики выбранной темы'});
  expect(table).toBeInTheDocument();
  expect(table.querySelectorAll('tbody tr')).toHaveLength(7);
  expect(table).toHaveTextContent('Ваши сообщения');
  expect(table).toHaveTextContent('Ответы Reflect');
  expect(table).toHaveTextContent('Период обсуждения');
  expect(table).toHaveTextContent('не длительность работы над проблемой');
  expect(table).toHaveTextContent('Принятые решения');
  expect(table).not.toHaveTextContent('% роста личности');
});
