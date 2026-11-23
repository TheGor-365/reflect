import { describe, expect, it } from 'vitest';
import { projectTopicMemory } from './topicMemoryProjection.js';
import {
  auditTopicMemorySnapshot, canonicalMemoryValue, MAX_AUDIT_EVENTS
} from './topicMemoryAudit.r102c.js';

const ownerId = 'owner-A', topicId = 'session-A';
const session = {
  chatHistory: [
    { id: 'u-1', role: 'user', content: 'Я рассказал о работе' },
    { id: 'ai-1', role: 'assistant', interaction: {
      insights: ['Вы можете испытывать давление'],
      recommendationCandidates: [{ title: 'Записать наблюдение',
        rationale: 'Посмотреть на ситуацию' }]
    } }
  ],
  returnCheckIns: [{ id: 'visit-1', author: 'user', type: 'return-check-in',
    memoryEventId: 'ev-1', text: 'Я снова думаю об этом' }]
};
const returning = (sequence, id = `ev-${sequence}`, visit = `visit-${sequence}`) => ({
  schemaVersion: 1, eventId: id, ownerId, topicId, sessionId: topicId,
  sequence, kind: 'owner.topic.return', origin: 'owner',
  verification: 'owner-observed', text: 'Я вернулся к теме',
  source: { collection: 'sessions', documentId: topicId, recordId: visit },
  payload: { note: `Я снова думаю об этом` }, topicScope: 'session-provisional'
});
const reviewing = (sequence = 1, opts = {}) => ({
  schemaVersion: 1, eventId: `ev-${sequence}`, ownerId, topicId,
  sessionId: topicId, sequence,
  kind: 'owner.hypothesis.review', origin: 'owner',
  verification: 'owner-reviewed', text: 'Оценка гипотезы: 0',
  source: { collection: 'sessions', documentId: topicId, recordId: 'h-ai-1-0' },
  payload: { grade: 0, comment: 'Не похоже', assistantMessageId: 'ai-1',
    hypothesisIndex: 0 }, topicScope: 'session-provisional', ...opts
});
const deciding = (sequence = 1, opts = {}) => ({
  schemaVersion: 1, eventId: `ev-${sequence}`, ownerId, topicId,
  sessionId: topicId, sequence, kind: 'owner.recommendation.decision',
  origin: 'owner', verification: 'owner-decided', text: 'Решение',
  source: { collection: 'sessions', documentId: topicId, recordId: 'r-ai-1-0' },
  payload: { status: 'dismissed', title: 'Записать наблюдение',
    sourceMessageId: 'u-1', assistantMessageId: 'ai-1', candidateIndex: 0 },
  topicScope: 'session-provisional', ...opts
});
const topic = events => ({ ownerId, topicId, scopeMode: 'session-provisional',
  lastSequence: events.length, lastEventId: events.at(-1).eventId });
const cp = (events, through = events.length) => {
  const projection = projectTopicMemory({ ownerId, topicId,
    events: events.slice(0, through) });
  return { checkpointVersion: 1, ownerId, topicId, asOfSequence: through,
    asOfEventId: events[through - 1].eventId, clientComputed: true,
    providerUseAllowed: false, projection };
};
const args = (events, saved = null, source = session) => ({
  ownerId, topicId, topic: topic(events), events, checkpoint: saved,
  sessionsById: { [topicId]: source }
});

describe('R10.2-C safe ledger replay and source-reference audit', () => {
  it('canonical comparison ignores Firestore map key order', () => {
    expect(canonicalMemoryValue({ b: [1, { z: 3, a: 2 }], a: 'x' }))
      .toBe(canonicalMemoryValue({ a: 'x', b: [1, { a: 2, z: 3 }] }));
  });
  it('canonical comparison rejects cycles, undefined and prototype pollution', () => {
    const cycle = {}; cycle.back = cycle;
    expect(() => canonicalMemoryValue(cycle))
      .toThrow('memory-audit-invalid-value');
    expect(() => canonicalMemoryValue({ missing: undefined }))
      .toThrow('memory-audit-invalid-value');
    const poisoning = Object.create(null); poisoning.__proto__ = 'unsafe';
    expect(() => canonicalMemoryValue(poisoning))
      .toThrow('memory-audit-invalid-value');
  });
  it('reports a complete matching checkpoint without authorizing the provider', () => {
    const events = [returning(1)];
    const report = auditTopicMemorySnapshot(args(events, cp(events)));
    expect(report).toMatchObject({ status: 'checkpoint-matches-ledger',
      repair: 'none', sourceReferencesChecked: 1,
      independentServerAttestation: false, authorizedForProvider: false,
      writePerformed: false });
  });
  it('identifies a missing checkpoint and never writes a repair', () => {
    const result = auditTopicMemorySnapshot(args([returning(1)]));
    expect(result).toMatchObject({ status: 'checkpoint-missing',
      repair: 'create-through-existing-transaction', writePerformed: false });
  });
  it('finds a corrupted cached value even when its sequence looks correct', () => {
    const events = [returning(1)];
    const dirty = cp(events); dirty.projection.counts.explicitReturns = 0;
    expect(auditTopicMemorySnapshot(args(events, dirty)))
      .toMatchObject({ status: 'checkpoint-diverged',
        repair: 'authorized-manual-repair-required' });
  });
  it('rejects provider permission set on a client checkpoint', () => {
    const events = [returning(1)]; const dirty = cp(events);
    dirty.providerUseAllowed = true;
    expect(auditTopicMemorySnapshot(args(events, dirty)).status)
      .toBe('checkpoint-diverged');
  });
  it('recognizes a correct stale cache while preserving the new event', () => {
    const events = [returning(1), reviewing(2)];
    const report = auditTopicMemorySnapshot(args(events, cp(events, 1)));
    expect(report).toMatchObject({ status: 'checkpoint-stale',
      comparedThrough: 1, repair: 'advance-through-existing-transaction' });
    expect(report.expectedProjection.counts.processed).toBe(2);
  });
  it('refuses missing, out-of-order, or altered ledger records', () => {
    const events = [returning(1), reviewing(2)];
    expect(() => auditTopicMemorySnapshot({ ...args(events),
      events: events.slice(1) })).toThrow('memory-audit-incomplete-ledger');
    expect(() => auditTopicMemorySnapshot({ ...args(events),
      events: [events[1], events[0]] })).toThrow('memory-projection-noncontiguous');
    expect(() => auditTopicMemorySnapshot({ ...args(events),
      events: [events[0], { ...events[1], ownerId: 'outsider' }] }))
      .toThrow();
  });
  it('refuses mismatched topic head and oversized complete audits', () => {
    expect(() => auditTopicMemorySnapshot({ ...args([returning(1)]),
      topic: { ...topic([returning(1)]), lastEventId: 'wrong' } }))
      .toThrow('memory-audit-ledger-head-mismatch');
    expect(() => auditTopicMemorySnapshot({ ...args([returning(1)]),
      topic: { ...topic([returning(1)]), lastSequence: MAX_AUDIT_EVENTS + 1 } }))
      .toThrow('memory-audit-invalid-topic');
  });
  it('refuses missing source sessions and forged return receipts', () => {
    expect(() => auditTopicMemorySnapshot(args([returning(1)], null, null)))
      .toThrow('memory-audit-source-missing');
    const forged = { ...session, returnCheckIns: [
      { ...session.returnCheckIns[0], memoryEventId: 'other-event' }] };
    expect(() => auditTopicMemorySnapshot(args([returning(1)], null, forged)))
      .toThrow('memory-audit-source-mismatch');
  });
  it('explicit topic ID must still match saved source session', () => {
    const e = reviewing(1, { topicScope: 'explicit' });
    const provided = args([e]);
    provided.topic.scopeMode = 'explicit';
    expect(() => auditTopicMemorySnapshot(provided))
      .toThrow('memory-audit-topic-source-mismatch');
  });
  it('refuses an invented source assistant turn or source hypothesis', () => {
    expect(() => auditTopicMemorySnapshot(args([reviewing(1)], null, {
      ...session, chatHistory: session.chatHistory.slice(0, 1)
    }))).toThrow('memory-audit-source-missing');
    expect(() => auditTopicMemorySnapshot(args([reviewing(1)], null, {
      ...session, chatHistory: [session.chatHistory[0], {
        ...session.chatHistory[1], interaction: { insights: [] }
      }]
    }))).toThrow('memory-audit-source-mismatch');
  });
  it('cross-checks recommendation text and preceding owner turn', () => {
    expect(() => auditTopicMemorySnapshot(args([deciding(1)], null, {
      ...session, chatHistory: [session.chatHistory[0], {
        ...session.chatHistory[1], interaction: {
          ...session.chatHistory[1].interaction,
          recommendationCandidates: [{ title: 'Новая рекомендация' }]
        }
      }]
    }))).toThrow('memory-audit-source-mismatch');
    expect(() => auditTopicMemorySnapshot(args([deciding(1, {
      payload: { ...deciding().payload, sourceMessageId: 'forged-id' }
    })]))).toThrow('memory-audit-source-mismatch');
  });
  it('preserves historical owner corrections even if current review changed', () => {
    const first = reviewing(1);
    const correction = { ...reviewing(2), kind: 'owner.correction',
      verification: 'owner-corrected', supersedes: first.eventId,
      payload: { ...first.payload, grade: 4, comment: 'Пересмотрел мнение' } };
    const report = auditTopicMemorySnapshot(args([first, correction]));
    expect(report.expectedProjection.hypothesisReviews['session-A:h-ai-1-0'])
      .toMatchObject({ grade: 4, revision: 2, supersedes: first.eventId });
    expect(report.expectedProjection.counts.corrections).toBe(1);
  });
  it('never treats a mutable session review map as proof of past revisions', () => {
    const events = [reviewing(1)];
    const source = { ...session, hypothesisReviews: {
      'h-ai-1-0': { grade: 4, comment: 'Latest is different' }
    } };
    const report = auditTopicMemorySnapshot(args(events, cp(events), source));
    expect(report.status).toBe('checkpoint-matches-ledger');
    expect(report.independentServerAttestation).toBe(false);
  });
  it('refuses a forged older checkpoint even when the current ledger is sound', () => {
    const events = [returning(1), reviewing(2)];
    const dirty = cp(events, 1);
    dirty.projection.recentReturns = [];
    expect(auditTopicMemorySnapshot(args(events, dirty)).status)
      .toBe('checkpoint-diverged');
  });
});
