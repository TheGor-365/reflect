import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, runTransaction } from 'firebase/firestore';
import { saveHypothesisReview } from './hypothesisReviews';
import { hypothesisReviewKey, validateHypothesisReview,
  HYPOTHESIS_GRADES } from './hypothesisReviewModel';

vi.mock('../../firebase/config',()=>({db:{},appId:'reflect-8fdc8'}));
vi.mock('firebase/firestore',()=>({
  doc:vi.fn((_db,root,collection,id)=>({path:`${root}/${collection}/${id}`})),
  runTransaction:vi.fn(),
  serverTimestamp:vi.fn(()=>({serverTime:true}))
}));
const user={role:'user',id:'user-123456',content:'Боюсь, что меня неправильно поймут'};
const assistant={role:'assistant',id:'assistant-654321',interaction:{
  version:'reflect.interaction.v1',insights:[
    'Возможно, вы ждёте идеального результата.',
    'Возможно, здесь важнее потребность в отдыхе.'
  ]
}};
const opts={userId:'owner-A',sessionId:'session-1',
  assistantMessageId:'assistant-654321',hypothesisIndex:0,grade:0,
  comment:'Нет, причина в другом'};
let session,writes;
beforeEach(()=>{
  vi.clearAllMocks();
  session={chatHistory:[user,assistant]};
  writes=[];
  runTransaction.mockImplementation(async (_db,fn)=>{
    const tx={
      get:vi.fn(async()=>({exists:()=>session!==null,data:()=>session})),
      update:vi.fn((ref,patch)=>{
        session={...session,...patch};
        writes.push({path:ref.path,patch});
      })
    };
    return fn(tx);
  });
});
describe('owner-scoped user feedback on unverified AI hypothesis',()=>{
  it('writes once on explicit action to correct owner session and source',async()=>{
    const result=await saveHypothesisReview(opts);
    expect(result).toEqual(expect.objectContaining({
      grade:0,comment:'Нет, причина в другом',
      assistantMessageId:'assistant-654321',hypothesisIndex:0
    }));
    expect(writes).toHaveLength(1);
    expect(writes[0].path)
      .toBe('artifacts/reflect-8fdc8/users/owner-A/sessions/session-1');
    expect(session.hypothesisReviews['h-assistant-654321-0'].grade).toBe(0);
    expect(doc).toHaveBeenCalledTimes(1);
    await saveHypothesisReview(opts);
    expect(writes).toHaveLength(1);
  });
  it('separately persists edited second hypothesis without replacing first',async()=>{
    await saveHypothesisReview(opts);
    await saveHypothesisReview({...opts,hypothesisIndex:1,grade:4,
      comment:'Да, это очень похоже'});
    expect(writes).toHaveLength(2);
    expect(Object.keys(session.hypothesisReviews)).toEqual([
      'h-assistant-654321-0','h-assistant-654321-1'
    ]);
    expect(session.hypothesisReviews['h-assistant-654321-1'].grade).toBe(4);
    expect(HYPOTHESIS_GRADES[4]).toBe('Очень точно');
  });
  it('never writes when feedback refers to wrong owner, unsaved or nonexistent turn',async()=>{
    for(const param of [
      {...opts,userId:'../another'},
      {...opts,sessionId:'session/other'},
      {...opts,assistantMessageId:'assistant-not-present'},
      {...opts,hypothesisIndex:2},
      {...opts,grade:8},
      {...opts,comment:'x'.repeat(501)}
    ])await expect(saveHypothesisReview(param)).rejects.toThrow();
    session=null;
    await expect(saveHypothesisReview(opts)).rejects.toThrow(/не сохранён/);
    expect(writes).toHaveLength(0);
  });
  it('accepts negative feedback, avoids interpretation as an AI accuracy probability',()=>{
    expect(validateHypothesisReview({grade:0,comment:''}))
      .toEqual({grade:0,comment:''});
    expect(hypothesisReviewKey('assistant-654321',1))
      .toBe('h-assistant-654321-1');
    expect(HYPOTHESIS_GRADES).toHaveLength(5);
  });
});
