/**
 * Read-only automatic goal DRAFT eligibility after substantial session work.
 * This never creates an active goal, invents a step, adds a due date,
 * opens provider history, sends LLM requests or writes to Firestore.
 * A trusted owner action must supply acceptance criteria and approve save.
 */
import { sessionWorkProgress } from '../Sessions/sessionWorkProgress';
import { recommendationGoalGate } from '../Sessions/recommendationGoalGate';

const idOk=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
export function buildDeepGoalDrafts(sessions=[],recommendations=[]){
  const byId=new Map((Array.isArray(sessions)?sessions:[])
    .filter(s=>idOk(s?.id)).map(s=>[s.id,s]));
  const seen=new Set();
  const result=[];
  for(const proposal of Array.isArray(recommendations)?recommendations:[]){
    if(proposal?.status!=='pending'||!idOk(proposal.sessionId)||
      !idOk(proposal.assistantMessageId)||seen.has(proposal.id))continue;
    const session=byId.get(proposal.sessionId);
    if(!session)continue;
    const progress=sessionWorkProgress(session);
    const entries=Object.fromEntries(progress.rows.map(r=>[r.id,r.points]));
    // Read only the conversational signals; do NOT require that a goal
    // already exists to make a new goal draft eligible.
    const preparation=['saved','dialogue','answers','reviews','comments','returns']
      .reduce((sum,key)=>sum+(entries[key]||0),0);
    if(preparation<45||entries.dialogue<10||
      entries.reviews<5||entries.comments<5)continue;
    const turn=Array.isArray(session.chatHistory)?session.chatHistory.find(t=>
      t?.id===proposal.assistantMessageId&&t.role==='assistant'):null;
    if(!turn)continue;
    const gate=recommendationGoalGate({
      interaction:turn.interaction,
      assistantMessageId:proposal.assistantMessageId,
      reviews:session.hypothesisReviews
    });
    if(!gate.allowed)continue;
    if(typeof proposal.title!=='string'||!proposal.title.trim()||
      typeof proposal.rationale!=='string'||!proposal.rationale.trim())continue;
    seen.add(proposal.id);
    result.push(Object.freeze({
      id:proposal.id,
      sessionId:proposal.sessionId,
      assistantMessageId:proposal.assistantMessageId,
      title:proposal.title.trim().slice(0,120),
      purpose:proposal.rationale.trim().slice(0,350),
      preparationPoints:preparation,
      status:'auto-draft-needs-owner-approval'
    }));
  }
  return Object.freeze(result);
}
