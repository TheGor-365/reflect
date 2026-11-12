import { describe, expect, it } from 'vitest';
import { buildDashboardSnapshot } from './dashboardModel';

const time=iso=>({seconds:Math.floor(Date.parse(iso)/1000)});
const now=Date.parse('2026-11-13T10:00:00Z');
const sessions=[{
  id:'s1',title:'Вечернее чтение',
  chatHistory:[
    {id:'u1',role:'user',content:'Хочу читать'},
    {id:'a1',role:'assistant',content:'Вариант',
      interaction:{version:'reflect.interaction.v1',recommendationCandidates:[
        {title:'20 минут чтения',rationale:'Доступно'}
      ]}}
  ],
  recommendationDecisions:{
    'r-a1-0':{
      status:'accepted',title:'20 минут чтения',
      assistantMessageId:'a1',candidateIndex:0,
      goalId:'g1',decidedAt:time('2026-11-10T12:00:00Z')
    }
  },
  returnCheckIns:[
    {id:'v1',type:'return-check-in',author:'user',
      text:'Читал два раза',recordedAtClient:time('2026-11-12T12:00:00Z')},
    {id:'v2',type:'return-check-in',author:'ai',
      text:'Вы успешно завершили план',recordedAtClient:time('2026-11-12T12:10:00Z')}
  ]
}];
const goals=[
  {id:'g1',text:'Читать регулярно',sessionId:'s1',
    status:'active',sourceRecommendationKey:'r-a1-0',
    sourceAssistantMessageId:'a1',
    dueDay:'2026-11-20',
    subItems:[
      {id:'step1',text:'Читать 20 минут',completed:true},
      {id:'step2',text:'Записать результат',completed:false}
    ]},
  {id:'g2',text:'Написать заметку',status:'paused',
    dueDay:'2026-11-14',subItems:[]}
];
const diaryNotes=[{
  id:'note1',title:'Мои наблюдения',entries:[
    {text:'Сегодня мне легче начать',createdAt:time('2026-11-11T12:00:00Z')},
    {text:'Старая запись без даты'}
  ]
}];
describe('PRODUCT-05 factual dashboard model',()=>{
  it('counts only explicit dated decisions, returns and authored notes',()=>{
    const d=buildDashboardSnapshot({sessions,goals,diaryNotes,days:7,nowMs:now});
    expect(d.eventCounts).toEqual({
      acceptedDecisions:1,returns:1,diaryEntries:1,total:3
    });
    expect(d.activity.map(day=>day.total).reduce((sum,n)=>sum+n,0)).toBe(3);
    expect(d.recentReturns).toHaveLength(1);
    expect(d.recentReturns[0].text).toBe('Читал два раза');
    expect(d.recentReturns[0].timestampSource).toBe('client-device');
    expect(d.recentNotes).toHaveLength(2);
    expect(d.recentNotes.find(note=>note.at===null)).toBeTruthy();
  });
  it('does not assign missing step completion dates to weekly activity',()=>{
    const d=buildDashboardSnapshot({sessions,goals,diaryNotes,days:7,nowMs:now});
    expect(d.stepProgress).toEqual({done:1,total:2});
    expect(d.eventCounts.total).toBe(3);
    expect(d.activity.every(day=>!Object.hasOwn(day,'completedSteps'))).toBe(true);
    expect(d.activeGoals[0].nextStep).toBe('Записать результат');
    expect(d.activeGoals[0].stepsDone).toBe(1);
    expect(d.activeGoals[0].stepsTotal).toBe(2);
  });
  it('keeps user-paused goals and valid deadlines without creating progress',()=>{
    const d=buildDashboardSnapshot({sessions,goals,diaryNotes,nowMs:now});
    expect(d.activeGoals).toHaveLength(2);
    expect(d.activeGoals[0].status).toBe('active');
    expect(d.activeGoals[1].status).toBe('paused');
    expect(d.activeGoals[1].dueDay).toBe('2026-11-14');
  });
  it('shows empty dashboard as insufficient evidence rather than a score',()=>{
    const d=buildDashboardSnapshot({sessions:[],goals:[],diaryNotes:[],nowMs:now});
    expect(d.eventCounts.total).toBe(0);
    expect(d.stepProgress).toBeNull();
    expect(d.recentNotes).toEqual([]);
    expect(d.activeGoals).toEqual([]);
    expect(d.activity).toHaveLength(7);
  });
  it('excludes AI author, unaccepted decisions and out-of-range events',()=>{
    const past={
      ...sessions[0],recommendationDecisions:{
        'r-a1-0':{...sessions[0].recommendationDecisions['r-a1-0'],
          status:'dismissed'}
      },returnCheckIns:[...sessions[0].returnCheckIns,{
        id:'old',type:'return-check-in',author:'user',text:'Давнее',
        recordedAtClient:time('2026-09-01T10:00:00Z')
      }]
    };
    const d=buildDashboardSnapshot({
      sessions:[past],goals:[],diaryNotes:[],nowMs:now
    });
    expect(d.eventCounts).toEqual({
      acceptedDecisions:0,returns:1,diaryEntries:0,total:1
    });
    expect(d.recentReturns).toHaveLength(2);
    expect(d.recentReturns[0].text).toBe('Читал два раза');
  });
  it('period selector uses 7 or 30 full UTC days; no invented dates',()=>{
    const old=[{id:'n2',entries:[{
      text:'Запись прошлого месяца',createdAt:time('2026-10-22T12:00:00Z')
    }]}];
    const seven=buildDashboardSnapshot({diaryNotes:old,days:7,nowMs:now});
    const thirty=buildDashboardSnapshot({diaryNotes:old,days:30,nowMs:now});
    expect(seven.eventCounts.diaryEntries).toBe(0);
    expect(thirty.eventCounts.diaryEntries).toBe(1);
    expect(thirty.activity).toHaveLength(30);
  });
});
