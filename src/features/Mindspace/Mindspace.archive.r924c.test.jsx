import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Mindspace from './Mindspace';
import { buildMindspace } from './mindspaceModel';
import { saveMindLink, removeMindLink, renameMindTopic, saveMindZone } from './mindspaceOperations';

vi.mock('./mindspaceOperations',()=>({
  saveMindLink:vi.fn(),removeMindLink:vi.fn(),renameMindTopic:vi.fn(),saveMindZone:vi.fn()
}));
const archivedAt={seconds:1795000000};
const sessions=[
  {id:'live',title:'Текущая тема',mindLinks:[{
    id:'ml-session-old',targetKind:'session',targetId:'old',
    relation:'related',author:'user',status:'confirmed'
  }]},
  {id:'old',title:'Историческая тема',archivedAt,chatHistory:[{
    id:'assistant-1',role:'assistant',interaction:{version:'reflect.interaction.v1',
      recommendationCandidates:[{title:'Старая идея'}]}
  }]},
  {id:'legacy',title:'Сеанс без метаданных архива'}
];
const goals=[
  {id:'old-goal',text:'Архивная цель',archivedAt,sessionId:'live'},
  {id:'live-goal',text:'Живая цель с архивным источником',sessionId:'old'}
];
beforeEach(()=>vi.clearAllMocks());

describe('R9.2.4C-B Mindspace active versus preserved history',()=>{
  it('keeps active projections clean without losing archived references or semantic links',()=>{
    const before=structuredClone({sessions,goals});
    const active=buildMindspace(sessions,goals);
    const full=buildMindspace(sessions,goals,{includeArchived:true});
    const nodeIds=new Set(active.nodes.map(n=>n.id));
    expect(nodeIds.has('session:old')).toBe(false);
    expect(nodeIds.has('goal:old-goal')).toBe(false);
    expect(nodeIds.has('goal:live-goal')).toBe(true);
    expect(nodeIds.has('session:legacy')).toBe(true);
    expect(active.edges.some(e=>e.kind==='semantic')).toBe(false);
    expect(active.issues).not.toContain('missing-source-or-target');
    expect(full.nodes.find(n=>n.id==='session:old').archived).toBe(true);
    expect(full.nodes.find(n=>n.id==='goal:old-goal').archived).toBe(true);
    expect(full.nodes.find(n=>n.id==='proposal:old:assistant-1:0').archived).toBe(true);
    expect(full.confirmedLinks).toBe(1);
    expect(full.edges.find(e=>e.kind==='semantic')).toEqual(expect.objectContaining({
      id:'semantic:live:ml-session-old',from:'session:live',to:'session:old'
    }));
    expect({sessions,goals}).toEqual(before);
  });
  it('filters independent archived AI recommendations without losing archived provenance',()=>{
    const recSessions=[{id:'current',chatHistory:[{
      id:'assistant-1',role:'assistant',interaction:{version:'reflect.interaction.v1',
        recommendationCandidates:[{title:'Сохранённая идея'}]}
    }],recommendationDecisions:{'r-assistant-1-0':{status:'saved',archivedAt}}}];
    const active=buildMindspace(recSessions);
    expect(active.nodes.filter(n=>n.kind==='proposal')).toHaveLength(0);
    const history=buildMindspace(recSessions,[],{includeArchived:true});
    expect(history.nodes.find(n=>n.kind==='proposal')).toEqual(expect.objectContaining({
      archived:true,status:'saved'
    }));
  });
  it('hides archived nodes by default and permits source navigation but not mutation',()=>{
    const onOpenSource=vi.fn();
    render(<Mindspace userId="synthetic-owner" sessions={sessions} goals={goals}
      onOpenSource={onOpenSource}/>);
    expect(screen.queryByRole('button',{name:/Тема: Историческая тема/})).toBeNull();
    expect(screen.getByLabelText('Подтверждённые смысловые связи'))
      .toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button',{name:'Архив: скрыт'}));
    expect(screen.getByLabelText('Подтверждённые смысловые связи'))
      .toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button',{name:/Тема: Историческая тема/}));
    expect(screen.getByText(/Архивная запись доступна только для просмотра/))
      .toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Связать с темой или целью/})).toBeNull();
    expect(screen.queryByRole('button',{name:/Изменить подпись на карте/})).toBeNull();
    expect(screen.queryByRole('button',{name:'Закрепить зону'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:/Открыть источник/}));
    expect(onOpenSource).toHaveBeenCalledExactlyOnceWith({kind:'session',sessionId:'old'});
    expect(saveMindLink).not.toHaveBeenCalled();
    expect(removeMindLink).not.toHaveBeenCalled();
    expect(renameMindTopic).not.toHaveBeenCalled();
    expect(saveMindZone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Архив: показан'}));
    expect(screen.queryByRole('button',{name:/Тема: Историческая тема/})).toBeNull();
  });
  it('does not expose a mutable editor when a confirmed link points into archive',()=>{
    render(<Mindspace userId="synthetic-owner" sessions={sessions} goals={goals}/>);
    fireEvent.click(screen.getByRole('button',{name:'Архив: скрыт'}));
    fireEvent.click(screen.getByRole('button',{name:/Тема: Текущая тема/}));
    fireEvent.click(screen.getByRole('button',{name:/Перекликаются/}));
    expect(screen.queryByRole('region',{name:'Подтверждение смысловой связи'})).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/Архивные связи/);
    expect(saveMindLink).not.toHaveBeenCalled();
  });
  it('does not show a previous owners late write acknowledgment after switching UID',async()=>{
    let finish;
    saveMindLink.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const result=render(<Mindspace userId="owner-a" sessions={sessions} goals={goals}/>);
    fireEvent.click(screen.getByRole('button',{name:/Тема: Текущая тема/}));
    fireEvent.click(screen.getByRole('button',{name:/Связать с темой или целью/}));
    fireEvent.click(screen.getByRole('button',{name:/Тема: Сеанс без метаданных архива/}));
    fireEvent.click(screen.getByRole('button',{name:'Подтвердить связь'}));
    expect(saveMindLink).toHaveBeenCalledTimes(1);
    result.rerender(<Mindspace userId="owner-b" sessions={[]} goals={[]}/>);
    finish({id:'ml-session-legacy'});
    await Promise.resolve();
    expect(screen.queryByText(/Вы подтвердили смысловую связь/)).toBeNull();
  });
  it('handles an all-archived account without inventing an empty first-run state',()=>{
    render(<Mindspace userId="synthetic-owner" sessions={[sessions[1]]} goals={[]}/>);
    expect(screen.getByText(/Все сохранённые темы и цели находятся в архиве/))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Показать архив'}));
    expect(screen.getByRole('button',{name:/Тема: Историческая тема/})).toBeInTheDocument();
  });
});
