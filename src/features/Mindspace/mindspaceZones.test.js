import { expect, test } from 'vitest';
import { MINDSPACE_ZONES, suggestMindZone, resolveMindZone,
  mindZoneLabel } from './mindspaceZones';
import { buildMindspace, layoutMindspace } from './mindspaceModel';

test('UX R4 fixed named zones at meaningful perimeter positions',()=>{
  expect(MINDSPACE_ZONES.map(z=>z.label)).toEqual([
    'Рефлексия','Профессиональный рост','Анализ и решения',
    'Общение и отношения','Личное развитие','Другие темы'
  ]);
  expect(MINDSPACE_ZONES.every(z=>z.x>0&&z.x<1&&z.y>0&&z.y<1))
    .toBe(true);
});

test('UX R4 tentative title-only grouping is deterministic but NOT a confirmed meaning',()=>{
  expect(suggestMindZone('Работа и проекты MVP')).toBe('professional');
  expect(suggestMindZone('Вечерняя рефлексия и мысли')).toBe('reflection');
  expect(suggestMindZone('Общение с командой')).toBe('dialogue');
  expect(suggestMindZone('ZXQ123 несвязанный текст')).toBe('other');
  expect(resolveMindZone({mindZone:{id:'analysis',author:'ai',
    status:'confirmed'}},'Работа над MVP')).toEqual({
      id:'professional',confirmedByOwner:false
    });
  expect(mindZoneLabel('analysis')).toBe('Анализ и решения');
});

test('UX R4 verified owner spatial correction wins title inference without changing data',()=>{
  const session={id:'topic-one',title:'Мой бизнес-проект',
    mindZone:{id:'reflection',author:'user',status:'confirmed'}};
  expect(resolveMindZone(session,session.title)).toEqual({
    id:'reflection',confirmedByOwner:true
  });
  const raw=[session,{id:'topic-two',title:'Отдых и ресурс'}];
  const g=buildMindspace(raw,[]);
  const a=g.nodes.find(x=>x.id==='session:topic-one');
  expect(a.zone).toBe('reflection');
  expect(a.zoneConfirmedByOwner).toBe(true);
  const drawn=layoutMindspace(g);
  const first=drawn.nodes.find(x=>x.id===a.id);
  const second=drawn.nodes.find(x=>x.id==='session:topic-two');
  expect(first.x).toBeLessThan(600);
  expect(second.y).toBeGreaterThan(530);
  expect(g.confirmedLinks).toBe(0);
  expect(raw[0].mindZone.id).toBe('reflection');
  expect(layoutMindspace(g)).toEqual(drawn);
});
