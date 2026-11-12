/**
 * PRODUCT-04 — deterministic, read-only Journey projection.
 *
 * Input: already owner-scoped Firestore subscriptions in App.jsx.
 * Output: explicitly sourced graph nodes/edges. No AI call, persistence,
 * inferred causal links, psychiatric scoring or invented completion dates.
 */
export const JOURNEY_VERSION = 'reflect.journey.v1';
export const NODE_LIMIT = 160;
const safe = (value, fallback = '') => typeof value === 'string' && value.trim()
  ? value.trim() : fallback;
const key = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const allowedDecisionStatuses = new Set(['saved', 'postponed', 'dismissed', 'accepted']);
const timestampMs = value => {
  try {
    const t = value instanceof Date ? value.getTime()
      : typeof value?.toMillis === 'function' ? value.toMillis()
      : Number.isFinite(value?.seconds) ? value.seconds * 1000
      : typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(t) && t >= 0 ? t : null;
  } catch { return null; }
};
const shorter = (value, max = 125) => safe(value).slice(0, max);
const source = (kind, sessionId, extras = {}) => ({ kind, sessionId, ...extras });

function node(id, type, sessionId, label, extras = {}) {
  return {
    id, type, sessionId, label: shorter(label) || 'Запись без названия',
    author: 'record', status: 'stored', timestampMs: null,
    timestampSource: null, sourceRef: source('session', sessionId), ...extras
  };
}

/** Never treat an AI proposal as a user decision or real-world outcome. */
export function projectJourney(sessions = [], goals = [], { maxNodes = NODE_LIMIT } = {}) {
  const nodes = [], edges = [], ids = new Set();
  const issues = [];
  const bounded = Number.isInteger(maxNodes) && maxNodes > 0
    ? Math.min(maxNodes, 400) : NODE_LIMIT;
  let truncated = false;
  const add = value => {
    if (ids.has(value.id)) return false;
    if (nodes.length >= bounded) { truncated = true; return false; }
    ids.add(value.id); nodes.push(value); return true;
  };
  const connect = (from, to, relation, provenance = 'stored-document') => {
    if (from === to || !ids.has(from) || !ids.has(to)) return;
    const id = `${from}>${relation}>${to}`;
    if (edges.some(edge => edge.id === id)) return;
    edges.push({ id, from, to, relation, provenance });
  };
  const ownerSessions = Array.isArray(sessions) ? sessions
    .filter(item => item && key(item.id)).slice().sort((a,b) => a.id.localeCompare(b.id)) : [];
  const ownerGoals = Array.isArray(goals) ? goals.filter(item => item && key(item.id)) : [];
  for (const session of ownerSessions) {
    const sessionId = session.id;
    const sid = `session:${sessionId}`;
    const messages = Array.isArray(session.chatHistory) ? session.chatHistory : [];
    add(node(sid, 'session', sessionId, safe(session.title, 'Сохранённый сеанс'), {
      status: 'stored', author: 'record',
      timestampMs: timestampMs(session.createdAt), timestampSource: 'saved',
      sourceRef: source('session', sessionId)
    }));
    const assistantById = new Map();
    let lastUserNodeId = null;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || !['user', 'assistant'].includes(msg.role)) continue;
      const realId = key(msg.id) ? msg.id : null;
      const id = `turn:${sessionId}:${realId || 'legacy-'+i}`;
      const author = msg.role === 'user' ? 'user' : 'ai';
      const label = shorter(msg.content, 100);
      if (!label) continue;
      const exists = add(node(id, 'turn', sessionId, label, {
        author, status: author === 'user' ? 'authored' : 'ai-response',
        timestampMs: timestampMs(msg.timestamp), timestampSource: 'saved',
        sourceRef: source(realId ? 'turn' : 'session', sessionId,
          realId ? { turnId: realId } : {}),
        messageId: realId, turnIndex: i
      }));
      if (!exists) continue;
      connect(sid, id, 'contains-turn');
      if (author === 'user') {
        lastUserNodeId = id;
      } else {
        if (lastUserNodeId) connect(lastUserNodeId, id, 'response-to',
          'adjacent-saved-conversation');
        if (realId) assistantById.set(realId, { nodeId:id, msg });
        const candidates = Array.isArray(msg.interaction?.recommendationCandidates)
          ? msg.interaction.recommendationCandidates : [];
        if (msg.interaction?.version !== 'reflect.interaction.v1') continue;
        for (let c = 0; c < Math.min(candidates.length, 2); c++) {
          const candidate = candidates[c];
          if (!safe(candidate?.title)) continue;
          const proposalId = `proposal:${sessionId}:${realId || 'legacy-'+i}:${c}`;
          const decisionKey = realId ? `r-${realId}-${c}` : null;
          const decision = decisionKey && session.recommendationDecisions?.[decisionKey];
          const status = allowedDecisionStatuses.has(decision?.status)
            ? decision.status : 'proposed';
          add(node(proposalId, 'proposal', sessionId, candidate.title, {
            author: 'ai', status, rationale: shorter(candidate.rationale, 300),
            timestampMs: timestampMs(msg.timestamp), timestampSource:'saved',
            sourceRef: source(realId ? 'turn' : 'session', sessionId,
              realId ? { turnId:realId } : {}),
            recommendationKey: decisionKey
          }));
          connect(id, proposalId, 'suggests', 'saved-ai-candidate');
        }
      }
    }
    const decisions = session.recommendationDecisions;
    const decisionMap = new Map();
    if (decisions && typeof decisions === 'object' && !Array.isArray(decisions)) {
      for (const [decisionKey, value] of Object.entries(decisions).sort()) {
        if (!value || !allowedDecisionStatuses.has(value.status) ||
            !key(value.assistantMessageId) ||
            !Number.isInteger(value.candidateIndex) || value.candidateIndex < 0 ||
            value.candidateIndex > 1 ||
            `r-${value.assistantMessageId}-${value.candidateIndex}` !== decisionKey ||
            !assistantById.has(value.assistantMessageId)) {
          issues.push('unlinked-decision'); continue;
        }
        const assistant = assistantById.get(value.assistantMessageId);
        const candidate = assistant.msg?.interaction?.recommendationCandidates
          ?.[value.candidateIndex];
        if (!candidate || safe(candidate.title) !== safe(value.title)) {
          issues.push('stale-decision'); continue;
        }
        const did = `decision:${sessionId}:${decisionKey}`;
        const inserted = add(node(did, 'decision', sessionId, candidate.title, {
          author:'user', status:value.status,
          timestampMs:timestampMs(value.decidedAt),
          timestampSource:'server',
          sourceRef:source('turn',sessionId,{turnId:value.assistantMessageId}),
          recommendationKey:decisionKey, goalId:key(value.goalId)?value.goalId:null
        }));
        const pid = `proposal:${sessionId}:${value.assistantMessageId}:${value.candidateIndex}`;
        if (inserted) {
          connect(pid,did,'user-decided','confirmed-session-transaction');
          decisionMap.set(decisionKey,{id:did,decision:value});
        }
      }
    }
    const linkedGoals = ownerGoals.filter(goal => goal.sessionId === sessionId)
      .sort((a,b)=>a.id.localeCompare(b.id));
    for (const goal of linkedGoals) {
      const gid = `goal:${sessionId}:${goal.id}`;
      const status = goal.status === 'completed' || goal.completed === true
        ? 'completed' : goal.status === 'paused' ? 'paused' : 'active';
      const added = add(node(gid,'goal',sessionId,safe(goal.text,'Цель без названия'),{
        author:'user',status,
        timestampMs:timestampMs(goal.createdAt),timestampSource:'server',
        sourceRef:source('goal',sessionId,{goalId:goal.id}),goalId:goal.id,
        successCriteria:shorter(goal.successCriteria,200)
      }));
      if (!added) continue;
      const link = typeof goal.sourceRecommendationKey === 'string'
        ? decisionMap.get(goal.sourceRecommendationKey) : null;
      if (link && link.decision.status === 'accepted' &&
          link.decision.goalId === goal.id &&
          goal.sourceAssistantMessageId === link.decision.assistantMessageId) {
        connect(link.id,gid,'accepted-as-goal','confirmed-atomic-decision');
      } else {
        // Membership is explicit; no invented provenance to an AI proposal.
        connect(sid,gid,'contains-goal');
      }
      const items = Array.isArray(goal.subItems) ? goal.subItems.slice(0,80) : [];
      for (let index=0;index<items.length;index++) {
        const item=items[index];
        if (!item || !safe(item.text)) continue;
        const stable = key(item.id) ? item.id : `legacy-${index}`;
        const stepId = `step:${sessionId}:${goal.id}:${stable}`;
        add(node(stepId,'step',sessionId,item.text,{
          author:'user',status:item.completed===true?'completed':'active',
          // Legacy steps lack completion time. Never assign goal.createdAt
          // as the date of the step's completion.
          timestampMs:timestampMs(item.completedAt ?? item.createdAt),
          timestampSource:item.completedAt?'explicit-completion':item.createdAt?'saved':null,
          sourceRef:source('goal',sessionId,{goalId:goal.id,stepId:stable}),
          goalId:goal.id
        }));
        connect(gid,stepId,'has-step','saved-goal-subitems');
      }
    }
    const visits = Array.isArray(session.returnCheckIns)
      ? session.returnCheckIns.slice(0,80) : [];
    for(let i=0;i<visits.length;i++){
      const visit=visits[i];
      if(visit?.author!=='user'||visit?.type!=='return-check-in'||!safe(visit.text))continue;
      const stable=key(visit.id)?visit.id:`legacy-${i}`;
      const vid=`return:${sessionId}:${stable}`;
      add(node(vid,'return',sessionId,visit.text,{
        author:'user',status:'authored',
        timestampMs:timestampMs(visit.recordedAtClient),
        timestampSource:'client-device',
        sourceRef:source('session',sessionId)
      }));
      connect(sid,vid,'contains-return','user-confirmed-return');
    }
  }
  // Legacy unlinked Goals remain accessible, but aren't silently attached
  // to an unrelated session, recommendation, or owner identity.
  nodes.sort((a,b)=>a.sessionId.localeCompare(b.sessionId) ||
    (a.timestampMs??Number.MAX_SAFE_INTEGER)-(b.timestampMs??Number.MAX_SAFE_INTEGER) ||
    a.id.localeCompare(b.id));
  return Object.freeze({
    version:JOURNEY_VERSION, nodes, edges,
    truncated, issues:Object.freeze(issues)
  });
}

const DAY=24*60*60*1000;
export function filterJourney(graph, {
  sessionId='all', period='all', kind='all', status='all', nowMs=Date.now()
}={}) {
  const periodDays=period==='7d'?7:period==='30d'?30:null;
  const groups={
    dialogue:['turn'], decisions:['proposal','decision'],
    actions:['goal','step'], returns:['return']
  };
  const wantedKind=groups[kind];
  let chosen=graph.nodes.filter(n=>n.type!=='session' &&
    (sessionId==='all'||n.sessionId===sessionId) &&
    (!wantedKind||wantedKind.includes(n.type)) &&
    (status==='all' ||
      (status==='confirmed' && ['authored','saved','accepted','completed'].includes(n.status)) ||
      (status==='open' && ['active','paused','postponed'].includes(n.status)) ||
      (status==='proposed' && n.status==='proposed') ||
      (status==='dismissed' && n.status==='dismissed')) &&
    (!periodDays || (n.timestampMs !== null &&
      n.timestampMs <= nowMs && n.timestampMs >= nowMs-periodDays*DAY))
  );
  const sessionIds=new Set(chosen.map(n=>n.sessionId));
  if(kind==='all'&&status==='all'&&period==='all') {
    for(const n of graph.nodes) {
      if(n.type==='session'&&(sessionId==='all'||n.sessionId===sessionId)){
        sessionIds.add(n.sessionId);
      }
    }
  }
  const ids=new Set(chosen.map(n=>n.id));
  const roots=graph.nodes.filter(n=>n.type==='session'&&sessionIds.has(n.sessionId));
  chosen=[...roots,...chosen];
  roots.forEach(n=>ids.add(n.id));
  const edges=graph.edges.filter(edge=>ids.has(edge.from)&&ids.has(edge.to));
  return { ...graph, nodes:chosen, edges };
}

export function journeyFacts(graph, period='all') {
  const nodes=graph.nodes.filter(n=>n.type!=='session');
  const decisions=nodes.filter(n=>n.type==='decision'&&n.status==='accepted');
  const visits=nodes.filter(n=>n.type==='return'&&n.status==='authored');
  const steps=nodes.filter(n=>n.type==='step');
  // No denominator or completed-date claim when the selected period omits
  // undated legacy steps.
  return {
    acceptedDecisions:decisions.length, returns:visits.length,
    stepProgress:period==='all'&&steps.length
      ? {done:steps.filter(n=>n.status==='completed').length,total:steps.length}
      : null,
    datedEvents:nodes.filter(n=>n.timestampMs!==null).length
  };
}

export function layoutJourney(graph) {
  const column={
    session:0,turn:1,proposal:3,decision:4,goal:5,step:6,return:7
  };
  const sessions=[...new Set(graph.nodes.map(n=>n.sessionId))].sort();
  const placements=new Map();
  let top=40;
  for(const sessionId of sessions){
    const group=graph.nodes.filter(n=>n.sessionId===sessionId);
    const cols=new Map();
    for(const item of group){
      const c=item.type==='turn'&&item.author==='ai'?2:
        column[item.type]??0;
      // AI response shares visual column with candidate but stays distinct
      // in the same deterministic ordered bucket.
      const bucket=cols.get(c)||[];
      bucket.push(item); cols.set(c,bucket);
    }
    for(const bucket of cols.values()) bucket.sort((a,b)=>
      (a.timestampMs??Number.MAX_SAFE_INTEGER)-(b.timestampMs??Number.MAX_SAFE_INTEGER)||
      a.id.localeCompare(b.id));
    const height=Math.max(1,...[...cols.values()].map(items=>items.length))*104+58;
    for(const [col,bucket] of cols.entries()){
      bucket.forEach((item,index)=>{
        placements.set(item.id,{
          x:34+col*244,
          y:top+index*104+24,
          width:208,height:76
        });
      });
    }
    top+=height+30;
  }
  const laidNodes=graph.nodes.filter(n=>placements.has(n.id))
    .map(n=>({...n,...placements.get(n.id)}));
  const byId=new Map(laidNodes.map(n=>[n.id,n]));
  const laidEdges=graph.edges.filter(e=>byId.has(e.from)&&byId.has(e.to)).map(e=>{
    const a=byId.get(e.from),b=byId.get(e.to);
    const x1=a.x+a.width,y1=a.y+a.height/2;
    const x2=b.x,y2=b.y+b.height/2;
    return {...e,x1,y1,x2,y2};
  });
  return {nodes:laidNodes,edges:laidEdges,width:2030,height:Math.max(top+30,235)};
}

export const journeyDate = ms => ms === null ? 'Дата не сохранена' :
  new Intl.DateTimeFormat('ru-RU',{
    day:'numeric',month:'short',year:'numeric'
  }).format(new Date(ms));
