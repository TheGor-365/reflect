import { describe, expect, it } from 'vitest';
import { buildDiaryTimeline } from './diaryTimeline';
const at={seconds:1790000000};
const session=(id:string,archived=false)=>({id,title:id,
  ...(archived?{archivedAt:at}:{}),
  returnCheckIns:[{id:'return1',type:'return-check-in',author:'user',text:'Я проверил результат'}]
});

describe('R9.2.4C-C diary archive is historical, not deletion',()=>{
  it('keeps session and return events and marks both archived without writing',()=>{
    const archived=session('old',true);
    const original=structuredClone(archived);
    const events=buildDiaryTimeline({sessions:[archived]});
    expect(events).toHaveLength(2);
    expect(events.every(event=>event.archived)).toBe(true);
    expect(events.some(event=>event.eventKey==='session:old:return:return1')).toBe(true);
    expect(archived).toEqual(original);
  });
  it('distinguishes an active goal with archived source from independently archived goal',()=>{
    const events=buildDiaryTimeline({
      sessions:[session('archived-parent',true),session('live-parent')],
      goals:[
        {id:'still-live-goal',sessionId:'archived-parent',text:'Активная цель'},
        {id:'archived-goal',sessionId:'live-parent',archivedAt:at,text:'Архивная цель'},
        {id:'legacy',text:'Без флага архива'}
      ]
    });
    const byId=(id:string)=>events.find(event=>event.eventKey===`goal:${id}`)!;
    expect(byId('still-live-goal')).toMatchObject({archived:false,sourceSessionArchived:true});
    expect(byId('archived-goal')).toMatchObject({archived:true,sourceSessionArchived:false});
    expect(byId('legacy')).toMatchObject({archived:false,sourceSessionArchived:false});
  });
  it('restore changes only projected archive marker, never duplicates an event',()=>{
    const history=buildDiaryTimeline({sessions:[session('saved',true)]});
    const restored=buildDiaryTimeline({sessions:[session('saved',false)]});
    expect(restored.map(row=>row.eventKey)).toEqual(history.map(row=>row.eventKey));
    expect(restored.every(row=>!row.archived)).toBe(true);
  });
});
