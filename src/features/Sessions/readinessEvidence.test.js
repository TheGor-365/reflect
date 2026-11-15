import { describe, expect, it } from 'vitest';
import {
  exactOwnerSource, isReadinessApplicable, validatedReadiness
} from './readinessEvidence';

const turns = [
  { id: 'user-m5a-situation-001', role: 'user',
    content: 'Я не закончил MVP, хотя уже начал работу.' },
  { id: 'assistant-m5a-001', role: 'assistant',
    content: 'Возможно, вы сомневаетесь в результате.',
    interaction: { version: 'reflect.interaction.v1', intent: 'plan' } },
  { id: 'user-m5a-desired-001', role: 'user',
    content: 'Хочу опубликовать MVP через десять дней.' },
  { id: 'user-m5a-circumstances-001', role: 'user',
    content: 'У меня есть два часа в день на разработку.' },
  { id: 'user-m5a-constraints-001', role: 'user',
    content: 'Нельзя отказаться от проверки оплаты и авторизации.' }
];
const quote = index => turns[index].content;
const entry = (i, status = 'confirmed') => ({
  sourceTurnId: turns[i].id, quote: quote(i),
  status, confirmedByOwner: true
});
const base = () => ({ id: 'owner-session-001', chatHistory: turns });

describe('M5a: four owner-confirmed source-backed evidence categories', () => {
  it('starts from 0/4, not imaginary AI completeness', () => {
    const r = validatedReadiness(base());
    expect(r.confirmedSlots).toBe(0);
    expect(r.percentage).toBe(0);
    expect(r.slots).toHaveLength(4);
    expect(r.slots.every(s => s.state === 'missing')).toBe(true);
  });
  it('scores only 25/50/75/100 by exact saved owner statements', () => {
    const session = base();
    const sources = [
      ['situation', 0], ['desiredResult', 2],
      ['circumstances', 3], ['constraints', 4]
    ];
    session.readinessEvidence = {};
    sources.forEach(([slot, i], index) => {
      session.readinessEvidence[slot] = entry(i);
      const r = validatedReadiness(session);
      expect(r.confirmedSlots).toBe(index + 1);
      expect(r.percentage).toBe((index + 1) * 25);
      expect(r.slots[index].sourceTurnId).toBe(turns[i].id);
      expect(r.slots[index].quote).toBe(quote(i));
    });
  });
  it('disputed, stale, edited, AI-origin and forged citations add ZERO', () => {
    const session = base();
    session.readinessEvidence = {
      situation: entry(0),
      desiredResult: entry(2, 'disputed'),
      circumstances: { ...entry(3), quote: 'Я придумал два часа в день.' },
      constraints: {
        ...entry(4), sourceTurnId: 'assistant-m5a-001',
        quote: 'Возможно, вы сомневаетесь в результате.'
      }
    };
    const r = validatedReadiness(session);
    expect(r.percentage).toBe(25);
    expect(r.slots.map(x => x.state)).toEqual([
      'confirmed', 'disputed', 'unverified', 'unverified'
    ]);
    session.chatHistory[0] = { ...session.chatHistory[0],
      content: 'Я уже закончил MVP' };
    expect(validatedReadiness(session).percentage).toBe(0);
    expect(exactOwnerSource(session, turns[1].id, turns[1].content)).toBeNull();
  });
  it('rejects duplicate turn IDs, oversized quotes, controls and nonowner sources', () => {
    const session = base();
    session.chatHistory.push({ ...turns[0] });
    expect(exactOwnerSource(session, turns[0].id, quote(0))).toBeNull();
    expect(exactOwnerSource(base(), turns[0].id, 'A'.repeat(230))).toBeNull();
    expect(exactOwnerSource(base(), turns[0].id, 'Я\nне закончил')).toBeNull();
    expect(exactOwnerSource(base(), '../jack', quote(0))).toBeNull();
  });
  it('hides readiness for venting, support/companion and new unknown mode', () => {
    expect(isReadinessApplicable(base(), 'coach')).toBe(true);
    expect(isReadinessApplicable(base(), 'analytic')).toBe(true);
    expect(isReadinessApplicable(base(), 'support')).toBe(false);
    expect(isReadinessApplicable(base(), 'companion')).toBe(false);
    expect(isReadinessApplicable(base(), 'reflection')).toBe(false);
    expect(isReadinessApplicable(base(), 'coach',
      'Просто хочу выговориться, не предлагай решения')).toBe(false);
    const vent = base();
    vent.chatHistory.push({ id: 'user-vent-001', role: 'user',
      content: 'Просто хочу выговориться, не надо давать решений и планов' });
    expect(isReadinessApplicable(vent, 'analytic')).toBe(false);
    vent.chatHistory.push({ id: 'user-new-plan-001', role: 'user',
      content: 'Теперь хочу составить план работы над MVP' });
    expect(isReadinessApplicable(vent, 'analytic')).toBe(true);
  });
});
