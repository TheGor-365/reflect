import { describe, expect, it } from 'vitest';
import { recommendationGoalGate } from './recommendationGoalGate';

const source = 'assistant-verified-001';
const base = {
  version: 'reflect.interaction.v1', stage: 'synthesize',
  clarifyingQuestion: '', unknowns: [], insights: []
};
const review = (index, grade = 3) => ({
  assistantMessageId: source, hypothesisIndex: index,
  grade, comment: '', reviewedAt: { seconds: 1 }
});
const evaluate = (interaction, reviews = {}) =>
  recommendationGoalGate({ interaction, assistantMessageId: source, reviews });

describe('M6a identical UI and transaction prerequisite gate', () => {
  it('allows empty hypotheses only with zero unresolved unknowns or question', () => {
    expect(evaluate(base)).toEqual({ allowed: true, code: 'ready', reason: '' });
    expect(evaluate({ ...base, stage: 'clarify' }).code).toBe('question');
    expect(evaluate({ ...base, clarifyingQuestion: 'Что случилось?' }).code)
      .toBe('question');
    expect(evaluate({ ...base, unknowns: ['Что является целью'] }).code)
      .toBe('unknown');
    expect(evaluate({ ...base, unknowns: undefined }).allowed).toBe(false);
  });
  it('requires exact owner-scoped feedback for every model hypothesis', () => {
    const interaction = { ...base, insights: ['A', 'Б'] };
    const reviews = { [`h-${source}-0`]: review(0) };
    expect(evaluate(interaction, reviews).code).toBe('unreviewed');
    reviews[`h-${source}-1`] = review(1);
    expect(evaluate(interaction, reviews).allowed).toBe(true);
    reviews[`h-${source}-1`] = { ...review(1), assistantMessageId: 'jack' };
    expect(evaluate(interaction, reviews).code).toBe('source');
    reviews[`h-${source}-1`] = { ...review(1), grade: 9 };
    expect(evaluate(interaction, reviews).code).toBe('source');
  });
  it('does not silently promote hypotheses the owner explicitly rejected', () => {
    const interaction = { ...base, insights: ['Причина'] };
    const reviews = { [`h-${source}-0`]: review(0, 0) };
    expect(evaluate(interaction, reviews).code).toBe('disputed');
    reviews[`h-${source}-0`] = review(0, 2);
    expect(evaluate(interaction, reviews).allowed).toBe(true);
  });
  it('supports v2 confirmed slots but blocks disputed ones without fabricating facts', () => {
    const v2 = { ...base, version: 'reflect.interaction.v2',
      evidenceSummary: { completeCount: 1, confirmedSlots: ['situation'],
        missingSlots: ['constraints'], disputedSlots: [] } };
    expect(evaluate(v2).allowed).toBe(true);
    expect(evaluate({ ...v2, evidenceSummary: {
      ...v2.evidenceSummary, disputedSlots: ['desiredResult']
    }}).code).toBe('disputed');
    expect(evaluate({ ...v2, evidenceSummary: null }).allowed).toBe(false);
  });
  it('rejects unknown versions, malformed IDs or fake extra insights', () => {
    expect(evaluate({ ...base, version: 'reflect.interaction.v999' }).allowed)
      .toBe(false);
    expect(recommendationGoalGate({
      interaction: base, assistantMessageId: '../jack'
    }).allowed).toBe(false);
    expect(evaluate({ ...base, insights: ['A','B','C'] }).allowed).toBe(false);
  });
});
