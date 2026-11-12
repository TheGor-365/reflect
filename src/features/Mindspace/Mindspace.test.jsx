import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Mindspace from './Mindspace';
import { saveMindLink, removeMindLink, renameMindTopic } from './mindspaceOperations';

vi.mock('./mindspaceOperations',()=>({
  saveMindLink:vi.fn(),removeMindLink:vi.fn(),renameMindTopic:vi.fn()
}));
const sessions=[
  {id:'s-1',title:'Работа и развитие',chatHistory:[]},
  {id:'s-2',title:'Отдых и ресурс',chatHistory:[]}
];
const goals=[{id:'goal-1',text:'Готовить MVP',sessionId:'s-1'}];
beforeEach(()=>{
  vi.clearAllMocks();
  saveMindLink.mockResolvedValue({id:'ml-session-s-2'});
  removeMindLink.mockResolvedValue(true);
  renameMindTopic.mockResolvedValue('Тема в карте');
});

describe('PRODUCT-05B Mindspace UI',()=>{
  it('shows real source nodes and no fabricated confirmed links',()=>{
    render(<Mindspace sessions={sessions} goals={goals}
      userId="synthetic-owner"/>);
    expect(screen.getByRole('heading',{name:'Mindspace.'})).toBeInTheDocument();
    expect(screen.getByLabelText('Подтверждённые смысловые связи'))
      .toHaveTextContent('0');
    expect(screen.getByRole('region',{
      name:'Прокручиваемое смысловое пространство'
    })).toBeInTheDocument();
    expect(saveMindLink).not.toHaveBeenCalled();
  });
  it('requires source choice, second node and explicit confirmation before writes',async()=>{
    render(<Mindspace sessions={sessions} goals={goals}
      userId="synthetic-owner"/>);
    fireEvent.click(screen.getByRole('button',{
      name:/Тема: Работа и развитие/
    }));
    expect(saveMindLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{
      name:/Связать с темой или целью/
    }));
    expect(screen.getByText(/Выберите вторую тему или цель/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Тема: Отдых и ресурс/}));
    expect(screen.getByRole('region',{
      name:'Прокручиваемое смысловое пространство'
    })).toBeInTheDocument();
    expect(saveMindLink).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox',{name:/Как связаны эти темы/}),{
      target:{value:'supports'}
    });
    fireEvent.change(screen.getByRole('textbox',{name:/Почему вы видите связь/}),{
      target:{value:'Работа влияет на отдых'}
    });
    fireEvent.click(screen.getByRole('button',{name:'Подтвердить связь'}));
    await waitFor(()=>expect(saveMindLink).toHaveBeenCalledExactlyOnceWith({
      userId:'synthetic-owner',sourceSessionId:'s-1',
      targetKind:'session',targetId:'s-2',
      relation:'supports',note:'Работа влияет на отдых'
    }));
    expect(screen.getByText(/сохранена в вашей теме/)).toBeInTheDocument();
  });
  it('links a goal with real existing user source, never AI side effects',async()=>{
    render(<Mindspace sessions={sessions} goals={goals}
      userId="synthetic-owner"/>);
    fireEvent.click(screen.getByRole('button',{name:/Тема: Работа и развитие/}));
    fireEvent.click(screen.getByRole('button',{name:/Связать с темой или целью/}));
    fireEvent.click(screen.getByRole('button',{name:/Цель: Готовить MVP/}));
    fireEvent.click(screen.getByRole('button',{name:'Подтвердить связь'}));
    await waitFor(()=>expect(saveMindLink).toHaveBeenCalledWith(expect.objectContaining({
      targetKind:'goal',targetId:'goal-1'
    })));
  });
  it('retains changes for manual retry after a failed transaction',async()=>{
    saveMindLink.mockRejectedValueOnce(new Error('Не удалось связать'));
    render(<Mindspace sessions={sessions} goals={goals}
      userId="synthetic-owner"/>);
    fireEvent.click(screen.getByRole('button',{name:/Тема: Работа и развитие/}));
    fireEvent.click(screen.getByRole('button',{name:/Связать с темой или целью/}));
    fireEvent.click(screen.getByRole('button',{name:/Тема: Отдых и ресурс/}));
    const textbox=screen.getByRole('textbox',{name:/Почему вы видите связь/});
    fireEvent.change(textbox,{target:{value:'Мой личный смысл'}});
    fireEvent.click(screen.getByRole('button',{name:'Подтвердить связь'}));
    await waitFor(()=>expect(screen.getByRole('alert'))
      .toHaveTextContent('Не удалось связать'));
    expect(textbox).toHaveValue('Мой личный смысл');
    expect(saveMindLink).toHaveBeenCalledTimes(1);
  });
  it('requires secondary confirmation to delete a saved semantic link',async()=>{
    const stored=[
      {...sessions[0],mindLinks:[{
        id:'ml-session-s-2',targetKind:'session',targetId:'s-2',
        relation:'related',note:'Это мой вывод',
        author:'user',status:'confirmed'
      }]},sessions[1]
    ];
    render(<Mindspace sessions={stored} goals={goals}
      userId="synthetic-owner"/>);
    fireEvent.click(screen.getByRole('button',{name:/Тема: Работа и развитие/}));
    fireEvent.click(screen.getByRole('button',{name:/Перекликаются/}));
    fireEvent.click(screen.getByRole('button',{name:'Удалить связь'}));
    expect(removeMindLink).not.toHaveBeenCalled();
    expect(screen.getByText(/Удалить только эту связь/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Да, удалить связь'}));
    await waitFor(()=>expect(removeMindLink).toHaveBeenCalledExactlyOnceWith({
      userId:'synthetic-owner',sourceSessionId:'s-1',
      targetKind:'session',targetId:'s-2'
    }));
  });
  it('opens the exact sourced record, switches to accessible list and back',()=>{
    const onOpenSource=vi.fn();
    render(<Mindspace sessions={sessions} goals={goals}
      userId="synthetic-owner" onOpenSource={onOpenSource}/>);
    fireEvent.click(screen.getByRole('button',{name:'Список'}));
    expect(screen.getByRole('region',{
      name:'Список тем, целей и AI-идей'
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Цель: Готовить MVP/}));
    fireEvent.click(screen.getByRole('button',{name:/Открыть источник/}));
    expect(onOpenSource).toHaveBeenCalledExactlyOnceWith({
      kind:'goal',goalId:'goal-1',sessionId:'s-1'
    });
    fireEvent.click(screen.getByRole('button',{name:'Карта'}));
    expect(screen.getByRole('region',{
      name:'Прокручиваемое смысловое пространство'
    })).toBeInTheDocument();
  });
  it('AI proposals are visually optional and never become confirmed link count',()=>{
    const withAi=[{...sessions[0],chatHistory:[{
      id:'assistant-99',role:'assistant',
      interaction:{version:'reflect.interaction.v1',
        recommendationCandidates:[{title:'Отдохнуть 10 минут',rationale:'Вариант'}]}
    }]},sessions[1]];
    render(<Mindspace sessions={withAi} goals={goals}
      userId="synthetic-owner"/>);
    expect(screen.getByRole('button',{name:/Идея AI: Отдохнуть 10 минут/}))
      .toBeInTheDocument();
    expect(screen.getByLabelText('Подтверждённые смысловые связи'))
      .toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button',{name:/Идеи AI видны/}));
    expect(screen.queryByRole('button',{
      name:/Идея AI: Отдохнуть 10 минут/
    })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Идеи AI скрыты/}));
    expect(screen.getByRole('button',{
      name:/Идея AI: Отдохнуть 10 минут/
    })).toBeInTheDocument();
  });
  it('shows honest empty state without synthetic psychological facts',()=>{
    render(<Mindspace sessions={[]} goals={[]}
      userId="synthetic-owner"/>);
    expect(screen.getByText(/Смыслы появятся из ваших записей/))
      .toBeInTheDocument();
    expect(screen.queryByText(/психологического роста: 100%/)).toBeNull();
  });
});

it('a map-only rename requires confirmation and never mutates the session transcript',async()=>{
  render(<Mindspace sessions={sessions} goals={goals}
    userId="synthetic-owner"/>);
  fireEvent.click(screen.getByRole('button',{name:/Тема: Работа и развитие/}));
  fireEvent.click(screen.getByRole('button',{name:/Изменить подпись на карте/}));
  expect(renameMindTopic).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox',{name:/Подпись темы на карте/}),{
    target:{value:'Работа и приоритеты'}
  });
  fireEvent.click(screen.getByRole('button',{name:'Сохранить подпись'}));
  await waitFor(()=>expect(renameMindTopic).toHaveBeenCalledExactlyOnceWith({
    userId:'synthetic-owner',sourceSessionId:'s-1',
    title:'Работа и приоритеты'
  }));
  expect(sessions[0].title).toBe('Работа и развитие');
});
