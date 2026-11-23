import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { saveHypothesisReview } from '../Sessions/hypothesisReviews';
import { applyRecommendationDecision } from '../Sessions/recommendationDecisions';
import { saveSessionReturn } from '../Sessions/sessionReturn';

vi.mock('../../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ serverTime: true })),
  Timestamp: {
    now: vi.fn(() => ({ seconds: 1790000000 })),
    fromDate: vi.fn(date => ({ date }))
  }
}));

const root = 'artifacts/reflect-8fdc8/users/owner-A';
const sessionPath = `${root}/sessions/session-A`;
const statusPath = `${root}/memoryControl/erasure`;
const eventPrefix = `${root}/memoryEvents/`;
const topicPrefix = `${root}/memoryTopics/`;
const userTurn = { role: 'user', id: 'user-A', content: 'Исходный текст пользователя' };
const assistant = { role: 'assistant', id: 'assistant-A', interaction: {
  version: 'reflect.interaction.v1', insights: ['Гипотеза'], unknowns: [],
  recommendationCandidates: [{
    title: 'Выполнить задачу', rationale: 'Конкретный следующий шаг',
    sourceRefs: ['current-message']
  }]
} };
const review = {userId:'owner-A',sessionId:'session-A',assistantMessageId:'assistant-A',
  hypothesisIndex:0, grade:3, comment:'Подтверждаю'};
const decision = {userId:'owner-A',sessionId:'session-A',assistantMessageId:'assistant-A',
  candidateIndex:0,action:'saved'};
const returnVisit = {userId:'owner-A',sessionId:'session-A',visitId:'visit-1',
  note:'Повторное наблюдение'};
const validStatus = { schemaVersion:1, ownerId:'owner-A', state:'erasure-fenced',
  createdAtMs:1790000000 };
const clone = value => structuredClone(value);
let docs, reads, writes, committed, collideAtCommit;
function countMemoryWrites() { return writes.filter(path => path.startsWith(eventPrefix) ||
  path.startsWith(topicPrefix)); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS','true');
  vi.stubEnv('VITE_ENABLE_REFLECT_MEMORY_LEDGER','true');
  docs = new Map([[sessionPath,{chatHistory:[clone(userTurn),clone(assistant)]}]]);
  reads=[]; writes=[]; committed=0; collideAtCommit=false;
  runTransaction.mockImplementation(async (_db, operation) => {
    for (let attempt=0;attempt<3;attempt++) {
      const staged=[];
      const readRevisions=new Map();
      const tx={
        get:vi.fn(async ref=>{
          reads.push(ref.path);
          readRevisions.set(ref.path, JSON.stringify(docs.get(ref.path)));
          const data=docs.get(ref.path);
          return {exists:()=>data!==undefined,data:()=>clone(data)};
        }),
        set:vi.fn((ref,data)=>staged.push({op:'set',path:ref.path,data:clone(data)})),
        update:vi.fn((ref,data)=>staged.push({op:'update',path:ref.path,data:clone(data)}))
      };
      const result=await operation(tx);
      // Model Firestore's optimistic transaction retry when trusted Admin
      // creates the public marker concurrently with a source+memory action.
      if (collideAtCommit && attempt===0) {
        docs.set(statusPath,clone(validStatus));
        collideAtCommit=false;
      }
      const conflict=[...readRevisions].some(([path,value]) =>
        JSON.stringify(docs.get(path))!==value);
      if (conflict) continue;
      for (const change of staged) {
        const previous=docs.get(change.path);
        if (change.op==='update' && !previous) throw Error('missing-source');
        docs.set(change.path, change.op==='set' ? change.data : {...previous,...change.data});
        writes.push(change.path);
      }
      committed++;
      return result;
    }
    throw Error('too-many-transaction-retries');
  });
});
afterEach(()=>vi.unstubAllEnvs());

describe('R10.3-C2B3-B demo erasure isolation: preserve primary source actions',()=>{
  it('fenced hypothesis review is saved without creating a memory event',async()=>{
    docs.set(statusPath,clone(validStatus));
    const result=await saveHypothesisReview(review);
    expect(result).toMatchObject({grade:3,memorySuppressed:true});
    expect(result).not.toHaveProperty('memoryEventId');
    expect(docs.get(sessionPath).hypothesisReviews['h-assistant-A-0']).toMatchObject(result);
    expect(countMemoryWrites()).toHaveLength(0);
    expect(reads).toContain(statusPath);
    expect(committed).toBe(1);
  });
  it('fenced recommendation decision remains saved and does not append memory',async()=>{
    docs.set(statusPath,clone(validStatus));
    const result=await applyRecommendationDecision(decision);
    expect(result).toMatchObject({status:'saved',memorySuppressed:true});
    expect(result).not.toHaveProperty('memoryEventId');
    expect(docs.get(sessionPath).recommendationDecisions['r-assistant-A-0'])
      .toMatchObject(result);
    expect(countMemoryWrites()).toHaveLength(0);
  });
  it('fenced goal creation keeps decision and goal in the same transaction',async()=>{
    docs.set(statusPath,clone(validStatus));
    docs.get(sessionPath).hypothesisReviews={
      'h-assistant-A-0':{assistantMessageId:'assistant-A',hypothesisIndex:0,grade:3}
    };
    const result=await applyRecommendationDecision({
      ...decision, action:'goal',goalId:'goal-A', goalTitle:'Цель',
      goalStep:'Первый шаг', goalCriteria:'Результат проверен'
    });
    expect(result).toMatchObject({status:'accepted',goalId:'goal-A',memorySuppressed:true});
    expect(docs.get(`${root}/goals/goal-A`)).toMatchObject({
      sessionId:'session-A',sourceType:'user-accepted-ai-recommendation'
    });
    expect(docs.get(sessionPath).recommendationDecisions['r-assistant-A-0'])
      .toMatchObject({status:'accepted',goalId:'goal-A'});
    expect(countMemoryWrites()).toHaveLength(0);
  });
  it('fenced return check-in is saved once, retaining source note',async()=>{
    docs.set(statusPath,clone(validStatus));
    const result=await saveSessionReturn(returnVisit);
    expect(result).toMatchObject({id:'visit-1',memorySuppressed:true});
    expect(result).not.toHaveProperty('memoryEventId');
    expect(docs.get(sessionPath).returnCheckIns).toHaveLength(1);
    await saveSessionReturn(returnVisit);
    expect(docs.get(sessionPath).returnCheckIns).toHaveLength(1);
    expect(countMemoryWrites()).toHaveLength(0);
  });
  it('without fence R10.1 still appends memory atomically',async()=>{
    const result=await saveHypothesisReview(review);
    expect(result.memoryEventId).toMatch(/^ev-/);
    expect(result).not.toHaveProperty('memorySuppressed');
    expect(countMemoryWrites()).toHaveLength(2);
  });
  it('unknown or inconsistent status rejects the action rather than silently dropping memory',async()=>{
    docs.set(statusPath,{...validStatus,ownerId:'someone-else'});
    await expect(saveHypothesisReview(review)).rejects.toThrow('memory-erasure-state-invalid');
    expect(writes).toHaveLength(0);
    expect(docs.get(sessionPath).hypothesisReviews).toBeUndefined();
  });
  it('concurrent Admin fence creation forces transaction retry, then source-only save',async()=>{
    collideAtCommit=true;
    const result=await saveSessionReturn(returnVisit);
    expect(result).toMatchObject({memorySuppressed:true});
    expect(result).not.toHaveProperty('memoryEventId');
    expect(reads.filter(path=>path===statusPath)).toHaveLength(2);
    expect(countMemoryWrites()).toHaveLength(0);
    expect(docs.get(sessionPath).returnCheckIns).toHaveLength(1);
    expect(committed).toBe(1);
  });
  it('non-memory mode does not even request public erasure status',async()=>{
    vi.stubEnv('VITE_ENABLE_REFLECT_MEMORY_LEDGER','false');
    await saveSessionReturn(returnVisit);
    expect(reads).not.toContain(statusPath);
    expect(docs.get(sessionPath).returnCheckIns).toHaveLength(1);
  });
});
