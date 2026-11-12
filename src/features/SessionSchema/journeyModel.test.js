import { describe, expect, it } from 'vitest';
import {
  projectJourney, filterJourney, layoutJourney, journeyFacts,
  JOURNEY_VERSION
} from './journeyModel';

const utc = iso => ({ seconds: Math.floor(Date.parse(iso)/1000) });
const session = {
  id:'saved-one', title:'Вечернее чтение',
  createdAt:utc('2026-11-09T12:00:00Z'),
  chatHistory:[
    {id:'user-0001',role:'user',content:'Хочу читать 30 минут вечером',
      timestamp:utc('2026-11-09T18:00:00Z')},
    {id:'assistant-0001',role:'assistant',content:'Начните с небольшого промежутка',
      timestamp:utc('2026-11-09T18:01:00Z'),
      interaction:{
        version:'reflect.interaction.v1',
        recommendationCandidates:[{title:'20 минут чтения',rationale:'Проще начать'}]
      }
    }
  ],
  recommendationDecisions:{
    'r-assistant-0001-0':{
      status:'accepted',title:'20 минут чтения',
      assistantMessageId:'assistant-0001',sourceMessageId:'user-0001',
      candidateIndex:0,goalId:'goal-001',
      decidedAt:utc('2026-11-09T18:02:00Z')
    }
  },
  returnCheckIns:[
    {id:'visit-001',author:'user',type:'return-check-in',
      text:'Два раза прочитал по 20 минут; один пропустил',
      recordedAtClient:utc('2026-11-12T19:00:00Z')}
  ]
};
const goals=[{
  id:'goal-001',sessionId:'saved-one',
  sourceRecommendationKey:'r-assistant-0001-0',
  sourceAssistantMessageId:'assistant-0001',
  text:'Читать каждый вечер',status:'active',
  createdAt:utc('2026-11-09T18:02:10Z'),
  subItems:[
    {id:'step-1',text:'Первые 20 минут',completed:true},
    {id:'step-2',text:'Проверить регулярность',completed:false}
  ]
}];
const of=(g,type)=>g.nodes.filter(n=>n.type===type);

describe('PRODUCT-04 Journey provenance projection',()=>{
  it('builds only explicit source edges in T5 two-visit scenario',()=>{
    const g=projectJourney([session],goals);
    expect(g.version).toBe(JOURNEY_VERSION);
    expect(of(g,'turn')).toHaveLength(2);
    expect(of(g,'proposal')).toHaveLength(1);
    expect(of(g,'decision')).toHaveLength(1);
    expect(of(g,'goal')).toHaveLength(1);
    expect(of(g,'step')).toHaveLength(2);
    expect(of(g,'return')).toHaveLength(1);
    const relations=g.edges.map(e=>e.relation);
    expect(relations).toContain('response-to');
    expect(relations).toContain('suggests');
    expect(relations).toContain('user-decided');
    expect(relations).toContain('accepted-as-goal');
    expect(relations).toContain('has-step');
    expect(relations).toContain('contains-return');
    const step=of(g,'step')[0];
    expect(step.timestampMs).toBeNull();
    expect(step.status).toBe('completed');
    expect(step.sourceRef).toEqual(expect.objectContaining({
      kind:'goal',sessionId:'saved-one',goalId:'goal-001'
    }));
    expect(of(g,'return')[0].timestampSource).toBe('client-device');
    expect(journeyFacts(g).stepProgress).toEqual({done:1,total:2});
  });
  it('unaccepted and rejected AI proposals never turn into confirmed actions',()=>{
    const own={
      ...session,recommendationDecisions:{
        'r-assistant-0001-0':{
          ...session.recommendationDecisions['r-assistant-0001-0'],
          status:'dismissed'
        }
      }
    };
    const graph=projectJourney([own],[]);
    expect(of(graph,'proposal')[0].status).toBe('dismissed');
    expect(of(graph,'decision')[0].status).toBe('dismissed');
    expect(graph.edges.some(e=>e.relation==='accepted-as-goal')).toBe(false);
    expect(journeyFacts(graph).acceptedDecisions).toBe(0);
    const pending=projectJourney([{...session,recommendationDecisions:{}}],[]);
    expect(of(pending,'proposal')[0].status).toBe('proposed');
    expect(of(pending,'decision')).toHaveLength(0);
    expect(journeyFacts(pending).acceptedDecisions).toBe(0);
  });
  it('does not invent a link to an AI decision with altered provenance',()=>{
    const wrong=[{...goals[0],sourceAssistantMessageId:'wrong-message'}];
    const graph=projectJourney([session],wrong);
    expect(graph.edges.some(e=>e.relation==='accepted-as-goal')).toBe(false);
    expect(graph.edges.some(e=>e.relation==='contains-goal')).toBe(true);
  });
  it('omits stale decision without a real stored assistant turn',()=>{
    const bad={
      ...session,chatHistory:session.chatHistory.slice(0,1)
    };
    const graph=projectJourney([bad],goals);
    expect(of(graph,'decision')).toHaveLength(0);
    expect(graph.issues).toContain('unlinked-decision');
    expect(graph.edges.some(e=>e.relation==='accepted-as-goal')).toBe(false);
  });
  it('does not connect events across unrelated sessions',()=>{
    const other={
      id:'saved-two',title:'Другая тема',chatHistory:[
        {id:'u2',role:'user',content:'Новая тема'}
      ]
    };
    const graph=projectJourney([session,other],goals);
    expect(graph.edges.every(e=>{
      const byId=new Map(graph.nodes.map(n=>[n.id,n]));
      return byId.get(e.from).sessionId===byId.get(e.to).sessionId;
    })).toBe(true);
  });
  it('supports legacy turns without artificial immutable ids and deterministic layout',()=>{
    const legacy={id:'legacy',chatHistory:[
      {role:'user',content:'Старая запись без id'},
      {role:'assistant',content:'Старый ответ'}
    ]};
    const a=projectJourney([session,legacy],goals);
    const b=projectJourney([legacy,session],goals);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.edges).toEqual(b.edges);
    expect(layoutJourney(a)).toEqual(layoutJourney(b));
    const legacyNodes=a.nodes.filter(n=>n.sessionId==='legacy'&&n.type==='turn');
    expect(legacyNodes).toHaveLength(2);
    expect(legacyNodes.every(n=>n.sourceRef.kind==='session')).toBe(true);
  });
  it('does not attribute missing step dates to the selected week',()=>{
    const graph=projectJourney([session],goals);
    const filtered=filterJourney(graph,{
      sessionId:'saved-one',period:'7d',nowMs:Date.parse('2026-11-13T00:00:00Z')
    });
    expect(of(filtered,'step')).toHaveLength(0);
    expect(of(filtered,'return')).toHaveLength(1);
    expect(journeyFacts(filtered,'7d').stepProgress).toBeNull();
  });
  it('filters by specific status/type without turning historical proposals into facts',()=>{
    const graph=projectJourney([session],goals);
    const confirmed=filterJourney(graph,{status:'confirmed'});
    expect(confirmed.nodes.every(n=>n.type==='session'||
      ['authored','saved','accepted','completed'].includes(n.status))).toBe(true);
    const returns=filterJourney(graph,{kind:'returns'});
    expect(of(returns,'return')).toHaveLength(1);
    expect(returns.edges.every(e=>returns.nodes.some(n=>n.id===e.from)&&
      returns.nodes.some(n=>n.id===e.to))).toBe(true);
  });
  it('preserves empty states and applies display cap without modifying source',()=>{
    expect(projectJourney([],[]).nodes).toEqual([]);
    const copy=structuredClone(session);
    const graph=projectJourney([session],goals,{maxNodes:3});
    expect(graph.nodes).toHaveLength(3);
    expect(graph.truncated).toBe(true);
    expect(session).toEqual(copy);
    expect(graph.edges.every(edge=>
      graph.nodes.some(node=>node.id===edge.from)&&
      graph.nodes.some(node=>node.id===edge.to))).toBe(true);
  });
});
