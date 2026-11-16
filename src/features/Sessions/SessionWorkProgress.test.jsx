import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import SessionWorkProgress from './SessionWorkProgress';
const session={
  id:'s1',chatHistory:[{id:'u1',role:'user',content:'Запускаю продукт'}]
};
test('R6: single graphical session indicator is accessible and table starts collapsed',()=>{
  render(<SessionWorkProgress session={session} goals={[]}/>);
  const meter=screen.getByRole('progressbar',
    {name:'Зафиксированная работа над темой'});
  expect(meter).toHaveAttribute('aria-valuenow','10');
  const button=screen.getByRole('button',{name:/Проработка темы: 10%/});
  expect(button).toHaveAttribute('aria-expanded','false');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded','true');
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.getByRole('columnheader',{name:'Баллы'})).toBeInTheDocument();
  expect(screen.getByText(/не оценка человека/)).toBeInTheDocument();
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded','false');
});
test('R6: meter responds to changes in persisted source props, no model call',()=>{
  const goals=[];
  const {rerender}=render(<SessionWorkProgress session={session} goals={goals}/>);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','10');
  rerender(<SessionWorkProgress session={{...session,chatHistory:[
    ...session.chatHistory,{id:'u2',role:'user',content:'Продолжил обсуждение'}
  ]}} goals={goals}/>);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','15');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

test('R7: compact meter has a discoverable open/close affordance and accessible scroll region',()=>{
  render(<div className="reflect-app"><SessionWorkProgress session={session} goals={[]}/></div>);
  const toggle=screen.getByRole('button',{name:/Проработка темы: 10%/});
  expect(toggle).toHaveAttribute('aria-expanded','false');
  expect(toggle).toHaveTextContent('Проработка темы');
  expect(toggle).toHaveTextContent('Подробнее');
  const panel=document.querySelector('.reflect-session-work-breakdown');
  expect(panel).toHaveAttribute('tabindex','-1');
  expect(screen.queryByRole('region',{name:'Вклад событий в проработку темы'}))
    .not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded','true');
  expect(toggle).toHaveTextContent('Свернуть');
  expect(screen.getByRole('region',{name:'Вклад событий в проработку темы'}))
    .toHaveAttribute('tabindex','0');
  expect(screen.getAllByRole('row')).toHaveLength(10); // heading + 8 factors + total
  fireEvent.click(toggle);
  expect(toggle).toHaveTextContent('Подробнее');
  expect(panel).toHaveAttribute('tabindex','-1');
  expect(toggle).toHaveAttribute('aria-expanded','false');
});

test('R7 CSS layout contract: progress cannot flex-shrink or hide the lower table rows',()=>{
  const css=readFileSync(resolve('src/index.css'),'utf8');
  expect(css).toMatch(
    /\.reflect-app \.reflect-session-chat > \.reflect-session-work\s*\{[^}]*flex:0 0 auto;/s
  );
  expect(css).toMatch(
    /\.reflect-app \.reflect-session-work-breakdown\s*\{[^}]*max-height:clamp\([^}]*overflow-y:auto;/s
  );
  expect(css).toMatch(/\.reflect-app \.reflect-session-work-toggle\s*\{[^}]*min-height:60px;/s);
  expect(css).toMatch(/\.reflect-app \.reflect-session-work-breakdown table\s*\{[^}]*table-layout:fixed;/s);
});
