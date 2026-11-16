/**
 * Deterministic session-work indicator (0..100).
 * This is a transparent PRODUCT RUBRIC, not a psychological scale,
 * AI correctness probability, medical readiness or objective goal success.
 * Only owner-scoped, already saved session and goal documents are inputs.
 * No writes, provider calls or cross-session access happen here.
 */
import { isSupportedInteraction } from './interactionVersions';

const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const row=(id,label,max,value,source)=>Object.freeze({
  id,label,max,points:clamp(value,0,max),source
});

export function sessionWorkProgress(session,goals=[]){
  const empty=()=>Object.freeze({version:'reflect.session-work.v1',
    percent:0,points:0,max:100,rows:Object.freeze([]),basis:'saved-owner-events'});
  if(!validId(session?.id))return empty();
  const history=Array.isArray(session.chatHistory)?session.chatHistory.slice(0,1000):[];
  const owned=history.filter(t=>t?.role==='user'&&validId(t.id)&&
    typeof t.content==='string'&&t.content.trim().length>0);
  const ownerIds=new Set(owned.map(t=>t.id));
  let answered=0;
  // Count observed conversational continuation after a structured question,
  // not "the question was understood" or whether the answer was adequate.
  for(let i=0;i<history.length-1;i++){
    const ai=history[i];
    if(ai?.role!=='assistant'||!isSupportedInteraction(ai.interaction)||
      !validId(ai.id)||!ai.interaction.clarifyingQuestion?.trim())continue;
    const next=history[i+1];
    if(next?.role==='user'&&ownerIds.has(next.id))answered++;
  }

  const reviews=session.hypothesisReviews &&
    typeof session.hypothesisReviews==='object' &&
    !Array.isArray(session.hypothesisReviews)?session.hypothesisReviews:{};
  let rated=0,commented=0;
  const keys=new Set();
  for(const message of history){
    if(message?.role!=='assistant'||!validId(message.id)||
      !isSupportedInteraction(message.interaction))continue;
    const insights=Array.isArray(message.interaction.insights)
      ?message.interaction.insights.slice(0,2):[];
    insights.forEach((text,index)=>{
      if(typeof text!=='string'||!text.trim())return;
      const key='h-'+message.id+'-'+index;
      if(keys.has(key))return;
      keys.add(key);
      const review=reviews[key];
      if(!review||review.assistantMessageId!==message.id||
        review.hypothesisIndex!==index||!Number.isInteger(review.grade)||
        review.grade<0||review.grade>4)return;
      rated++;
      if(typeof review.comment==='string'&&review.comment.trim())commented++;
    });
  }

  const uniqueReturnIds=new Set();
  for(const item of Array.isArray(session.returnCheckIns)
    ?session.returnCheckIns:[]){
    if(item?.type!=='return-check-in'||item.author!=='user'||
      !validId(item.id)||!item.text?.trim())continue;
    uniqueReturnIds.add(item.id);
  }

  // Only explicit association to this session. No semantic inference,
  // artificial links, unapproved goals or other user's documents.
  const linked=(Array.isArray(goals)?goals:[]).filter(g=>
    validId(g?.id)&&g.sessionId===session.id);
  const uniqueGoals=[...new Map(linked.map(g=>[g.id,g])).values()];
  const bestGoal=uniqueGoals.reduce((best,g)=>{
    const sub=Array.isArray(g.subItems)?g.subItems.filter(i=>
      validId(i?.id)&&typeof i.text==='string'&&i.text.trim()):[];
    const done=sub.filter(i=>i.completed===true).length;
    const full=g.status==='completed'&&g.completed===true;
    const progress=full?20:sub.length?Math.round(20*done/sub.length):0;
    return Math.max(best,clamp(progress,0,20));
  },0);

  const rows=Object.freeze([
    row('saved','Тема и первое сообщение',10,owned.length?10:0,'Ваш сохранённый текст'),
    row('dialogue','Продолжение диалога',15,Math.max(0,owned.length-1)*5,'Новые сообщения пользователя'),
    row('answers','Разговор после вопросов Reflect',10,answered*5,'Последовательность сохранённых реплик'),
    row('reviews','Оценённые гипотезы',10,rated*5,'Точные связи оценок с ответами AI'),
    row('comments','Комментарии к гипотезам',10,commented*5,'Ваши сохранённые уточнения'),
    row('returns','Возвращения к теме',10,uniqueReturnIds.size*5,'Ваши записи о возвращении'),
    row('goal','Связанная цель',15,uniqueGoals.length?15:0,'Цель с явной привязкой к сеансу'),
    row('steps','Работа над целью',20,bestGoal,'Отмеченные вами шаги или завершение цели')
  ]);
  const points=rows.reduce((sum,r)=>sum+r.points,0);
  return Object.freeze({
    version:'reflect.session-work.v1',
    percent:points,points,max:100,rows,basis:'saved-owner-events'
  });
}
