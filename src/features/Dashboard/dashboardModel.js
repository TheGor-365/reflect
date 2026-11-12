/**
 * PRODUCT-05 / Dashboard: explicit owner-scoped facts from existing documents.
 * No new collections, LLM inference, fabricated success score or persistence.
 */
import { projectJourney } from '../SessionSchema/journeyModel';

const DAY_MS=86400000;
const idOk=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const clean=(value,max=240)=>typeof value==='string'?value.trim().slice(0,max):'';
const timeMs=value=>{
  try {
    const time=value instanceof Date?value.getTime():
      typeof value?.toMillis==='function'?value.toMillis():
      Number.isFinite(value?.seconds)?value.seconds*1000:
      typeof value==='string'?Date.parse(value):NaN;
    return Number.isFinite(time)&&time>=0?time:null;
  }catch{return null;}
};
const utcKey=value=>new Date(value).toISOString().slice(0,10);
const goalStatus=goal=>['active','paused','completed'].includes(goal.status)
  ?goal.status:goal.completed===true?'completed':'active';
const validDueDay=day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(day+'T12:00:00Z')) &&
  new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;

export function buildDashboardSnapshot({
  sessions=[],goals=[],diaryNotes=[],days=7,nowMs=Date.now()
}={}){
  const windowDays=days===30?30:7;
  const now=Number.isFinite(nowMs)&&nowMs>=0?nowMs:Date.now();
  const end=Date.parse(utcKey(now)+'T00:00:00Z')+DAY_MS;
  const start=end-windowDays*DAY_MS;
  const source=projectJourney(sessions,goals,{maxNodes:400});
  const sessionById=new Map((Array.isArray(sessions)?sessions:[])
    .filter(s=>idOk(s?.id)).map(s=>[s.id,s]));
  const dated=[],recentReturns=[];
  const counts=Array.from({length:windowDays},(_,index)=>({
    day:utcKey(start+index*DAY_MS),decisions:0,returns:0,notes:0,total:0
  }));
  const dayByKey=new Map(counts.map(item=>[item.day,item]));
  const addEvent=(kind,at,sourceRef)=>{
    if(at===null||at<start||at>=end||at>now)return;
    const bucket=dayByKey.get(utcKey(at));
    if(!bucket)return;
    bucket[kind]+=1;bucket.total+=1;
    dated.push({kind,at,sourceRef});
  };
  for(const node of source.nodes){
    if(node.type==='decision'&&node.status==='accepted'){
      addEvent('decisions',node.timestampMs,node.sourceRef);
    }
    if(node.type==='return'&&node.status==='authored'){
      addEvent('returns',node.timestampMs,node.sourceRef);
      recentReturns.push({
        id:node.id, text:node.label, at:node.timestampMs,
        timestampSource:node.timestampSource,
        sessionId:node.sessionId,
        sessionTitle:clean(sessionById.get(node.sessionId)?.title,120)||
          'Сохранённый сеанс'
      });
    }
  }
  const authoredNotes=[];
  for(const doc of Array.isArray(diaryNotes)?diaryNotes:[]){
    if(!idOk(doc?.id))continue;
    const entries=Array.isArray(doc.entries)?doc.entries:[];
    for(let index=0;index<entries.length;index++){
      const entry=entries[index];
      const text=clean(entry?.text,1000);
      if(!text)continue;
      const at=timeMs(entry?.createdAt);
      const note={
        id:`note:${doc.id}:${index}`, recordId:doc.id,
        entryIndex:index, title:clean(doc.title,130)||'Запись дневника',
        text,at, sourceRef:{kind:'diaryNote',recordId:doc.id,entryIndex:index}
      };
      authoredNotes.push(note);
      addEvent('notes',at,note.sourceRef);
    }
  }
  const activeGoals=(Array.isArray(goals)?goals:[])
    .filter(goal=>idOk(goal?.id)&&goalStatus(goal)!=='completed')
    .map(goal=>{
      const steps=Array.isArray(goal.subItems)?goal.subItems.filter(item=>
        item&&typeof item.text==='string'&&item.text.trim()):[];
      const complete=steps.filter(step=>step.completed===true).length;
      const next=steps.find(step=>step.completed!==true);
      const due=validDueDay(goal.dueDay)?goal.dueDay:null;
      return {
        id:goal.id, sessionId:idOk(goal.sessionId)?goal.sessionId:null,
        title:clean(goal.text,240)||'Цель без названия',
        purpose:clean(goal.purpose,500),status:goalStatus(goal),dueDay:due,
        nextStep:next?clean(next.text,240):null,
        stepsDone:complete,stepsTotal:steps.length,
        sourceRef:{kind:'goal',goalId:goal.id},
        createdAt:timeMs(goal.createdAt)
      };
    })
    .sort((a,b)=>{
      if(a.status!==b.status)return a.status==='active'?-1:1;
      if(a.dueDay!==b.dueDay)return (a.dueDay||'9999-99-99').localeCompare(b.dueDay||'9999-99-99');
      return (a.createdAt??Number.MAX_SAFE_INTEGER)-(b.createdAt??Number.MAX_SAFE_INTEGER)||
        a.id.localeCompare(b.id);
    });
  recentReturns.sort((a,b)=>(b.at??-1)-(a.at??-1)||a.id.localeCompare(b.id));
  authoredNotes.sort((a,b)=>(b.at??-1)-(a.at??-1)||a.id.localeCompare(b.id));
  const stepProgress=activeGoals.reduce((acc,g)=>({
    done:acc.done+g.stepsDone,total:acc.total+g.stepsTotal
  }),{done:0,total:0});
  // Include completed goals in the all-time snapshot. These are current
  // confirmed booleans, NOT a claim about completion in a selected week.
  const completedGoalSteps=(Array.isArray(goals)?goals:[])
    .filter(goal=>idOk(goal?.id)&&goalStatus(goal)==='completed')
    .flatMap(goal=>Array.isArray(goal.subItems)?goal.subItems:[]);
  stepProgress.done+=completedGoalSteps.filter(step=>step?.completed===true).length;
  stepProgress.total+=completedGoalSteps.filter(step=>step&&typeof step.text==='string').length;
  return {
    version:'reflect.dashboard.v1',days:windowDays,
    start,end,activity:counts,
    eventCounts:{
      acceptedDecisions:dated.filter(e=>e.kind==='decisions').length,
      returns:dated.filter(e=>e.kind==='returns').length,
      diaryEntries:dated.filter(e=>e.kind==='notes').length,
      total:dated.length
    },
    activeGoals,stepProgress:stepProgress.total?stepProgress:null,
    recentReturns:recentReturns.slice(0,4),
    recentNotes:authoredNotes.slice(0,4),
    sourceTruncated:source.truncated
  };
}
