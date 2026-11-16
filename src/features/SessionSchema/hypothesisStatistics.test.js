import { expect, test } from 'vitest';
import { summarizeOwnerHypothesisRatings as summarize } from './hypothesisStatistics';
const at = iso => ({seconds: Date.parse(iso)/1000});
const data = [{
  id:'s1', chatHistory:[
    {id:'a1',role:'assistant',interaction:{
      version:'reflect.interaction.v1',insights:['Важен опыт','Нужен план']
    }},
    {id:'a2',role:'assistant',interaction:{
      version:'reflect.interaction.v2',insights:['Нужен собственный критерий']
    }},
    {id:'u1',role:'user',interaction:{insights:['Некорректный источник']}}
  ],
  hypothesisReviews:{
    'h-a1-0':{assistantMessageId:'a1',hypothesisIndex:0,grade:4,
      reviewedAt:at('2026-11-16T10:00:00Z')},
    'h-a1-1':{assistantMessageId:'a1',hypothesisIndex:1,grade:0,
      reviewedAt:at('2026-09-10T10:00:00Z')},
    'h-a2-0':{assistantMessageId:'a2',hypothesisIndex:0,grade:2,
      reviewedAt:at('2026-11-16T09:00:00Z')},
    'h-fake-0':{assistantMessageId:'fake',hypothesisIndex:0,grade:4}
  }
}];
test('R5 tracks 5 grades sourced only to saved current AI hypotheses',()=>{
  const summary=summarize(data);
  expect(summary).toMatchObject({
    reviewed:3,reviewable:3,counts:[1,0,1,0,1],
    miss:1,partial:1,match:1
  });
  expect(summary).not.toHaveProperty('accuracy');
  expect(summary).not.toHaveProperty('successRate');
});
test('R5 filters by session and real review time rather than model claim',()=>{
  const nowMs=Date.parse('2026-11-16T11:00:00Z');
  const scoped=summarize(data,{period:'7d',nowMs});
  expect(scoped).toMatchObject({reviewed:2,reviewable:2,match:1,partial:1,miss:0});
  expect(summarize(data,{sessionId:'none'}).reviewed).toBe(0);
});
test('R5 a missing, malformed, impersonated or stale review is not counted',()=>{
  const copy=structuredClone(data);
  copy[0].hypothesisReviews['h-a1-0'].assistantMessageId='wrong-source';
  copy[0].hypothesisReviews['h-a1-1'].grade=5;
  expect(summarize(copy)).toMatchObject({reviewable:3,reviewed:1,
    miss:0,partial:1,match:0});
});
test('R5 updating an owner's existing grade changes distribution, not denominator',()=>{
  const copy=structuredClone(data);
  copy[0].hypothesisReviews['h-a1-0'].grade=0;
  expect(summarize(copy)).toMatchObject({reviewed:3,match:0,miss:2});
});
