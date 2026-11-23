import { describe, expect, it } from 'vitest';
import { isArchivedRecommendation } from './archiveSelectors';
import { buildRecommendationInbox } from '../Recommendations/recommendationInbox';
import { buildDashboardSnapshot } from '../Dashboard/dashboardModel';

const time = iso => ({ seconds: Math.floor(Date.parse(iso) / 1000) });
const interaction = {
  version:'reflect.interaction.v1', stage:'synthesize',
  recommendationCandidates:[{ title:'Проверить шаг',
    rationale:'Источник сохранён', sourceRefs:['current-message'] }]
};
const session = (id, archivedAt, decision = null) => ({
  id, title:id, ...(archivedAt ? { archivedAt } : {}),
  chatHistory:[
    { id:'user-one', role:'user', content:'Начать' },
    { id:'assistant-one', role:'assistant', content:'Сохранённый ответ', interaction }
  ],
  recommendationDecisions:decision ? { 'r-assistant-one-0':decision } : {},
  returnCheckIns:[{id:'return-one',type:'return-check-in',author:'user',
    text:'Проверил шаг',recordedAtClient:time('2026-11-18T12:00:00Z')}]
});
const accepted = {
  status:'accepted',title:'Проверить шаг',assistantMessageId:'assistant-one',
  candidateIndex:0,decidedAt:time('2026-11-18T11:00:00Z')
};
const nowMs=Date.parse('2026-11-19T12:00:00Z');

describe('R9.2.4C archive-aware active cross-view projections', () => {
  it('keeps archived sources in the inbox for history but never in actionable counts', () => {
    const rows=buildRecommendationInbox([
      session('archived-parent',time('2026-11-18T13:00:00Z')),
      session('active-parent',null),
      session('archived-recommendation',null, {archivedAt:time('2026-11-18T14:00:00Z')})
    ]);
    expect(rows.recommendations).toHaveLength(3);
    expect(rows.recommendations.filter(isArchivedRecommendation)).toHaveLength(2);
    expect(rows.pendingCount).toBe(1);
    expect(rows.recommendations.find(r=>r.sessionId==='archived-parent')
      .sourceSessionArchived).toBe(true);
  });
  it('excludes archived session and archived goal from active Dashboard but keeps diary notes', () => {
    const archivedAt=time('2026-11-18T13:00:00Z');
    const summary=buildDashboardSnapshot({
      sessions:[session('old-session',archivedAt,accepted),session('live-session',null,accepted)],
      goals:[
        {id:'archived-goal',text:'Старая цель',archivedAt,status:'active',
          subItems:[{text:'Шаг',completed:true}]},
        {id:'live-goal',text:'Актуальная цель',status:'active',
          subItems:[{text:'Шаг',completed:false}]}
      ],
      diaryNotes:[{id:'entry',entries:[{text:'Моя история',createdAt:time('2026-11-18T10:00:00Z')}]}],
      nowMs
    });
    expect(summary.activeGoals.map(g=>g.id)).toEqual(['live-goal']);
    expect(summary.stepProgress).toEqual({done:0,total:1});
    expect(summary.eventCounts).toEqual({acceptedDecisions:1,returns:1,diaryEntries:1,total:3});
    expect(summary.recentNotes[0].text).toBe('Моя история');
    expect(summary.recentReturns[0].sessionId).toBe('live-session');
  });
  it('ignores archived recommendation decisions on an otherwise live session', () => {
    const result=buildDashboardSnapshot({
      sessions:[session('live',null,{...accepted,archivedAt:time('2026-11-18T13:00:00Z')})],
      nowMs
    });
    expect(result.eventCounts.acceptedDecisions).toBe(0);
    expect(result.eventCounts.returns).toBe(1);
  });
  it('legacy records without archive metadata remain active and read-only projection is pure', () => {
    const older=session('legacy',null,accepted);
    const before=structuredClone(older);
    const snapshot=buildDashboardSnapshot({sessions:[older],nowMs});
    expect(snapshot.eventCounts.acceptedDecisions).toBe(1);
    expect(older).toEqual(before);
  });
});
