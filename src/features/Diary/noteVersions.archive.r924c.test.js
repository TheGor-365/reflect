import { beforeEach,expect,test,vi } from 'vitest';
import { runTransaction } from 'firebase/firestore';
import { saveNoteRevision } from './noteVersions';
vi.mock('../../firebase/config',()=>({db:{},appId:'reflect-8fdc8'}));
vi.mock('firebase/firestore',()=>({
  doc:vi.fn((_db,path,id)=>({path:`${path}/${id}`})),
  runTransaction:vi.fn(),serverTimestamp:vi.fn(()=>({stamp:'server'})),
  Timestamp:{now:vi.fn(()=>({toDate:()=>new Date('2026-11-19')}))}
}));
let source,writes;
const input={userId:'owner1',noteId:'note1',entryIndex:0,title:'Обновлённая заметка',
  text:'Сохранить мой текст',expectedVersion:1,editId:'stable-edit-1'};
beforeEach(()=>{
  vi.clearAllMocks();writes=[];
  source={archivedAt:{seconds:1790000000},title:'Старая заметка',
    entries:[{text:'Оригинал',version:1}]};
  runTransaction.mockImplementation(async(_db,callback)=>callback({
    get:vi.fn(async()=>({exists:()=>true,data:()=>source})),
    update:vi.fn((ref,patch)=>writes.push({ref,patch}))
  }));
});
test('stale diary editor cannot mutate an archived note',async()=>{
  await expect(saveNoteRevision(input)).rejects.toThrow(/архиве/);
  expect(writes).toHaveLength(0);
});
test('legacy note is editable without synthetic archive migration',async()=>{
  delete source.archivedAt;
  const result=await saveNoteRevision(input);
  expect(result.entries[0].text).toBe(input.text);
  expect(writes).toHaveLength(1);
  expect(writes[0].ref.path).toContain('users/owner1/diaryNotes/note1');
});
