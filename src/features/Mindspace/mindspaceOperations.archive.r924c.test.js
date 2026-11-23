import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { saveMindLink, removeMindLink, renameMindTopic, saveMindZone } from './mindspaceOperations';

vi.mock('../../firebase/config',()=>({db:{},appId:'reflect-8fdc8'}));
vi.mock('firebase/firestore',()=>({
  doc:vi.fn((_db,...parts)=>({path:parts.join('/')})),
  runTransaction:vi.fn(),
  serverTimestamp:vi.fn(()=>({server:true})),
  Timestamp:{now:vi.fn(()=>({seconds:1790000000}))}
}));
const data={userId:'owner',sourceSessionId:'live',targetKind:'goal',
  targetId:'goal1',relation:'related',note:'Значимая связь'};
const old={seconds:1795000000};
let source,target,writes;
beforeEach(()=>{
  vi.clearAllMocks();
  source={title:'Тема',mindLinks:[{
    id:'ml-goal-goal1',targetKind:'goal',targetId:'goal1',
    relation:'related',author:'user',status:'confirmed'
  }]};
  target={text:'Цель'};
  writes=[];
  runTransaction.mockImplementation(async (_db,callback)=>callback({
    get:vi.fn(async ref=>{
      const item=ref.path.endsWith('/live')?source:target;
      return {exists:()=>item!==null,data:()=>item};
    }),
    update:vi.fn((ref,patch)=>writes.push({path:ref.path,patch}))
  }));
});

describe('R9.2.4C-B transaction-time archived Mindspace guards',()=>{
  it('rejects archived source and target even on idempotent retries',async()=>{
    source.archivedAt=old;
    await expect(saveMindLink(data)).rejects.toThrow(/Архивная/);
    delete source.archivedAt;
    target.archivedAt=old;
    await expect(saveMindLink(data)).rejects.toThrow(/Архивная/);
    expect(writes).toHaveLength(0);
  });
  it('blocks removing a link to an archived goal without deleting provenance',async()=>{
    target.archivedAt=old;
    await expect(removeMindLink(data)).rejects.toThrow(/Архивная/);
    expect(source.mindLinks).toHaveLength(1);
    expect(writes).toHaveLength(0);
  });
  it('blocks archived-source rename and zone confirmation',async()=>{
    source.archivedAt=old;
    await expect(renameMindTopic({userId:'owner',sourceSessionId:'live',title:'Новое'}))
      .rejects.toThrow(/Архивная/);
    await expect(saveMindZone({userId:'owner',sourceSessionId:'live',zoneId:'other'}))
      .rejects.toThrow(/Архивная/);
    expect(writes).toHaveLength(0);
  });
  it('keeps legacy null archive state writable and never mutates the source on reads',async()=>{
    source.archivedAt=null;
    target.archivedAt=null;
    await expect(saveMindLink(data)).resolves.toEqual(expect.objectContaining({
      id:'ml-goal-goal1',author:'user'
    }));
    expect(writes).toHaveLength(1);
  });
});
