import { describe, expect, it } from 'vitest';
import {
  buildJourneyGraph, filterJourneyGraph, layoutJourneyNodes, timestampMs
} from './journeyGraph';

const stamp = seconds => ({ seconds });
const fixture = () => ({
  session: {
    id: 'session-A', title: 'Выбор направления',
    createdAt: stamp(1790000000),
    chatHistory: [
      { id: 'user-001', role: 'user', content: 'Хочу закончить MVP',
        timestamp: stamp(1790000010) },
      { id: 'assistant-001', role: 'assistant', content: 'Выделим главный риск',
        timestamp: stamp(1790000020),
        interaction: { version: 'reflect.interaction.v1',
          recommendationCandidates: [{
            title: 'Первый проверяемый релиз',
            rationale: 'Пользователь хочет закончить MVP'
          }] } },
      { id: 'user-002', role: 'user',
        content: 'Я могу работать по вечерам', timestamp: stamp(1790000030) },
      { id: 'assistant-002', role: 'assistant',
        content: 'Не все варианты подходят', timestamp: stamp(1790000040),
        interaction: { version: 'reflect.interaction.v1',
          recommendationCandidates: [{
            title: 'Переписать весь проект',
            rationale: 'AI предложил другой вариант'
          }] } }
    ],
    recommendationDecisions: {
      'r-assistant-001-0': {
        assistantMessageId: 'assistant-001',
        candidateIndex: 0, title: 'Первый проверяемый релиз',
        status: 'accepted', goalId: 'goal-one',
        decidedAt: stamp(1790000050)
      },
      'r-assistant-002-0': {
        assistantMessageId: 'assistant-002',
        candidateIndex: 0, title: 'Переписать весь проект',
        status: 'dismissed', decidedAt: stamp(1790000060)
      }
    },
    returnCheckIns: [
      { id: 'return-1', type: 'return-check-in', author: 'user',
        text: 'Два вечера работал, третий пропустил',
        recordedAtClient: stamp(1790173000) }
    ]
  },
  goals: [
    { id: 'goal-one', sessionId: 'session-A',
      sourceRecommendationKey: 'r-assistant-001-0',
      text: 'Опубликовать MVP', createdAt: stamp(1790000070),
      status: 'active', completed: false,
      subItems: [
        { id: 'step-1', text: 'Опубликовать тестовую версию', completed: true },
        { id: 'step-2', text: 'Проверить форму', completed: false }
      ]
    },
    { id: 'foreign-goal', sessionId: 'session-B', text: 'Чужая цель',
      status: 'completed', completed: true }
  ]
});
describe('PRODUCT-04 provenance graph', () => {
  it('projects exact saved user → AI proposal → explicit decision → goal and later return', () => {
    const { session, goals } = fixture();
    const graph = buildJourneyGraph(session, goals);
    const key = id => graph.nodes.find(node => node.id === id);
    const proposal = key('proposal:session-A:1:0');
    const decision = key('decision:session-A:r-assistant-001-0');
    const goal = key('goal:session-A:goal-one');
    expect(proposal.author).toBe('ai');
    expect(proposal.status).toBe('proposed');
    expect(decision.author).toBe('user');
    expect(decision.status).toBe('accepted');
    expect(goal.sourceRef).toEqual({
      kind: 'goal', goalId: 'goal-one', sessionId: 'session-A'
    });
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: proposal.id, to: decision.id, relation: 'explicit-decision'
      }),
      expect.objectContaining({
        from: decision.id, to: goal.id, relation: 'confirmed-goal-from-decision'
      }),
      expect.objectContaining({
        to: 'return:session-A:0', relation: 'return-to-topic'
      })
    ]));
    expect(graph.metrics).toEqual({
      confirmedDecisions: 1, returns: 1, completedSteps: 1, totalSteps: 2
    });
    expect(graph.nodes.some(node => node.label.includes('Чужая цель'))).toBe(false);
    expect(graph.nodes.some(node => node.kind === 'completion')).toBe(false);
    expect(graph.nodes.find(node => node.id === 'decision:session-A:r-assistant-002-0')
      .status).toBe('dismissed');
  });

  it('never turns a dismissed or invalid decision into a verified goal link', () => {
    const { session, goals } = fixture();
    goals[0].sourceRecommendationKey = 'r-assistant-002-0';
    session.recommendationDecisions['r-assistant-001-0'].title = 'Forged label';
    const graph = buildJourneyGraph(session, goals);
    expect(graph.metrics.confirmedDecisions).toBe(0);
    expect(graph.edges.some(edge => edge.relation === 'confirmed-goal-from-decision')).toBe(false);
    expect(graph.edges.some(edge => edge.from === 'session:session-A' &&
      edge.to === 'goal:session-A:goal-one' && edge.relation === 'linked-to-session')).toBe(true);
  });

  it('does not invent an earlier timestamp or completed action for legacy records', () => {
    const graph = buildJourneyGraph({ id: 'legacy', chatHistory: [{
      role: 'user', content: 'Запись без даты'
    }] }, [{ id: 'goal', sessionId: 'legacy', text: 'Цель',
      completed: true, status: 'completed',
      subItems: [{ text: 'Раньше выполнено', completed: true }] }]);
    const turn = graph.nodes.find(node => node.kind === 'user-turn');
    expect(turn.timeMs).toBeNull();
    expect(graph.nodes.some(node => node.kind === 'completion')).toBe(false);
    expect(graph.metrics).toEqual({
      confirmedDecisions: 0, returns: 0, completedSteps: 1, totalSteps: 1
    });
    expect(timestampMs({ toDate: () => { throw new Error('corrupt'); } })).toBeNull();
  });

  it('filters by goal, owner-originated actions, date and hides undated evidence', () => {
    const { session, goals } = fixture();
    const graph = buildJourneyGraph(session, goals);
    const byGoal = filterJourneyGraph(graph, { goalId: 'goal-one' });
    expect(byGoal.nodes.some(node => node.kind === 'return')).toBe(false);
    expect(byGoal.nodes.some(node => node.id === 'goal:session-A:goal-one')).toBe(true);
    expect(byGoal.nodes.some(node => node.id === 'turn:session-A:1')).toBe(true);
    const ai = filterJourneyGraph(graph, { kind: 'ai' });
    expect(ai.nodes.filter(node => node.kind === 'goal')).toHaveLength(0);
    const later = filterJourneyGraph(graph, {
      kind: 'returns', period: '7d', nowMs: 1790173000 * 1000
    });
    expect(later.nodes.some(node => node.kind === 'return')).toBe(true);
    const older = filterJourneyGraph(graph, {
      kind: 'returns', period: '7d', nowMs: 1790173000 * 1000 + 10 * 86400000
    });
    expect(older.nodes.some(node => node.kind === 'return')).toBe(false);
  });

  it('has stable layout on repeated renders and no synthetic nodes for empty account', () => {
    expect(buildJourneyGraph(null, []).nodes).toHaveLength(0);
    const { session, goals } = fixture();
    const graph = buildJourneyGraph(session, goals);
    const one = layoutJourneyNodes(graph.nodes);
    const two = layoutJourneyNodes(buildJourneyGraph(session, goals).nodes);
    expect(two).toEqual(one);
    expect(one.nodes.every(node => Number.isFinite(node.x) &&
      Number.isFinite(node.y))).toBe(true);
  });
});
