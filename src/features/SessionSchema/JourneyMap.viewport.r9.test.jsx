import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import JourneyMap from './JourneyMap';
import { layoutJourney } from './journeyModel';

const sessions = [
  { id:'session-first', title:'Первый сеанс', chatHistory:[
    {id:'user-first',role:'user',content:'Только первая тема'}
  ]},
  { id:'session-second', title:'Второй сеанс', chatHistory:[
    {id:'user-second',role:'user',content:'Только вторая тема'}
  ]}
];
const labels = () => [...document.querySelectorAll('.reflect-journey-node span')]
  .map(element => element.textContent);

describe('R9.1 one session per scrollable map', () => {
  it('shows only the first session initially; chooser replaces, never merges maps', () => {
    render(<JourneyMap sessions={sessions}/>);
    expect(labels()).toContain('Только первая тема');
    expect(labels()).not.toContain('Только вторая тема');
    fireEvent.click(screen.getByRole('combobox',{name:'Тема карты'}));
    expect(screen.queryByRole('option',{name:'Все темы'})).toBeNull();
    fireEvent.click(screen.getByRole('option',{name:'Второй сеанс'}));
    expect(labels()).toContain('Только вторая тема');
    expect(labels()).not.toContain('Только первая тема');
    expect(screen.getByLabelText('Краткие показатели выбранной темы'))
      .toHaveTextContent('1');
  });

  it("respects the caller-selected session without mixing another owner's records", () => {
    render(<JourneyMap sessions={sessions} selectedSessionId='session-second'/>);
    expect(labels()).toContain('Только вторая тема');
    expect(labels()).not.toContain('Только первая тема');
  });

  it('uses node-based dimensions and grows scroll surface when zooming', () => {
    const projected={nodes:[{id:'s',sessionId:'only',type:'session',label:'Сеанс'}],edges:[]};
    const measured=layoutJourney(projected);
    expect(measured.width).toBeLessThan(2030);
    render(<JourneyMap sessions={sessions}/>);
    const viewport=screen.getByRole('region',{name:'Интерактивная диаграмма связей'});
    const surface=viewport.querySelector('.reflect-journey-surface');
    expect(surface).toBeTruthy();
    const widthBefore=Number.parseFloat(surface.style.width);
    const heightBefore=Number.parseFloat(surface.style.height);
    fireEvent.click(screen.getByRole('button',{name:'Увеличить масштаб'}));
    expect(Number.parseFloat(surface.style.width)).toBeGreaterThan(widthBefore);
    expect(Number.parseFloat(surface.style.height)).toBeGreaterThan(heightBefore);
    // Arrow controls operate on true browser scroll offsets.
    viewport.scrollLeft=100;viewport.scrollTop=100;
    fireEvent.click(screen.getByRole('button',{name:'Сдвинуть влево'}));
    expect(viewport.scrollLeft).toBe(175);
    fireEvent.click(screen.getByRole('button',{name:'Сдвинуть вверх'}));
    expect(viewport.scrollTop).toBe(175);
  });

  it('contains all projected nodes with a positive inset', () => {
    const projected={nodes:[
      {id:'s',sessionId:'only',type:'session',label:'Сеанс'},
      {id:'u',sessionId:'only',type:'turn',author:'user',label:'Текст'},
      {id:'a',sessionId:'only',type:'turn',author:'ai',label:'Ответ'}
    ],edges:[]};
    const view=layoutJourney(projected);
    expect(view.nodes.every(n=>n.x>=28 && n.y>=28)).toBe(true);
    expect(view.nodes.every(n=>n.x+n.width<view.width && n.y+n.height<view.height)).toBe(true);
  });
});
