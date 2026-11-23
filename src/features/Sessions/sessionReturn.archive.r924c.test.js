import { beforeEach,expect,test,vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { saveSessionReturn } from './sessionReturn';
vi.mock('../../firebase/config',()=>({db:{},appId:'reflect-8fdc8'}));
vi.mock('firebase/firestore',()=>({
  doc:vi.fn((_db,root,id)=>({path:`${root}/${id}`})),
  runTransaction:vi.fn(),serverTimestamp:vi.fn(()=>({stamp:'server'})),
  Timestamp:{now:vi.fn(()=>({stamp:'device'}))}
}));
const input={userId:'owner1',sessionId:'session1',visitId:'visit1',note:'Я действительно проверил'};
let session,goal,writes;
beforeEach(()=>{
  vi.clearAllMocks();writes=[];
  session={archivedAt:{seconds:1790000000},chatHistory:[],returnCheckIns:[]};
  goal=null;
  runTransaction.mockImplementation(async(_db,callback)=>callback({
    get:vi.fn(async ref=>{const value=ref.path.includes('/goals/')?goal:session;
      return {exists:()=>value!==null,data:()=>value};}),
    update:vi.fn((ref,patch)=>writes.push({ref,patch}))
  }));
});
test('archive blocks authored return, not just paid AI',async()=>{
  await expect(saveSessionReturn(input)).rejects.toThrow(/архиве/);
  expect(writes).toHaveLength(0);
});
test('duplicate acknowledged return is a read-only no-op after archival',async()=>{
  session.returnCheckIns=[{id:'visit1',author:'user',type:'return-check-in',text:'Исходный результат'}];
  const found=await saveSessionReturn(input);
  expect(found.text).toBe('Исходный результат');
  expect(writes).toHaveLength(0);
});
test('archive of linked goal blocks return when source session itself is active',async()=>{
  delete session.archivedAt;
  session.recommendationDecisions={'r-a1-0':{
    status:'accepted',goalId:'goal1',assistantMessageId:'a1'
  }};
  goal={id:'goal1',archivedAt:{seconds:1790000000},sessionId:'session1',
    sourceType:'user-accepted-ai-recommendation',sourceRecommendationKey:'r-a1-0',
    sourceAssistantMessageId:'a1'};
  await expect(saveSessionReturn({...input,goalId:'goal1',nextStep:'Свой шаг'}))
    .rejects.toThrow(/цель в архиве/);
  expect(writes).toHaveLength(0);
});
