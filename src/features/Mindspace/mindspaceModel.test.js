import { describe, expect, it } from 'vitest';
import { buildMindspace, layoutMindspace, filterMindspace, mindspaceEvidence, MINDSPACE_VERSION } from './mindspaceModel';

const sessions=[
  {id:'topic-a',title:'Хочу читать чаще',chatHistory:[
    {id:'user-1',role:'user',content:'Хочу читать вечером'},
    {id:'assistant-1',role:'assistant',content:'Можно начать с малого',
      interaction:{version:'reflect.interaction.v1',
        recommendationCandidates:[{title:'Читать 20 минут',rationale:'Проверить эксперимент'}]}}
  ],mindLinks:[{
    id:'ml-session-topic-b',targetKind:'session',targetId:'topic-b',
    relation:'supports',note:'Обе темы связаны со вниманием',
    author:'user',status:'confirmed',createdAt:{seconds:1790000000}
  }]},
  {id:'topic-b',title:'Хочу меньше отвлекаться'}
];
const goals=[{
  id:'goal-read',text:'Чтение каждый вечер',sessionId:'topic-a',status:'active'
},{
  id:'standalone-goal',text:'Прогуляться',status:'paused'
}];
describe('PRODUCT-05B semantic Mindspace projection',()=>{
  it('projects confirmed user semantic link distinct from structural goal membership',()=>{
    const g=buildMindspace(sessions,goals);
    expect(g.version).toBe(MINDSPACE_VERSION);
    expect(g.nodes.filter(n=>n.kind==='session')).toHaveLength(2);
    expect(g.nodes.filter(n=>n.kind==='goal')).toHaveLength(2);
    expect(g.nodes.filter(n=>n.kind==='proposal')).toHaveLength(1);
    expect(g.confirmedLinks).toBe(1);
    const edge=g.edges.find(e=>e.kind==='semantic');
    expect(edge).toEqual(expect.objectContaining({
      from:'session:topic-a',to:'session:topic-b',
      relation:'supports',note:'Обе темы связаны со вниманием',
      provenance:'user-confirmed-session-transaction'
    }));
    expect(g.edges.some(e=>e.kind==='membership'&&
      e.to==='goal:goal-read')).toBe(true);
    expect(g.edges.some(e=>e.kind==='membership'&&
      e.to==='goal:standalone-goal')).toBe(false);
  });
  it('never treats an AI suggestion as a confirmed semantic link',()=>{
    const g=buildMindspace(sessions.map(s=>({...s,mindLinks:[]})),goals);
    expect(g.confirmedLinks).toBe(0);
    expect(g.suggestedNodes).toBe(1);
    const suggestion=g.edges.find(e=>e.kind==='suggestion');
    expect(suggestion.author).toBe('ai');
    expect(suggestion.kind).not.toBe('semantic');
    expect(g.nodes.find(n=>n.kind==='proposal').status).toBe('proposed');
  });
  it('uses saved decision status for model ideas, not invented user assent',()=>{
    const source={...sessions[0],mindLinks:[],
      recommendationDecisions:{'r-assistant-1-0':{status:'dismissed'}}};
    const g=buildMindspace([source],goals);
    expect(g.nodes.find(n=>n.kind==='proposal').status).toBe('dismissed');
    expect(g.confirmedLinks).toBe(0);
  });
  it('omits forged, dangling and non-user semantic relations',()=>{
    const extra=[
      {id:'ml-session-topic-b',targetKind:'session',targetId:'topic-b',
        relation:'related',author:'ai',status:'confirmed'},
      {id:'ml-session-missing',targetKind:'session',targetId:'missing',
        relation:'related',author:'user',status:'confirmed'},
      {id:'ml-goal-standalone-goal',targetKind:'goal',targetId:'standalone-goal',
        relation:'unsupported',author:'user',status:'confirmed'}
    ];
    const g=buildMindspace([{...sessions[0],mindLinks:extra},sessions[1]],goals);
    expect(g.confirmedLinks).toBe(0);
    expect(g.issues).toContain('missing-source-or-target');
    expect(g.issues).toContain('unverified-link');
  });
  it('never connects to another owner space or an unresolved source',()=>{
    const g=buildMindspace([sessions[0]],[goals[0]]);
    expect(g.confirmedLinks).toBe(0);
    expect(g.edges.every(e=>{
      const ids=new Set(g.nodes.map(n=>n.id));
      return ids.has(e.from)&&ids.has(e.to);
    })).toBe(true);
  });
  it('arrangement is stable across reload, source order and live updated snapshots',()=>{
    const graph1=buildMindspace(sessions,goals);
    const graph2=buildMindspace([...sessions].reverse(),[...goals].reverse());
    expect(graph1).toEqual(graph2);
    expect(layoutMindspace(graph1)).toEqual(layoutMindspace(graph2));
    expect(layoutMindspace(graph1).nodes.every(n=>n.x>0&&n.y>0)).toBe(true);
  });
  it('keeps legacy empty data honest and limits visualization without deleting data',()=>{
    expect(buildMindspace([],[])).toEqual(expect.objectContaining({
      nodes:[],edges:[],confirmedLinks:0,suggestedNodes:0
    }));
    const copy=structuredClone(sessions);
    const g=buildMindspace(sessions,goals,{maxNodes:2});
    expect(g.nodes).toHaveLength(2);
    expect(g.truncated).toBe(true);
    expect(sessions).toEqual(copy);
    expect(g.edges.every(e=>g.nodes.some(n=>n.id===e.from)&&
      g.nodes.some(n=>n.id===e.to))).toBe(true);
  });
  it('AI ideas can be hidden without losing user-authored session and goal nodes',()=>{
    const g=buildMindspace(sessions,goals,{includeProposals:false});
    expect(g.nodes.some(n=>n.kind==='proposal')).toBe(false);
    expect(g.confirmedLinks).toBe(1);
  });
});

describe('P1 semantics-first filters and evidence',()=>{
  it('never counts a suggested AI node or membership as a confirmed mental link',()=>{
    const graph=buildMindspace(sessions,goals);
    const summary=mindspaceEvidence(graph);
    expect(summary).toEqual(expect.objectContaining({
      topics:2,goals:2,aiIdeas:1,confirmedLinks:1,linkedNodes:2,
      unlinkedTopics:0
    }));
    const only=filterMindspace(graph,{onlyUserLinks:true});
    expect(only.nodes.map(n=>n.id).sort()).toEqual([
      'session:topic-a','session:topic-b'
    ]);
    expect(only.edges).toHaveLength(1);
    expect(only.edges[0].kind).toBe('semantic');
    expect(only.confirmedLinks).toBe(1);
  });
  it('hiding goals does not delete source graph or create pseudo-links',()=>{
    const graph=buildMindspace(sessions,goals);
    const without=filterMindspace(graph,{showGoals:false});
    expect(without.nodes.some(n=>n.kind==='goal')).toBe(false);
    expect(without.edges.some(e=>e.kind==='membership')).toBe(false);
    expect(graph.nodes.some(n=>n.kind==='goal')).toBe(true);
    expect(without.confirmedLinks).toBe(1);
    const empty=filterMindspace(buildMindspace(sessions.map(x=>({
      ...x,mindLinks:[]
    })),goals),{onlyUserLinks:true});
    expect(empty.nodes).toHaveLength(0);
    expect(empty.edges).toHaveLength(0);
    expect(empty.confirmedLinks).toBe(0);
  });
  it('canonical session display title wins over old date fallback on map',()=>{
    const graph=buildMindspace([
      {id:'topic-old',title:'Сеанс · 13.11.2026, 17:18',
        chatHistory:[{role:'user',content:'Откладываю запуск приложения'}]},
      {id:'manual',title:'Сеанс · 13.11.2026, 17:18',
        manualTitle:'Моё название'}
    ]);
    expect(graph.nodes.find(x=>x.id==='session:topic-old').label)
      .not.toContain('Сеанс ·');
    expect(graph.nodes.find(x=>x.id==='session:manual').label)
      .toBe('Моё название');
  });
});
