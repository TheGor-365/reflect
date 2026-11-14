import { describe, expect, it } from 'vitest';
import { buildMindspace, layoutMindspace } from './mindspaceModel';
import { MINDSPACE_ZONES, zoneFromTitle, zoneForNode,
  zoneCounts,filterMindspaceZone } from './mindspaceZones';

describe('RC05 provisional directions, never fabricated semantics',()=>{
  const sessions=[
    {id:'career',title:'Откладываю запуск веб-приложения'},
    {id:'rel',title:'Отношения с друзьями'},
    {id:'unknown',title:'Непонятная мысль xyz'},
  ];
  const goals=[{id:'g1',text:'Первый релиз',sessionId:'career'}];
  it('has eight stable meaningful compass directions plus an unclassified center',()=>{
    expect(MINDSPACE_ZONES).toHaveLength(8);
    expect(new Set(MINDSPACE_ZONES.map(z=>z.id)).size).toBe(8);
    expect(zoneFromTitle('Откладываю запуск веб-приложения')).toBe('professional');
    expect(zoneFromTitle('Отношения с друзьями')).toBe('relationships');
    expect(zoneFromTitle('Стресс и эмоции')).toBe('emotions');
    expect(zoneFromTitle('Непонятная мысль xyz')).toBe('unassigned');
    expect(zoneFromTitle(null)).toBe('unassigned');
  });
  it('locates goals under their authored parent, with no invented links or outcomes',()=>{
    const graph=buildMindspace(sessions,goals,{includeProposals:false});
    const before=structuredClone(graph);
    const parent=graph.nodes.find(n=>n.id==='session:career');
    const goal=graph.nodes.find(n=>n.id==='goal:g1');
    expect(zoneForNode(parent,graph)).toBe('professional');
    expect(zoneForNode(goal,graph)).toBe('professional');
    expect(zoneCounts(graph)).toMatchObject({
      professional:2,relationships:1,unassigned:1
    });
    const careerOnly=filterMindspaceZone(graph,'professional');
    expect(careerOnly.nodes.map(n=>n.id).sort())
      .toEqual(['goal:g1','session:career']);
    expect(careerOnly.edges.every(e=>careerOnly.nodes.some(n=>n.id===e.from)))
      .toBe(true);
    expect(careerOnly.confirmedLinks).toBe(0);
    expect(graph).toEqual(before);
    expect(layoutMindspace(graph)).toEqual(layoutMindspace(graph));
    const a=layoutMindspace(graph).nodes.find(n=>n.id==='session:career');
    const b=layoutMindspace(graph).nodes.find(n=>n.id==='session:rel');
    expect(a.y).toBeLessThan(b.y);
  });
  it('treats proximity as layout only and keeps unknown topics visible',()=>{
    const graph=buildMindspace(sessions,[]);
    const filter=filterMindspaceZone(graph,'unassigned');
    expect(filter.nodes).toHaveLength(1);
    expect(filter.nodes[0].label).toContain('Непонятная мысль');
    expect(filter.edges).toHaveLength(0);
    expect(filterMindspaceZone(graph,'all')).toBe(graph);
  });
});
