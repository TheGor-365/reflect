import { expect, test } from 'vitest';
import { sessionWorkProgress as calculate } from './sessionWorkProgress';
const base={
  id:'session-01',
  chatHistory:[
    {id:'u1',role:'user',content:'Хочу начать проект'},
    {id:'a1',role:'assistant',interaction:{
      version:'reflect.interaction.v1',clarifyingQuestion:'С чего начнёшь?',
      insights:['Есть тревога','Нужно ограничить scope']}},
    {id:'u2',role:'user',content:'Со старта минимальной версии'},
    {id:'a2',role:'assistant',interaction:{
      version:'reflect.interaction.v1',clarifyingQuestion:'Как проверишь?',
      insights:['Проверить на клиенте']}},
    {id:'u3',role:'user',content:'Тестовыми продажами'}
  ],
  hypothesisReviews:{
    'h-a1-0':{assistantMessageId:'a1',hypothesisIndex:0,
      grade:0,comment:'Это не страх рекламы'},
    'h-a1-1':{assistantMessageId:'a1',hypothesisIndex:1,
      grade:4,comment:'Это действительно главное'}
  },
  returnCheckIns:[
    {id:'r1',type:'return-check-in',author:'user',text:'Собрал первую форму'},
    {id:'r2',type:'return-check-in',author:'user',text:'Исправил проверку'}
  ]
};
const linked={id:'g1',sessionId:'session-01',status:'active',completed:false,
  subItems:[{id:'s1',text:'Сделать форму',completed:true},
    {id:'s2',text:'Проверить форму',completed:false}]};
test('R6: one source-backed percent with additive transparent 100-point rubric',()=>{
  const p=calculate(base,[{...linked,status:'completed',completed:true}]);
  expect(p).toMatchObject({percent:95,max:100,points:95});
  expect(p.rows.map(r=>[r.id,r.points,r.max])).toEqual([
    ['saved',10,10],['dialogue',10,15],['answers',10,10],
    ['reviews',10,10],['comments',10,10],['returns',10,10],
    ['goal',15,15],['steps',20,20]
  ]);
  expect(p).not.toHaveProperty('diagnosis');
  expect(p).not.toHaveProperty('aiAccuracy');
});
test('R6: an unchanged one-message session starts at 10, no assumed owner success',()=>{
  expect(calculate({id:'solo',chatHistory:[
    {id:'u1',role:'user',content:'Описал проблему'}]}).percent).toBe(10);
  expect(calculate({id:'solo',chatHistory:[
    {id:'a1',role:'assistant',content:'AI can hallucinate'}]}).percent).toBe(0);
});
test('R6: effort changes with legitimate owner ratings, comments and goal steps',()=>{
  const old=calculate(base,[linked]), 
    rated=calculate({...base,hypothesisReviews:{}},[linked]),
    unlinked=calculate(base,[{...linked,sessionId:'another'}]);
  expect(old.percent).toBe(85);
  expect(old.percent-rated.percent).toBe(20);
  expect(old.percent-unlinked.percent).toBe(25);
  const complete=calculate(base,[{...linked,status:'completed',completed:true}]);
  expect(complete.percent-old.percent).toBe(10);
});
test('R6: forged review keys, AI turns, cross-session goals and malformed data fail closed',()=>{
  const forged={...base,chatHistory:[
    {id:'a1',role:'assistant',interaction:{version:'fake.v1',
      insights:['text'],clarifyingQuestion:'?'}},
    {id:'u1',role:'user',content:'Hello'}
  ],hypothesisReviews:{
    'h-a1-0':{assistantMessageId:'a1',hypothesisIndex:0,
      grade:4,comment:'Fraud'}
  },returnCheckIns:[{id:'r1',type:'return-check-in',author:'ai',text:'Done'}]};
  expect(calculate(forged,[{...linked,sessionId:'another'}]).percent).toBe(10);
  expect(calculate(null)).toMatchObject({percent:0,points:0});
  expect(calculate({id:'x',chatHistory:[
    {id:'a1',role:'assistant',interaction:{version:'reflect.interaction.v1',
      clarifyingQuestion:{evil:true}}},
    {id:'u1',role:'user',content:'Hello'}],
    returnCheckIns:[{id:'r1',type:'return-check-in',author:'user',
      text:{evil:true}}]}).percent).toBe(10);
  expect(calculate(base).percent).toBeLessThan(calculate(base,[linked]).percent);
});
