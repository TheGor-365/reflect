import React from 'react';
import { expect,test,vi } from 'vitest';
import { fireEvent,render,screen } from '@testing-library/react';
import SessionReturnCheckIn from './SessionReturnCheckIn';
import { saveSessionReturn } from './sessionReturn';
vi.mock('./sessionReturn',()=>({saveSessionReturn:vi.fn()}));
vi.mock('../../components/common/ProtectedDraftControls',()=>({default:()=>null}));

test('archived session retains read-only authored returns; no new form or AI call',()=>{
  render(<SessionReturnCheckIn userId="owner1" session={{
    id:'session1',archivedAt:{seconds:1790000000},returnCheckIns:[
      {id:'visit1',type:'return-check-in',author:'user',text:'Наблюдаемый результат'}
    ]
  }} expanded/>);
  expect(screen.getByText(/только просмотр ранее сохранённых наблюдений/)).toBeInTheDocument();
  expect(screen.getByText('Наблюдаемый результат')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Сохранить наблюдение'})).not.toBeInTheDocument();
  expect(saveSessionReturn).not.toHaveBeenCalled();
});
