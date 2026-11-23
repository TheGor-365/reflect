import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Goals from './Goals';

vi.mock('./goalOperations',()=>({
  createGoal:vi.fn(),newGoalId:vi.fn(),newSubtaskId:vi.fn(),
  removeGoal:vi.fn(),updateGoal:vi.fn()
}));
const goal=(id,archived)=>({id,text:id,type:'checklist',status:'active',
  completed:false,subItems:[],...(archived?{archivedAt:{seconds:1}}:{})});

test('R9.2.4B archived goals are excluded from active board, shown in archive', () => {
  const onSetArchived=vi.fn();
  render(<Goals goals={[goal('Active',false),goal('Hidden',true)]}
    userId="owner" onSetArchived={onSetArchived}/>);
  expect(screen.getByRole('article',{name:'Active'})).toBeInTheDocument();
  expect(screen.queryByRole('article',{name:'Hidden'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab',{name:/Архив/}));
  expect(screen.getByRole('article',{name:'Hidden'})).toBeInTheDocument();
  expect(screen.queryByRole('article',{name:'Active'})).not.toBeInTheDocument();
  expect(onSetArchived).not.toHaveBeenCalled();
});

test('R9.2.4B restoring a goal uses its original ID and does not update status',async()=>{
  const onSetArchived=vi.fn().mockResolvedValue({archived:false,changed:true});
  render(<Goals goals={[goal('restorable',true)]} userId="owner"
    onSetArchived={onSetArchived}/>);
  fireEvent.click(screen.getByRole('tab',{name:/Архив/}));
  fireEvent.click(screen.getByRole('button',{name:/Восстановить: цель/}));
  await waitFor(()=>expect(onSetArchived).toHaveBeenCalledExactlyOnceWith('restorable',false));
});
