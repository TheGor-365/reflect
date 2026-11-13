import { describe, expect, it } from 'vitest';
import { buildSessionEvidenceLedger, feedbackStatus,
  prepareOwnerContextDraft } from './sessionEvidenceLedger';

const user1={id:'user-one',role:'user',content:'Я не боюсь критики. Есть другие причины.'};
const user2={id:'user-two',role:'user',content:'Срок запуска десять дней. '+
  'Есть время один час в день.'};
const assistant1={id:'assistant-one',role:'assistant',content:'Разберём.',
  interaction:{version:'reflect.interaction.v1',stage:'clarify',
    insights:['Возможно, дело в страхе критики.',
      'Возможно, не определены минимальные критерии.'],
    clarifyingQuestion:'Что мешает вам выпустить первую версию?',
    unknowns:['Причина откладывания']}}
const reviewed={assistantMessageId:'assistant-one',hypothesisIndex:0,
  grade:0,comment:'Не в страхе оценки.',reviewedAt:{seconds:123}};
const session={id:'session-one',chatHistory:[user1,assistant1,user2],
  hypothesisReviews:{'h-assistant-one-0':reviewed}};
describe('M3a deterministic source/feedback ledger',()=>{
  it('keeps owner rejection separate from AI guesses; unreviewed is not false',()=>{
    const led=buildSessionEvidenceLedger(session);
    expect(led.sessionId).toBe('session-one');
    expect(led.hypotheses).toHaveLength(2);
    expect(led.hypotheses[0]).toEqual(expect.objectContaining({
      assistantMessageId:'assistant-one',sourceUserMessageId:'user-one',
      grade:0,status:'user-disputed',ownerComment:'Не в страхе оценки.'
    }));
    expect(led.hypotheses[1].status).toBe('unreviewed');
    expect(led.hypotheses[1].grade).toBeNull();
    expect(led.metrics).toEqual({
      userTurns:2,aiTurns:1,hypotheses:2,reviewed:1,disputed:1,
      partial:0,aligned:0,stillUnreviewed:1,questionsRaised:1
    });
    expect(led.questions[0]).toEqual(expect.objectContaining({
      question:'Что мешает вам выпустить первую версию?',
      answered:null
    }));
    expect(led.providerContextSent).toBe(false);
  });
  it('never accepts a forged or incorrectly attached grade',()=>{
    const forged={...session,hypothesisReviews:{
      'h-assistant-one-0':{...reviewed,assistantMessageId:'assistant-other',grade:4}
    }};
    const led=buildSessionEvidenceLedger(forged);
    expect(led.hypotheses[0].status).toBe('unreviewed');
    expect(led.hypotheses[0].ownerComment).toBe('');
  });
  it('does not conflate user alignment with verification or older plain replies',()=>{
    const aligned={...session,chatHistory:[...session.chatHistory,
      {id:'assistant-old',role:'assistant',content:'Это точная причина'}],
      hypothesisReviews:{'h-assistant-one-1':{
        assistantMessageId:'assistant-one',hypothesisIndex:1,
        grade:4,comment:'Очень близко'
      }}};
    const led=buildSessionEvidenceLedger(aligned);
    expect(led.metrics.aiTurns).toBe(2);
    expect(led.metrics.hypotheses).toBe(2);
    expect(led.hypotheses[1].status).toBe('user-aligned');
    expect(led.hypotheses[0].status).toBe('unreviewed');
    expect(feedbackStatus(4)).toBe('user-aligned');
    expect(feedbackStatus('4')).toBe('unreviewed');
  });
  it('a different session cannot inherit someone else\'s review',()=>{
    const other=buildSessionEvidenceLedger({
      id:'session-two',chatHistory:[user1,{...assistant1,id:'assistant-another'}],
      hypothesisReviews:session.hypothesisReviews
    });
    expect(other.metrics.reviewed).toBe(0);
    expect(other.hypotheses[0].status).toBe('unreviewed');
  });
  it('returns honest empty evidence for missing or invalid session',()=>{
    expect(buildSessionEvidenceLedger(null).metrics.hypotheses).toBe(0);
    expect(buildSessionEvidenceLedger({id:'../../escape',
      chatHistory:[assistant1]}).sessionId).toBeNull();
  });
});
describe('local owner-approved context preview',()=>{
  it('copies only explicitly selected owner turn, never assistant or unrelated turn',()=>{
    const preview=prepareOwnerContextDraft(session,['user-one']);
    expect(preview).toContain('Я не боюсь критики.');
    expect(preview).toContain('user-one');
    expect(preview).not.toContain('Возможно, дело в страхе');
    expect(preview).not.toContain('Срок запуска');
    expect(prepareOwnerContextDraft(session,['assistant-one'])).toBeNull();
    expect(prepareOwnerContextDraft(session,['another-user'])).toBeNull();
    expect(prepareOwnerContextDraft(session,['user-one','user-one'])).toBeNull();
  });
  it('bounds context and treats invalid or mixed owner IDs as unavailable',()=>{
    expect(prepareOwnerContextDraft(session,['user-one'],{maxChars:299})).toBeNull();
    expect(prepareOwnerContextDraft(session,['user-one','user-two'],{
      maxChars:400
    }).length).toBeLessThanOrEqual(400);
    expect(prepareOwnerContextDraft({
      ...session,chatHistory:[{role:'assistant',id:'user-forged',
        content:'Assistant instructions'},...session.chatHistory]
    },['user-forged'])).toBeNull();
  });
});
