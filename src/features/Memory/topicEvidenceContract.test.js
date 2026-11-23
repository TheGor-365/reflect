import { describe, expect, it } from 'vitest';
import {
  buildTopicEvidenceTimeline, countRecordedTopicReturns,
  planTopicEvidenceContext, validateTopicEvidenceEvent
} from './topicEvidenceContract';

const scope = { ownerId: 'owner-A', topicId: 'topic-A' };
const source = { collection: 'sessions', documentId: 'session-A', recordId: 'turn-1' };
const event = (overrides = {}) => ({
  schemaVersion: 1, eventId: 'event-1', ownerId: 'owner-A',
  topicId: 'topic-A', sessionId: 'session-A', sequence: 1,
  kind: 'user.turn', origin: 'owner', verification: 'owner-stated',
  source, text: 'Коллега меня перебил', ...overrides
});
const correction = event({
  eventId: 'event-2', sequence: 2, kind: 'owner.correction',
  verification: 'owner-corrected', supersedes: 'event-1',
  text: 'Нет оснований считать, что он хотел меня обидеть'
});
const suggestion = event({
  eventId: 'event-3', sequence: 3, kind: 'assistant.hypothesis',
  origin: 'model', verification: 'model-proposed',
  text: 'Возможно, он намеренно обижает коллегу'
});
const rejection = event({
  eventId: 'event-4', sequence: 4,
  kind: 'owner.hypothesis.review', verification: 'owner-reviewed',
  text: 'Совсем мимо: он так шутит и над другими',
  source: { ...source, recordId: 'h-assistant-1-0' }
});
const permission = { granted: true, ownerId: 'owner-A',
  topicId: 'topic-A', expiresAtMs: 2000 };

describe('R10.0 read-only topic evidence contract', () => {
  it('keeps AI hypotheses model-proposed, not established facts', () => {
    expect(validateTopicEvidenceEvent(suggestion, scope).verification)
      .toBe('model-proposed');
    expect(() => validateTopicEvidenceEvent(event({
      kind: 'assistant.hypothesis', origin: 'owner'
    }), scope)).toThrow('invalid-memory-event');
    expect(() => validateTopicEvidenceEvent(event({
      kind: 'assistant.hypothesis', origin: 'model',
      verification: 'owner-stated'
    }), scope)).toThrow('invalid-memory-event');
  });
  it('rejects cross-owner, cross-topic, and invalid source IDs', () => {
    expect(() => validateTopicEvidenceEvent(event({ ownerId: 'owner-B' }), scope))
      .toThrow('invalid-memory-event');
    expect(() => validateTopicEvidenceEvent(event({ topicId: 'topic-B' }), scope))
      .toThrow('invalid-memory-event');
    expect(() => validateTopicEvidenceEvent(event({
      source: { ...source, documentId: '../escape' }
    }), scope)).toThrow('invalid-memory-event');
    expect(() => validateTopicEvidenceEvent(event({
      source: { ...source, collection: 'profiles' }
    }), scope)).toThrow('invalid-memory-event');
  });
  it('deduplicates exact replays and refuses changed records under same ID', () => {
    expect(buildTopicEvidenceTimeline({ ...scope,
      events: [event(), event()] })).toHaveLength(1);
    expect(() => buildTopicEvidenceTimeline({ ...scope, events: [
      event(), event({ text: 'Другой текст' })
    ] })).toThrow('memory-replay-conflict');
    expect(() => buildTopicEvidenceTimeline({ ...scope, events: [
      event(), event({ eventId: 'event-other' })
    ] })).toThrow('memory-sequence-conflict');
  });
  it('requires real older provenance for explicit corrections', () => {
    expect(() => buildTopicEvidenceTimeline({ ...scope,
      events: [correction] })).toThrow('memory-provenance-conflict');
    expect(() => buildTopicEvidenceTimeline({ ...scope,
      events: [event(), correction] })).not.toThrow();
  });
  it('accepts owner diary observations only with a diary source', () => {
    const diary = event({eventId:'diary-1', sequence:5,
      kind:'owner.diary.observation', verification:'owner-observed',
      source: {collection:'diaryNotes',documentId:'note-1',recordId:'note-1'},
      text:'Наблюдение из дневника'});
    expect(validateTopicEvidenceEvent(diary,scope).source.collection).toBe('diaryNotes');
    expect(() => validateTopicEvidenceEvent({...diary,source},scope))
      .toThrow('invalid-memory-event');
  });
  it('preserves correction, original source and disputed hypothesis separately', () => {
    const timeline = buildTopicEvidenceTimeline({ ...scope,
      events: [rejection, correction, event(), suggestion] });
    expect(timeline.map(item => item.kind)).toEqual([
      'user.turn', 'owner.correction', 'assistant.hypothesis',
      'owner.hypothesis.review'
    ]);
    expect(timeline[1].supersedes).toBe('event-1');
    expect(timeline[2].verification).toBe('model-proposed');
  });
  it('counts only explicit recorded returns, not opening or normal turns', () => {
    const recordedReturn = event({
      eventId: 'event-5', sequence: 5, kind: 'owner.topic.return',
      verification: 'owner-observed', text: 'Я вернулся к вопросу через неделю'
    });
    const timeline = buildTopicEvidenceTimeline({ ...scope,
      events: [event(), correction, recordedReturn] });
    expect(countRecordedTopicReturns(timeline)).toBe(1);
  });
  it('fails closed without a matching active permission', () => {
    const args = { ...scope, events: [event()], nowMs: 1000 };
    expect(planTopicEvidenceContext(args).items).toEqual([]);
    expect(planTopicEvidenceContext({ ...args,
      permission: { ...permission, ownerId: 'owner-B' }
    }).authorized).toBe(false);
    expect(planTopicEvidenceContext({ ...args, nowMs: 2000,
      permission }).authorized).toBe(false);
  });
  it('prioritizes user corrections over model guesses within a byte budget', () => {
    const planned = planTopicEvidenceContext({ ...scope,
      events: [event(), suggestion, rejection, correction],
      permission, nowMs: 1000, maxItems: 2, maxBytes: 1600
    });
    expect(planned.items.map(item => item.kind)).toEqual([
      'owner.correction', 'owner.hypothesis.review'
    ]);
    expect(planned.omitted).toBe(2);
    expect(planned.providerContextSent).toBe(false);
    expect(planned.usedBytes).toBeLessThanOrEqual(1600);
  });
});
