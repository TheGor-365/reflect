import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import DiaryNarrativeCard from './DiaryNarrativeCard';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));

const entry=(type,id,archived=false)=>({
  id,type,sourceKind:type,sourceId:id,eventKey:`${type}:${id}`,archived,
  isAppend:false,displayAt:null,sourceSessionArchived:false,entryIndex:0,
  data:type==='session'
    ? {title:'Исторический сеанс',chatHistory:[{role:'user',content:'Моя мысль'}]}
    : type==='goal'
      ? {id,text:'Подтверждённая цель',type:'reflection',reflections:[]}
      : {id,entries:[{text:'Запись без потери данных'}]}
});

test('archived session remains navigable but cannot be renamed from a stale editor',()=>{
  const rename=vi.fn(),open=vi.fn();
  const view=render(<DiaryNarrativeCard entry={entry('session','s1')}
    onRenameSession={rename} onOpenSession={open}/>);
  fireEvent.click(screen.getByRole('button',{name:'Изменить заголовок сеанса'}));
  view.rerender(<DiaryNarrativeCard entry={entry('session','s1',true)}
    onRenameSession={rename} onOpenSession={open}/>);
  expect(screen.getByText('В архиве · только чтение')).toBeInTheDocument();
  expect(screen.queryByRole('textbox',{name:'Название размышления'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Изменить заголовок сеанса'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Источник и история'}));
  fireEvent.click(screen.getByRole('button',{name:'Открыть беседу'}));
  expect(open).toHaveBeenCalledExactlyOnceWith('s1');
  expect(rename).not.toHaveBeenCalled();
});

test('archived goal has no append workflow while preserving its saved text',()=>{
  const append=vi.fn();
  render(<DiaryNarrativeCard entry={entry('goal','g1',true)} onAppend={append}/>);
  expect(screen.getByText('Цель: Подтверждённая цель')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Проработать'})).not.toBeInTheDocument();
  expect(append).not.toHaveBeenCalled();
});

test('archived note cannot edit or append, but version history remains accessible',()=>{
  const edit=vi.fn(),append=vi.fn();
  render(<DiaryNarrativeCard entry={entry('note','n1',true)}
    onEditNote={edit} onAppend={append}/>);
  expect(screen.getByText('Запись без потери данных')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Редактировать запись'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Дополнить заметку'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'История версий'}));
  expect(screen.getByRole('region',{name:'Версии записи'})).toBeInTheDocument();
  expect(edit).not.toHaveBeenCalled();
  expect(append).not.toHaveBeenCalled();
});

test('active goal linked to archived session is labeled but not silently archived',()=>{
  render(<DiaryNarrativeCard entry={{...entry('goal','g2'),sourceSessionArchived:true}}/>);
  expect(screen.getByText('Источник в архиве')).toBeInTheDocument();
  expect(screen.queryByText('В архиве · только чтение')).not.toBeInTheDocument();
});
