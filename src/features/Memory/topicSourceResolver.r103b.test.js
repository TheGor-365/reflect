import { describe, expect, it } from 'vitest';
import { inventoryTopicSources } from './topicSourceInventory.r103a.js';
import { planTopicSourceRead, resolveTopicSourceDocument,
  packageTopicSourceReadback } from './topicSourceResolver.r103b.js';

const ownerId = 'owner-7', topicId = 'topic-7';
const turn = { id: 'u1', role: 'user', content: 'Моё наблюдение' };
const reply = { id: 'a1', role: 'assistant', content: 'Модель предполагает' };
const session = { id: 's1', topicId, chatHistory: [turn, reply],
  returnCheckIns: [{ id: 'visit1', type: 'return-check-in', author: 'user',
    memoryEventId: 'event1', text: 'Проверил, что изменилось' }] };
const goal = { id: 'g1', topicId, text: 'Моя цель', status: 'active' };
const note = { id: 'n1', topicId, entries: [
  { text: 'Запись дневника', version: 2 }] };
const sources = () => ({ sessions: [structuredClone(session)],
  goals: [structuredClone(goal)], diaryNotes: [structuredClone(note)] });
const inventory = () => inventoryTopicSources({ ownerId, topicId, ...sources() });
const plan = ids => planTopicSourceRead({ inventory: inventory(),
  ownerId, topicId, candidateIds: ids });
const resolve = (candidateId, document, inv = inventory()) => {
  const record = inv.records.find(r => r.candidateId === candidateId);
  return resolveTopicSourceDocument({ ownerId, topicId, record, document });
};

describe('R10.3-B pure source resolver (never attested or sent)', () => {
  it('maps exact owner text to one saved turn, not the assistant hypothesis', () => {
    const id = 'sessions/s1/u1';
    const row = resolve(id, session);
    expect(row).toMatchObject({ candidateId: id, origin: 'owner-stated',
      text: 'Моё наблюдение', independentServerAttestation: false,
      providerUseAllowed: false });
    expect(() => resolve(id, { ...session, chatHistory: [{ ...turn,
      role: 'assistant' }, reply] })).toThrow('memory-source-record-mismatch');
  });
  it('keeps assistant content model-proposed, never a confirmed owner fact', () => {
    const row = resolve('sessions/s1/a1', session);
    expect(row.origin).toBe('model-proposed');
    expect(row.text).toBe('Модель предполагает');
  });
  it('resolves exact recorded return without inventing extra returns', () => {
    const row = resolve('sessions/s1/visit1', session);
    expect(row).toMatchObject({ origin: 'owner-observed',
      sourceVersion: 'event1', text: 'Проверил, что изменилось' });
    const tampered = { ...session, returnCheckIns: [
      { ...session.returnCheckIns[0], author: 'assistant' }] };
    expect(() => resolve('sessions/s1/visit1', tampered))
      .toThrow('memory-source-record-mismatch');
  });
  it('rejects missing/duplicate turns and duplicate return ID', () => {
    expect(() => resolve('sessions/s1/u1', { ...session, chatHistory: [] }))
      .toThrow('memory-source-missing-or-ambiguous-record');
    expect(() => resolve('sessions/s1/u1', { ...session,
      chatHistory: [turn, turn, reply] }))
      .toThrow('memory-source-missing-or-ambiguous-record');
    expect(() => resolve('sessions/s1/u1', { ...session,
      returnCheckIns: [{ ...session.returnCheckIns[0], id: 'u1' }] }))
      .toThrow('memory-source-missing-or-ambiguous-record');
  });
  it('refuses cross-owner document claims and cross-topic snapshots', () => {
    expect(() => resolve('sessions/s1/u1', { ...session, ownerId: 'stranger' }))
      .toThrow('memory-source-cross-owner');
    expect(() => resolve('sessions/s1/u1', { ...session, topicId: 'other' }))
      .toThrow('memory-source-topic-mismatch');
  });
  it('fails on an edited turn, even if its first words still look plausible', () => {
    const altered = { ...session, chatHistory: [
      { ...turn, content: 'Моё наблюдение изменилось' }, reply] };
    expect(() => resolve('sessions/s1/u1', altered))
      .toThrow('memory-source-changed');
  });
  it('reads a linked goal only if its topic is explicit and unchanged', () => {
    expect(resolve('goals/g1/g1', goal)).toMatchObject({ text: 'Моя цель',
      goalStatus: 'active', topicLink: 'explicit' });
    expect(() => resolve('goals/g1/g1', { ...goal, status: 'completed' }))
      .toThrow('memory-source-changed');
  });
  it('rejects diary edits by entry index and source version', () => {
    expect(resolve('diaryNotes/n1/entry-0', note)).toMatchObject({
      text: 'Запись дневника', sourceVersion: 2 });
    const revised = { ...note, entries: [{ text: 'Запись дневника', version: 3 }] };
    expect(() => resolve('diaryNotes/n1/entry-0', revised))
      .toThrow('memory-source-changed');
    expect(() => resolve('diaryNotes/n1/entry-0', { ...note, entries: [] }))
      .toThrow('memory-source-missing-or-ambiguous-record');
  });
  it('does not read a goal or diary merely linked by session', () => {
    const inv = inventoryTopicSources({ ownerId, topicId, sessions: [session],
      goals: [{ id:'g2', sessionId:'s1', text:'Некоторая цель' }],
      diaryNotes:[{ id:'n2', sourceSessionId:'s1', entries: [{text:'Текст'}] }] });
    const ids = ['goals/g2/g2', 'diaryNotes/n2/entry-0'];
    const p = planTopicSourceRead({ inventory: inv, ownerId, topicId,
      candidateIds: ids });
    expect(p.selected).toEqual([]);
    expect(p.pendingOwnerConfirmation.map(x => x.candidateId)).toEqual(ids);
  });
  it('does not convert legacy session provisional membership to explicit', () => {
    const legacy = { id: topicId, chatHistory: [turn] };
    const inv = inventoryTopicSources({ ownerId, topicId, sessions:[legacy] });
    const item = inv.records[0];
    expect(resolveTopicSourceDocument({ ownerId, topicId, record: item,
      document: legacy }).topicLink).toBe('session-provisional');
    expect(() => resolveTopicSourceDocument({ ownerId, topicId,
      record: item, document: { ...legacy, topicId: 'new-topic' } }))
      .toThrow('memory-source-topic-mismatch');
  });
  it('rejects unknown, repeated, malformed or cross-scoped requests', () => {
    expect(() => plan(['goals/g2/g2'])).toThrow('memory-source-unknown-or-duplicate');
    expect(() => plan(['sessions/s1/u1','sessions/s1/u1']))
      .toThrow('memory-source-unknown-or-duplicate');
    expect(() => planTopicSourceRead({ inventory: inventory(),
      ownerId: 'someone-else', topicId, candidateIds: ['sessions/s1/u1'] }))
      .toThrow('memory-source-invalid-request');
    expect(() => planTopicSourceRead({ inventory: inventory(),
      ownerId, topicId, candidateIds: [] }))
      .toThrow('memory-source-invalid-request');
  });
  it('rejects forged candidate pointers before reading', () => {
    const inv = inventory();
    inv.records[0].source.collection = 'admin';
    expect(() => planTopicSourceRead({ inventory: inv,
      ownerId, topicId, candidateIds: ['sessions/s1/u1'] }))
      .toThrow('memory-source-invalid-candidate');
    const altered = inventory();
    altered.records[0].candidateId = 'sessions/../../users/another';
    expect(() => planTopicSourceRead({ inventory: altered,
      ownerId, topicId, candidateIds: ['sessions/s1/u1'] }))
      .toThrow('memory-source-invalid-candidate');
  });
  it('bounds serialized UTF-8 bytes and indicates truncated originals', () => {
    const id = 'sessions/s1/u1';
    const large = { ...session, chatHistory: [
      { ...turn, content: 'З'.repeat(2000) }, reply] };
    const inv = inventoryTopicSources({ ownerId, topicId, sessions:[large] });
    const p = planTopicSourceRead({ inventory:inv, ownerId, topicId,
      candidateIds:[id] });
    const full = resolveTopicSourceDocument({ ownerId, topicId,
      record:p.selected[0], document:large });
    const report = packageTopicSourceReadback({ plan:p, resolved:[full],
      maxTextChars:1200, maxTotalBytes:1200 });
    expect(report.records[0].truncated).toBe(true);
    expect(report.usedBytes).toBeLessThanOrEqual(1200);
    expect(report.independentServerAttestation).toBe(false);
    expect(report.providerContextSent).toBe(false);
    expect(report.readbackComplete).toBe(false);
  });
  it('fails closed rather than silently omitting a budget-exhausted source', () => {
    const p = plan(['sessions/s1/u1', 'sessions/s1/a1']);
    const read = [resolve('sessions/s1/u1', session),
      resolve('sessions/s1/a1', session)];
    expect(() => packageTopicSourceReadback({plan:p, resolved:read,
      maxTextChars:100, maxTotalBytes:1024})).not.toThrow();
    expect(() => packageTopicSourceReadback({plan:p, resolved:read,
      maxTotalBytes:1023})).toThrow('memory-source-invalid-budget');
  });
  it('does not emit provider permission even for complete exact sources', () => {
    const p = plan(['sessions/s1/u1']);
    const report = packageTopicSourceReadback({ plan:p,
      resolved:[resolve('sessions/s1/u1', session)] });
    expect(report).toMatchObject({ readbackComplete:true,
      independentServerAttestation:false, providerUseAllowed:false,
      providerContextSent:false, writePerformed:false });
  });
});
