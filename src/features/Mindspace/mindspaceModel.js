/**
 * PRODUCT-05B. Semantic Mindspace = relationships, NOT a chronology.
 * Projections are deterministic and read-only over existing UID-scoped
 * Sessions and Goals. No AI-generated or inferred relationship is a fact.
 */
export const MINDSPACE_VERSION = 'reflect.mindspace.v1';
export const RELATIONS = Object.freeze({
  related: 'Перекликаются',
  supports: 'Поддерживает',
  tension: 'Есть противоречие',
  value: 'Общее важное'
});
export const MINDSPACE_NODE_LIMIT = 90;
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const title = (value, fallback, max=100) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0,max) : fallback;
const time = value => {
  try {
    const v = typeof value?.toMillis === 'function' ? value.toMillis() :
      Number.isFinite(value?.seconds) ? value.seconds * 1000 :
      value instanceof Date ? value.getTime() : NaN;
    return Number.isFinite(v) && v >= 0 ? v : null;
  } catch { return null; }
};

export function buildMindspace(sessions=[],goals=[],{
  maxNodes=MINDSPACE_NODE_LIMIT,includeProposals=true
}={}) {
  const cap=Number.isInteger(maxNodes) && maxNodes > 0 ?
    Math.min(maxNodes,160) : MINDSPACE_NODE_LIMIT;
  const safeSessions=(Array.isArray(sessions)?sessions:[])
    .filter(item=>validId(item?.id))
    .slice().sort((a,b)=>a.id.localeCompare(b.id));
  const safeGoals=(Array.isArray(goals)?goals:[])
    .filter(item=>validId(item?.id))
    .slice().sort((a,b)=>a.id.localeCompare(b.id));
  const nodes=[],edges=[],used=new Set(),issues=[];
  let truncated=false;
  const addNode=value=>{
    if(used.has(value.id))return false;
    if(nodes.length>=cap){truncated=true;return false;}
    used.add(value.id);nodes.push(value);return true;
  };
  const addEdge=edge=>{
    if(!used.has(edge.from)||!used.has(edge.to)||edge.from===edge.to)return;
    if(!edges.some(existing=>existing.id===edge.id))edges.push(edge);
  };
  for(const session of safeSessions){
    addNode({
      id:`session:${session.id}`,kind:'session',refId:session.id,
      label:title(session.mindTitle || session.title,'Моя тема'),
      subtitle:'Сохранённая тема',author:'user',status:'saved',
      sourceRef:{kind:'session',sessionId:session.id},
      at:time(session.createdAt)
    });
  }
  for(const goal of safeGoals){
    addNode({
      id:`goal:${goal.id}`,kind:'goal',refId:goal.id,
      label:title(goal.text,'Цель без названия'),
      subtitle:'Цель пользователя',author:'user',
      status:goal.completed === true || goal.status === 'completed'
        ? 'completed' : goal.status === 'paused' ? 'paused' : 'active',
      sourceRef:{kind:'goal',goalId:goal.id,sessionId:validId(goal.sessionId)
        ?goal.sessionId:null},at:time(goal.createdAt)
    });
    if(validId(goal.sessionId)){
      addEdge({id:`membership:${goal.sessionId}:${goal.id}`,
        from:`session:${goal.sessionId}`,to:`goal:${goal.id}`,
        kind:'membership',relation:'contains',author:'record',
        provenance:'saved-goal.sessionId'});
    }
  }
  if(includeProposals){
    for(const session of safeSessions){
      const history=Array.isArray(session.chatHistory)?session.chatHistory:[];
      let shown=0;
      for(let i=0;i<history.length && shown<2;i++){
        const msg=history[i];
        if(msg?.role!=='assistant' || msg?.interaction?.version!=='reflect.interaction.v1')continue;
        const candidates=Array.isArray(msg.interaction.recommendationCandidates)?
          msg.interaction.recommendationCandidates:[];
        for(let c=0;c<Math.min(candidates.length,2)&&shown<2;c++){
          const candidate=candidates[c];
          if(typeof candidate?.title!=='string'||!candidate.title.trim())continue;
          const proposalId=`proposal:${session.id}:${validId(msg.id)?msg.id:'legacy-'+i}:${c}`;
          const decisionKey=validId(msg.id)?`r-${msg.id}-${c}`:null;
          const decision=decisionKey&&session.recommendationDecisions?.[decisionKey];
          const status=['accepted','saved','postponed','dismissed'].includes(decision?.status)
            ?decision.status:'proposed';
          addNode({id:proposalId,kind:'proposal',refId:proposalId,
            label:title(candidate.title,'AI-предложение',90),
            subtitle:'Идея AI, не факт',author:'ai',status,
            sourceRef:{kind:validId(msg.id)?'turn':'session',
              sessionId:session.id,...(validId(msg.id)?{turnId:msg.id}:{})},
            at:time(msg.timestamp)});
          addEdge({id:`suggestion:${proposalId}`,from:`session:${session.id}`,
            to:proposalId,kind:'suggestion',relation:'proposes',author:'ai',
            provenance:'saved-assistant-interaction'});
          shown++;
        }
      }
    }
  }
  for(const session of safeSessions){
    const links=Array.isArray(session.mindLinks)?session.mindLinks:[];
    for(const link of links){
      if(link?.status!=='confirmed'||link?.author!=='user' ||
         !['session','goal'].includes(link.targetKind) ||
         !validId(link.targetId) || !Object.hasOwn(RELATIONS,link.relation) ||
         !(typeof link.id==='string'&&/^ml-(session|goal)-[A-Za-z0-9_-]{1,128}$/.test(link.id)) || link.id!==`ml-${link.targetKind}-${link.targetId}`) {
        issues.push('unverified-link');continue;
      }
      const from=`session:${session.id}`;
      const to=`${link.targetKind}:${link.targetId}`;
      if(!used.has(from)||!used.has(to)||from===to){
        issues.push('missing-source-or-target');continue;
      }
      addEdge({id:`semantic:${session.id}:${link.id}`,
        from,to,kind:'semantic',relation:link.relation,
        relationLabel:RELATIONS[link.relation],
        note:title(link.note,'',400),author:'user',status:'confirmed',
        sourceRef:{kind:'session',sessionId:session.id},
        sourceSessionId:session.id,targetKind:link.targetKind,
        targetId:link.targetId,linkId:link.id,
        at:time(link.updatedAt||link.createdAt),
        provenance:'user-confirmed-session-transaction'});
    }
  }
  return {
    version:MINDSPACE_VERSION,nodes,edges,truncated,issues,
    confirmedLinks:edges.filter(e=>e.kind==='semantic').length,
    suggestedNodes:nodes.filter(n=>n.kind==='proposal'&&n.status==='proposed').length
  };
}

/** Stable organic constellation; no LLM or random physics is used. */
export function layoutMindspace(graph,{
  width=1200,height=850
}={}){
  const cx=width/2,cy=height/2;
  const pos=new Map();
  const sessions=graph.nodes.filter(n=>n.kind==='session');
  const goals=graph.nodes.filter(n=>n.kind==='goal');
  const suggestions=graph.nodes.filter(n=>n.kind==='proposal');
  const n=sessions.length;
  // Elliptic orbit is deliberately asymmetric like the existing Aurora
  // gradients, but deterministic across refresh and screenshot QA.
  sessions.forEach((node,i)=>{
    const angle=-Math.PI/2+(i/(Math.max(n,1)))*Math.PI*2;
    const rad=n===1?0:n===2?Math.PI/2:angle;
    const r=n===1?0:1;
    pos.set(node.id,{x:cx+Math.cos(rad)*320*r,
      y:cy+Math.sin(rad)*242*r});
  });
  if(n===2){
    sessions.forEach((node,i)=>pos.set(node.id,{
      x:cx+(i===0?-260:260),y:cy+((i%2)?50:-50)
    }));
  }
  const goalsBySession=new Map();
  goals.forEach(node=>{
    const owner=node.sourceRef?.sessionId;
    if(owner && pos.has(`session:${owner}`)){
      const bucket=goalsBySession.get(owner)||[];
      bucket.push(node);goalsBySession.set(owner,bucket);
    }
  });
  for(const [owner,bucket] of goalsBySession.entries()){
    const anchor=pos.get(`session:${owner}`);
    bucket.forEach((node,index)=>{
      const a=(index/bucket.length)*Math.PI*2-Math.PI/4;
      pos.set(node.id,{x:anchor.x+Math.cos(a)*153,
        y:anchor.y+Math.sin(a)*128});
    });
  }
  const orphans=goals.filter(node=>!pos.has(node.id));
  orphans.forEach((node,index)=>{
    const angle=Math.PI/4+(index/(Math.max(orphans.length,1)))*Math.PI*2;
    pos.set(node.id,{x:cx+Math.cos(angle)*460,y:cy+Math.sin(angle)*325});
  });
  const ideasBySession=new Map();
  suggestions.forEach(node=>{
    const owner=node.sourceRef?.sessionId;
    const group=ideasBySession.get(owner)||[];
    group.push(node);ideasBySession.set(owner,group);
  });
  for(const [owner,bucket] of ideasBySession.entries()){
    const anchor=pos.get(`session:${owner}`);
    if(!anchor)continue;
    bucket.forEach((node,index)=>{
      const a=Math.PI*.72+index*Math.PI*.42;
      pos.set(node.id,{x:anchor.x+Math.cos(a)*207,y:anchor.y+Math.sin(a)*165});
    });
  }
  // Small deterministic collision adjustment, not random jitter. Pure and
  // bounded (max 90 nodes). Keep every node reachable inside the canvas.
  const ordered=graph.nodes.filter(node=>pos.has(node.id));
  for(let iter=0;iter<28;iter++){
    for(let i=0;i<ordered.length;i++){
      const a=pos.get(ordered[i].id);
      for(let j=i+1;j<ordered.length;j++){
        const b=pos.get(ordered[j].id);
        let dx=b.x-a.x,dy=b.y-a.y;
        const dist=Math.hypot(dx,dy)||.01;
        const min=ordered[i].kind==='session'||ordered[j].kind==='session'?133:115;
        if(dist>=min)continue;
        if(dist<.1){dx=(i%2?1:-1);dy=(j%2?1:-1);}
        const amount=(min-dist)*.25;
        const nx=dx/dist*amount,ny=dy/dist*amount;
        a.x-=nx;a.y-=ny;b.x+=nx;b.y+=ny;
      }
    }
  }
  const items=ordered.map(node=>{
    const p=pos.get(node.id);
    return {...node,x:Math.min(width-86,Math.max(86,p.x)),
      y:Math.min(height-66,Math.max(66,p.y))};
  });
  const byId=new Map(items.map(item=>[item.id,item]));
  const lines=graph.edges.filter(e=>byId.has(e.from)&&byId.has(e.to))
    .map(e=>({...e,x1:byId.get(e.from).x,y1:byId.get(e.from).y,
      x2:byId.get(e.to).x,y2:byId.get(e.to).y}));
  return {width,height,nodes:items,edges:lines};
}
