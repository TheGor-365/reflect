import { describe, expect, it } from 'vitest';
import {
  TOPIC_MEMORY_PROJECTION_VERSION, emptyTopicMemoryProjection,
  projectTopicMemory, buildTopicMemoryDigest
} from './topicMemoryProjection';

const ownerId = 'owner-A';
const topicId = 'session-A';
const base = { ownerId, topicId, sessionId: 'session-A' };
const types = {
  'owner.hypothesis.review': 'owner-reviewed',
  'owner.correction': 'owner-corrected',
  'owner.recommendation.decision': 'owner-decided',
  'owner.topic.return': 'owner-observed'
};
function event(kind, sequence, payload, options = {}) {
  const sessionId = options.sessionId || base.sessionId;
  const id = options.eventId || `ev-${sequence}`;
  let recordId;
  if (kind === 'owner.hypothesis.review' || kind === 'owner.correction') {
    const composite = `h-${payload.assistantMessageId}-${payload.hypothesisIndex}`;
    recordId = composite.length <= 128 ? composite : payload.assistantMessageId;
  } else if (kind === 'owner.recommendation.decision') {
    const composite = `r-${payload.assistantMessageId}-${payload.candidateIndex}`;
    recordId = composite.length <= 128 ? composite : payload.assistantMessageId;
  } else recordId = options.recordId || `visit-${sequence}`;
  return {
    schemaVersion: 1,
    eventId: id, ownerId, topicId, sessionId, sequence, kind,
    origin: 'owner', verification: types[kind],
    text: `Наблюдение владельца ${sequence}`,
    source: { collection: 'sessions', documentId: sessionId, recordId },
    topicScope: 'session-provisional', payload,
    ...(options.supersedes ? { supersedes: options.supersedes } : {}),
    ...options.override
  };
}
const grade = (value, comment = '') => ({
  grade: value, comment, assistantMessageId: 'assistant-A', hypothesisIndex: 0
});
const decision = (status, title = 'Проверить данные') => ({
  status, title, assistantMessageId: 'assistant-A',
  sourceMessageId: 'user-A', candidateIndex: 0
});
const ret = note => ({ note });
const derive = (events, previous = null) => projectTopicMemory({
  ownerId, topicId, events, previous
});

// The contract deliberately requires committed ledger records; nothing here
// is inferred from free text or dispatched to an AI model.
describe('R10.2-A source-backed incremental topic memory (local, pure)', () => {
  it('starts with an empty, owner-scoped, versioned checkpoint', () => {
    const value = emptyTopicMemoryProjection({ ownerId, topicId });
    expect(value).toMatchObject({
      projectionVersion: TOPIC_MEMORY_PROJECTION_VERSION,
      lastProcessedSequence: 0, topicScope: null,
      counts: { processed: 0, explicitReturns: 0 },
      hypothesisReviews: {}, recommendations: {}, recentReturns: []
    });
  });
  it('projects review as a user rating, never a proven psychological fact', () => {
    const projection = derive([event('owner.hypothesis.review', 1,
      grade(0, 'Это объяснение не подходит'))]);
    expect(projection.hypothesisReviews['session-A:h-assistant-A-0']).toMatchObject({
      grade: 0, stance: 'owner-disputed', revision: 1,
      eventId: 'ev-1', source: { collection: 'sessions',
        documentId: 'session-A', recordId: 'h-assistant-A-0' }
    });
    expect(projection.counts).toMatchObject({ reviews: 1, processed: 1 });
    expect(projection).not.toHaveProperty('verifiedFacts');
  });
  it('incrementally applies a correction and retains exact reference chain', () => {
    const original = derive([event('owner.hypothesis.review', 1, grade(0))]);
    const revision = derive([event('owner.correction', 2,
      grade(4, 'Я изменил мнение после разговора'), { supersedes: 'ev-1' })],
    JSON.parse(JSON.stringify(original)));
    expect(original.hypothesisReviews['session-A:h-assistant-A-0'].grade).toBe(0);
    expect(revision.hypothesisReviews['session-A:h-assistant-A-0']).toMatchObject({
      grade: 4, stance: 'owner-supported', revision: 2,
      eventId: 'ev-2', supersedes: 'ev-1'
    });
    expect(revision.counts).toMatchObject({ reviews: 1, corrections: 1, processed: 2 });
  });
  it('refuses corrections without an exact committed previous review', () => {
    const correction = event('owner.correction', 1, grade(2),
      { supersedes: 'ev-missing' });
    expect(() => derive([correction])).toThrow('memory-projection-invalid-correction-chain');
    const original = derive([event('owner.hypothesis.review', 1, grade(0))]);
    expect(() => derive([event('owner.correction', 2, grade(1),
      { supersedes: 'ev-unrelated' })], original))
      .toThrow('memory-projection-invalid-correction-chain');
  });
  it('rejects correction chains that skip the latest rating', () => {
    const p = derive([
      event('owner.hypothesis.review', 1, grade(0)),
      event('owner.correction', 2, grade(2), { supersedes: 'ev-1' })
    ]);
    expect(() => derive([event('owner.correction', 3, grade(4),
      { supersedes: 'ev-1' })], p))
      .toThrow('memory-projection-invalid-correction-chain');
  });
  it('updates recommendation status but preserves ledger source and decision count', () => {
    const p = derive([
      event('owner.recommendation.decision', 1, decision('saved')),
      event('owner.recommendation.decision', 2, decision('dismissed'))
    ]);
    expect(p.recommendations['session-A:r-assistant-A-0']).toMatchObject({
      status: 'dismissed', eventId: 'ev-2', revision: 2,
      source: { recordId: 'r-assistant-A-0' }
    });
    expect(p.counts).toMatchObject({ decisions: 2, processed: 2 });
  });
  it('counts only recorded explicit returns and bounds recent detail, without losing totals', () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      event('owner.topic.return', i + 1, ret(`Возвращение номер ${i + 1}`)));
    const p = derive(entries);
    expect(p.counts.explicitReturns).toBe(10);
    expect(p.recentReturns).toHaveLength(6);
    expect(p.recentReturns[0].eventId).toBe('ev-5');
    expect(p.recentReturns[5].eventId).toBe('ev-10');
    expect(p).not.toHaveProperty('annualReturns'); // no date proof yet
  });
  it('accepts exact retry of final event, but never double counts', () => {
    const item = event('owner.topic.return', 1, ret('Дважды не учитывать'));
    const p = derive([item]);
    const again = derive([item], p);
    expect(again).toEqual(p);
    expect(again.counts.explicitReturns).toBe(1);
    expect(derive([item, event('owner.topic.return', 2, ret('Второе'))], p)
      .counts.explicitReturns).toBe(2);
  });
  it('rejects changed event under the same ID after ambiguous acknowledgement', () => {
    const p = derive([event('owner.topic.return', 1, ret('Первое'))]);
    expect(() => derive([event('owner.topic.return', 1, ret('Подмена'))], p))
      .toThrow('memory-projection-noncontiguous-sequence');
  });
  it('rejects missing, duplicate and out-of-order sequence numbers', () => {
    expect(() => derive([event('owner.topic.return', 2, ret('С пропуском'))]))
      .toThrow('memory-projection-noncontiguous-sequence');
    expect(() => derive([
      event('owner.topic.return', 1, ret('Первый')),
      event('owner.topic.return', 1, ret('Дубликат'), { eventId: 'ev-other' })
    ])).toThrow('memory-projection-noncontiguous-sequence');
  });
  it('fails closed on cross-owner, cross-topic and forged source record', () => {
    expect(() => derive([event('owner.topic.return', 1, ret('x'),
      { override: { ownerId: 'owner-B' } })])).toThrow();
    expect(() => derive([event('owner.topic.return', 1, ret('x'),
      { override: { topicId: 'topic-B' } })])).toThrow();
    expect(() => derive([event('owner.hypothesis.review', 1, grade(1),
      { override: { source: { collection: 'sessions',
        documentId: 'session-A', recordId: 'unrelated' } } })]))
      .toThrow('memory-projection-source-mismatch');
  });
  it('refuses mixing explicit topic identity with provisional session scope', () => {
    const p = derive([event('owner.topic.return', 1, ret('Эпизод 1'))]);
    expect(() => derive([event('owner.topic.return', 2, ret('Эпизод 2'),
      { override: { topicScope: 'explicit' } })], p))
      .toThrow('memory-projection-topic-scope-conflict');
  });
  it('keeps identical assistant turn IDs separate across two explicit-topic sessions', () => {
    const first = event('owner.hypothesis.review', 1, grade(0),
      { override: { topicId: 'topic-shared', topicScope: 'explicit' } });
    const second = event('owner.hypothesis.review', 2, grade(4),
      { sessionId: 'session-B', override: { topicId: 'topic-shared',
        topicScope: 'explicit', source: { collection: 'sessions',
          documentId: 'session-B', recordId: 'h-assistant-A-0' } } });
    const p = projectTopicMemory({ ownerId, topicId: 'topic-shared',
      events: [first, second] });
    expect(Object.keys(p.hypothesisReviews)).toHaveLength(2);
    expect(p.hypothesisReviews['session-A:h-assistant-A-0'].grade).toBe(0);
    expect(p.hypothesisReviews['session-B:h-assistant-A-0'].grade).toBe(4);
  });
  it('supports legacy long assistant IDs by validating source fallback', () => {
    const assistantMessageId = 'a'.repeat(127);
    const p = derive([event('owner.hypothesis.review', 1,
      { ...grade(0), assistantMessageId })]);
    expect(p.hypothesisReviews[`session-A:h-${assistantMessageId}-0`].source.recordId)
      .toBe(assistantMessageId);
  });
  it('keeps the previous checkpoint unchanged after an incremental update', () => {
    const p = derive([event('owner.topic.return', 1, ret('Первый'))]);
    const copy = structuredClone(p);
    derive([event('owner.topic.return', 2, ret('Второй'))], p);
    expect(p).toEqual(copy);
  });
  it('prioritizes rejected hypotheses and decisions; digest never grants AI egress', () => {
    const p = derive([
      event('owner.hypothesis.review', 1, grade(0, 'Нет, это не так')),
      event('owner.recommendation.decision', 2, decision('dismissed')),
      event('owner.topic.return', 3, ret('Возвращаюсь к теме'))
    ]);
    const digest = buildTopicMemoryDigest({ ownerId, topicId, projection: p,
      maxBytes: 800, maxItems: 2 });
    expect(digest.entries.map(x => x.kind)).toEqual([
      'owner.hypothesis.review', 'owner.recommendation.decision'
    ]);
    expect(digest.omitted).toBe(1);
    expect(digest.usedEntryBytes).toBeLessThanOrEqual(800);
    expect(digest).toMatchObject({ providerContextSent: false,
      authorizedForProvider: false, asOfSequence: 3 });
  });
  it('does not fabricate evidence from AI guesses or unsupported event kinds', () => {
    const e = event('owner.topic.return', 1, ret('Наблюдение'));
    e.kind = 'assistant.hypothesis';
    e.origin = 'model';
    e.verification = 'model-proposed';
    expect(() => derive([e])).toThrow('memory-projection-unsupported-kind');
  });
});
