import React from 'react';
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
  const button=screen.getByRole('button',{name:/10%.*Проработка темы/});
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
