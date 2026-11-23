import { beforeEach, expect, test, vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { updateGoal, saveGoalCompletionFeedback, removeGoal } from './goalOperations';
vi.mock('../../firebase/config',()=>({db:{},appId:'reflect-8fdc8'}));
vi.mock('firebase/firestore',()=>({
  collection:vi.fn(),doc:vi.fn((_db,path,id)=>({path:`${path}/${id}`})),
  deleteField:vi.fn(),runTransaction:vi.fn(),
  serverTimestamp:vi.fn(()=>({stamp:'server'})),
  Timestamp:{fromDate:vi.fn(date=>date)}
}));
let source,writes;
beforeEach(()=>{
  vi.clearAllMocks(); writes=[];
  source={text:'Сохранённая цель',status:'completed',completed:true,
    checklistFeedback:{rating:3,comment:'Мой итог'}};
  runTransaction.mockImplementation(async(_db,callback)=>callback({
    get:vi.fn(async()=>({exists:()=>true,data:()=>source})),
    update:vi.fn((ref,patch)=>writes.push({ref,patch})),
    delete:vi.fn((ref)=>writes.push({ref,deleted:true}))
  }));
});

test('concurrent archive blocks goal progress, edits and completion feedback inside transactions',async()=>{
  source.archivedAt={seconds:1790000000};
  await expect(updateGoal('owner1','goal1',{kind:'status',status:'active'}))
    .rejects.toThrow(/архиве/);
  await expect(updateGoal('owner1','goal1',{kind:'edit',text:'Исправление',purpose:''}))
    .rejects.toThrow(/архиве/);
  await expect(saveGoalCompletionFeedback('owner1','goal1',{rating:4,comment:'Новый итог'},
    {rating:3,comment:'Мой итог'})).rejects.toThrow(/архиве/);
  await expect(removeGoal('owner1','goal1')).rejects.toThrow(/Архивную цель/);
  expect(writes).toHaveLength(0);
});

test('restored goal permits its original transaction with original owner ID',async()=>{
  source={text:'Обычная цель',status:'active',completed:false,subItems:[]};
  await updateGoal('owner1','goal1',{kind:'status',status:'paused'});
  expect(writes).toHaveLength(1);
  expect(writes[0].ref.path).toContain('users/owner1/goals/goal1');
  expect(writes[0].patch.status).toBe('paused');
});
