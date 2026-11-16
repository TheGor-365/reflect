import { expect, test } from 'vitest';
import { buildDeepGoalDrafts } from './automaticGoalDrafts';
const get=()=>{
  const session={id:'session-one',chatHistory:[
    {id:'user1',role:'user',content:'Хочу запустить MVP'},
    {id:'ai1',role:'assistant',interaction:{version:'reflect.interaction.v1',
      clarifyingQuestion:'Что мешает?',insights:[],
      recommendationCandidates:[]}},
    {id:'user2',role:'user',content:'Боюсь отзывов'},
    {id:'ai2',role:'assistant',interaction:{version:'reflect.interaction.v1',
      clarifyingQuestion:'Что проверим?',insights:[],
      recommendationCandidates:[]}},
    {id:'user3',role:'user',content:'Сначала небольшая версия'},
    {id:'ai3',role:'assistant',interaction:{version:'reflect.interaction.v1',
      stage:'synthesize',clarifyingQuestion:'',unknowns:[],
      insights:['Нужен короткий запуск','Нужна проверка спроса'],
      recommendationCandidates:[{title:'Запустить MVP с тремя функциями',
        rationale:'Владелец выбрал сокращённый scope',
        sourceRefs:['current-message']}]}},
    {id:'user4',role:'user',content:'Проверю спрос с первыми клиентами'}
  ],hypothesisReviews:{
    'h-ai3-0':{assistantMessageId:'ai3',hypothesisIndex:0,
      grade:4,comment:'Готов сократить scope'},
    'h-ai3-1':{assistantMessageId:'ai3',hypothesisIndex:1,
      grade:3,comment:'Готов показать первым клиентам'}
  }};
  const proposal={id:'session-one:r-ai3-0',sessionId:session.id,
    assistantMessageId:'ai3',status:'pending',
    title:'Запустить MVP с тремя функциями',
    rationale:'Владелец выбрал сокращённый scope'};
  return {session,proposal};
};
test('R6c prepares a deep validated draft but never creates an owner goal',()=>{
  const {session,proposal}=get();
  const drafts=buildDeepGoalDrafts([session],[proposal]);
  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    status:'auto-draft-needs-owner-approval',
    title:'Запустить MVP с тремя функциями',
    preparationPoints:55
  });
  expect(drafts[0]).not.toHaveProperty('goalId');
  expect(drafts[0]).not.toHaveProperty('dueDate');
});
test('R6c rejects shallow discussion, missing review and disputed reasons',()=>{
  const {session,proposal}=get();
  expect(buildDeepGoalDrafts([{...session,chatHistory:session.chatHistory.slice(0,3)}],
    [proposal])).toHaveLength(0);
  expect(buildDeepGoalDrafts([{...session,hypothesisReviews:{}}],[proposal]))
    .toHaveLength(0);
  const wrong={...session,hypothesisReviews:{...session.hypothesisReviews,
    'h-ai3-0':{assistantMessageId:'ai3',hypothesisIndex:0,
      grade:0,comment:'Это неверно'}}};
  expect(buildDeepGoalDrafts([wrong],[proposal])).toHaveLength(0);
});
test('R6c never includes another session, old recommendation, unresolved or accepted goal',()=>{
  const {session,proposal}=get();
  expect(buildDeepGoalDrafts([session],[{...proposal,sessionId:'jack'}]))
    .toHaveLength(0);
  expect(buildDeepGoalDrafts([session],[{...proposal,status:'accepted'}]))
    .toHaveLength(0);
  const unresolved={...session,chatHistory:session.chatHistory.map(turn=>
    turn.id==='ai3'?{...turn,interaction:{
      ...turn.interaction,unknowns:['Дата не согласована']
    }}:turn)};
  expect(buildDeepGoalDrafts([unresolved],[proposal])).toHaveLength(0);
});
