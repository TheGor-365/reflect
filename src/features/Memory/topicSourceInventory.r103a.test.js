import { describe, expect, it } from 'vitest';
import { inventoryTopicSources } from './topicSourceInventory.r103a.js';

const ownerId = 'alice_1';
const topicId = 'topic_A';
const userTurn = { id: 'user_1', role: 'user', content: 'Я хочу разобраться с задачей' };
const assistantTurn = { id: 'model_1', role: 'assistant', content: 'Возможно, дело в привычке' };
const base = () => ({ ownerId, topicId });
const session = (extra = {}) => ({ id: 'session_1', topicId,
  chatHistory: [userTurn, assistantTurn], ...extra });

describe('R10.3-A source inventory: read-only and never provider-authorized', () => {
  it('keeps owner and assistant origins separate and never attests either', () => {
    const inventory = inventoryTopicSources({ ...base(), sessions: [session()] });
    expect(inventory.candidateCount).toBe(2);
    expect(inventory.records.map(r => r.origin)).toEqual(['owner-stated', 'model-proposed']);
    expect(inventory.records.every(r => r.verification === 'unverified-source-snapshot')).toBe(true);
    expect(inventory.providerUseAllowed).toBe(false);
    expect(inventory.independentServerAttestation).toBe(false);
  });
  it('excludes unrelated sessions even if words are identical', () => {
    const other = session({ id: 'session_2', topicId: 'other',
      chatHistory: [userTurn] });
    expect(inventoryTopicSources({ ...base(), sessions: [session(), other] })
      .candidateCount).toBe(2);
  });
  it('uses legacy provisional session only when ID equals topicId', () => {
    const legacy = { id: topicId, chatHistory: [userTurn] };
    const records = inventoryTopicSources({ ...base(), sessions: [legacy] }).records;
    expect(records).toHaveLength(1);
    expect(records[0].topicLink).toBe('session-provisional');
  });
  it('fails closed on a cross-owner claim in any source', () => {
    expect(() => inventoryTopicSources({ ...base(), sessions: [session({ownerId:'bob'})] }))
      .toThrow('memory-inventory-cross-owner');
    expect(() => inventoryTopicSources({ ...base(), goals: [{id:'g', userId:'bob'}] }))
      .toThrow('memory-inventory-cross-owner');
  });
  it('rejects duplicate source IDs or duplicate message IDs', () => {
    expect(() => inventoryTopicSources({ ...base(), sessions: [session(), session()] }))
      .toThrow('memory-inventory-duplicate-source');
    expect(() => inventoryTopicSources({ ...base(), sessions: [session({
      chatHistory: [userTurn, userTurn]
    })] })).toThrow('memory-inventory-duplicate-turn');
  });
  it('requires explicit or session-linked goal provenance, not title similarity', () => {
    const result = inventoryTopicSources({ ...base(), sessions: [session()], goals: [
      { id:'goal_1', sessionId:'session_1', text:'Новая цель', status:'completed' },
      { id:'goal_2', text:'Та же цель', status:'completed' },
      { id:'goal_3', topicId:'another', sessionId:'session_1', text:'Не эта тема' }
    ]});
    const goal = result.records.find(r => r.source.collection === 'goals');
    expect(goal).toMatchObject({ topicLink:'session-linked',
      requiresOwnerTopicConfirmation:true, goalStatus:'completed' });
    expect(result.records.filter(r => r.source.collection === 'goals')).toHaveLength(1);
  });
  it('does not automatically attribute generic diary entries to a topic', () => {
    const inventory = inventoryTopicSources({ ...base(), sessions: [session()], diaryNotes: [
      { id:'n1', title:'Запись из размышления', entries:[{text:'Дневник'}] },
      { id:'n2', topicId, entries:[{text:'Связанная запись',version:3}] }
    ]});
    const notes = inventory.records.filter(r => r.source.collection === 'diaryNotes');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ sourceVersion:3, source:{ recordId:'entry-0', documentId:'n2' } });
  });
  it('preserves provenance of explicit owner returns without double-counting them', () => {
    const result = inventoryTopicSources({ ...base(), sessions:[session({
      returnCheckIns:[{id:'check_1', author:'user', type:'return-check-in',
        text:'Я возвращаюсь к теме',memoryEventId:'event_1'},
        {id:'check_2',author:'assistant',type:'return-check-in',text:'не пользователь'}]
    })] });
    expect(result.records.filter(r => r.sourceType === 'return-check-in'))
      .toMatchObject([{ origin:'owner-observed', sourceVersion:'event_1' }]);
  });
  it('limits previews without mutating original texts', () => {
    const content = 'А'.repeat(3000);
    const source = session({ chatHistory:[{ ...userTurn, content }] });
    const result = inventoryTopicSources({ ...base(), sessions:[source],
      maxPreviewChars: 80 });
    expect(result.records[0].textPreview).toHaveLength(80);
    expect(result.records[0].truncated).toBe(true);
    expect(source.chatHistory[0].content).toBe(content);
  });
  it('counts omissions without pretending the inventory is complete', () => {
    const result = inventoryTopicSources({ ...base(), sessions:[session()], maxItems:1 });
    expect(result.candidateCount).toBe(1);
    expect(result.omitted).toBe(1);
  });
  it('rejects conflicting or malformed topic references', () => {
    expect(() => inventoryTopicSources({ ...base(), sessions:[session({topicId:'bad topic'})] }))
      .toThrow('memory-inventory-invalid-topic-link');
    expect(() => inventoryTopicSources({ ...base(), goals:[{id:'g',topicId:'?'}] }))
      .toThrow('memory-inventory-invalid-topic-link');
  });
  it('is deterministic for the same owner-scoped document inputs', () => {
    const input = { ...base(), sessions:[session()], goals:[{id:'g', topicId,text:'Цель'}] };
    expect(inventoryTopicSources(input)).toEqual(inventoryTopicSources(input));
  });
});
