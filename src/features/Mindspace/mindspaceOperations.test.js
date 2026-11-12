import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, runTransaction } from 'firebase/firestore';
import { removeMindLink, saveMindLink } from './mindspaceOperations';

vi.mock('../../firebase/config',()=>({db:{},appId:'reflect-8fdc8'}));
vi.mock('firebase/firestore',()=>({
  doc:vi.fn((_db,...parts)=>({path:parts.join('/')})),
  runTransaction:vi.fn(),
  serverTimestamp:vi.fn(()=>({server:true})),
  Timestamp:{now:vi.fn(()=>({seconds:1790000000}))}
}));
const params={
  userId:'synthetic-owner',sourceSessionId:'topic-one',
  targetKind:'session',targetId:'topic-two',relation:'related',
  note:'Обе темы касаются концентрации'
};
let source,target,writes;
beforeEach(()=>{
  vi.clearAllMocks();
  source={title:'Моя тема',chatHistory:[{role:'user',content:'Оригинал'}]};
  target={title:'Связанная тема'};
  writes=[];
  runTransaction.mockImplementation(async (_db,callback)=>callback({
    get:vi.fn(async ref=>{
      const selected=ref.path.includes('/topic-one')?source:target;
      return {exists:()=>selected!==null,data:()=>selected};
    }),
    update:vi.fn((ref,patch)=>{
      writes.push({path:ref.path,patch});
      if(ref.path.includes('/topic-one'))source={...source,...patch};
    })
  }));
});

describe('PRODUCT-05B explicit mind links',()=>{
  it('makes one owner-scoped transaction, preserving previous transcript',async()=>{
    const result=await saveMindLink(params);
    expect(result).toEqual(expect.objectContaining({
      id:'ml-session-topic-two',author:'user',status:'confirmed',
      relation:'related',note:'Обе темы касаются концентрации'
    }));
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(
      'artifacts/reflect-8fdc8/users/synthetic-owner/sessions/topic-one'
    );
    expect(source.chatHistory).toEqual([{role:'user',content:'Оригинал'}]);
    expect(source.mindLinks).toHaveLength(1);
    expect(doc).toHaveBeenCalledWith(expect.anything(),
      'artifacts/reflect-8fdc8/users/synthetic-owner','sessions','topic-two');
  });
  it('same explicit submission is idempotent after ambiguous response',async()=>{
    await saveMindLink(params);
    await saveMindLink(params);
    expect(writes).toHaveLength(1);
  });
  it('updates confirmed relation in place without duplicating links',async()=>{
    await saveMindLink(params);
    await saveMindLink({...params,relation:'supports',note:'Поддерживает'});
    expect(writes).toHaveLength(2);
    expect(source.mindLinks).toHaveLength(1);
    expect(source.mindLinks[0].relation).toBe('supports');
    expect(source.mindLinks[0].note).toBe('Поддерживает');
  });
  it('never writes if a referenced source or target is missing',async()=>{
    target=null;
    await expect(saveMindLink(params)).rejects.toThrow(/не найдена/);
    source=null;
    await expect(saveMindLink(params)).rejects.toThrow(/не найдена/);
    expect(writes).toHaveLength(0);
  });
  it('rejects path injection, self-links and invalid relations before writes',async()=>{
    await expect(saveMindLink({...params,userId:'../owner'})).rejects.toThrow(/Некорректные/);
    await expect(saveMindLink({...params,sourceSessionId:'owner/one'})).rejects.toThrow();
    await expect(saveMindLink({...params,targetKind:'other'})).rejects.toThrow();
    await expect(saveMindLink({...params,targetId:'topic-one'})).rejects.toThrow();
    await expect(saveMindLink({...params,relation:'clinical-diagnosis'})).rejects.toThrow();
    await expect(saveMindLink({...params,note:'x'.repeat(401)})).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
  it('explicit removal deletes only the edge, not source or target documents',async()=>{
    await saveMindLink(params);
    const removed=await removeMindLink({
      userId:'synthetic-owner',sourceSessionId:'topic-one',
      targetKind:'session',targetId:'topic-two'
    });
    expect(removed).toBe(true);
    expect(source.mindLinks).toEqual([]);
    expect(source.title).toBe('Моя тема');
    expect(target.title).toBe('Связанная тема');
    const duplicate=await removeMindLink({
      userId:'synthetic-owner',sourceSessionId:'topic-one',
      targetKind:'session',targetId:'topic-two'
    });
    expect(duplicate).toBe(false);
    expect(writes).toHaveLength(2);
  });
  it('caps link count and does not consume global xAI credit',async()=>{
    source.mindLinks=Array.from({length:64},(_,i)=>({id:'old'+i}));
    await expect(saveMindLink(params)).rejects.toThrow(/лимит/);
    expect(writes).toHaveLength(0);
  });
  it('supports user-owned goals without inventing a session membership',async()=>{
    await saveMindLink({...params,targetKind:'goal',targetId:'goal-a',
      relation:'value',note:'Уточнил сам'});
    expect(source.mindLinks[0]).toEqual(expect.objectContaining({
      id:'ml-goal-goal-a',targetKind:'goal',targetId:'goal-a',
      relation:'value'
    }));
  });
});
