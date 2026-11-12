/**
 * PRODUCT-04: a deterministic, read-only projection of owner-scoped records.
 * No model calls, inferred psychological states, network calls or writes.
 * The graph is NOT a database. Every edge has explicit local provenance.
 */
export function timestampMs(value) {
  try {
    const date = value instanceof Date ? value
      : typeof value?.toDate === 'function' ? value.toDate()
        : typeof value === 'string' ? new Date(value)
          : Number.isFinite(value?.seconds) ? new Date(value.seconds * 1000) : null;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  } catch { return null; }
}

const validText = value => typeof value === 'string' && value.trim().length > 0;
const preview = (value, limit = 125) => {
  if (!validText(value)) return '';
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
};
const decisionTypes = new Set(['saved', 'accepted', 'postponed', 'dismissed']);
const decisionLabels = {
  saved: 'Идея сохранена', accepted: 'Рекомендация принята',
  postponed: 'Рекомендация отложена', dismissed: 'Рекомендация отклонена'
};

export function buildJourneyGraph(session, goals = []) {
  if (!session || typeof session.id !== 'string' || !session.id) {
    return { nodes: [], edges: [], metrics: { confirmedDecisions: 0, returns: 0, completedSteps: 0, totalSteps: 0 } };
  }
  const nodes = [];
  const edges = [];
  const byId = new Map();
  const addNode = item => {
    if (byId.has(item.id)) return false;
    const node = { ...item, timeMs: timestampMs(item.timestamp), index: nodes.length };
    nodes.push(node);
    byId.set(node.id, node);
    return true;
  };
  const addEdge = (from, to, relation, source) => {
    if (!byId.has(from) || !byId.has(to)) return;
    edges.push({ id: from + '>' + to, from, to, relation, source });
  };
  const root = 'session:' + session.id;
  addNode({
    id: root, kind: 'session', lane: 0, author: 'user', status: 'saved',
    label: validText(session.title) ? preview(session.title) : 'Сохранённый сеанс',
    timestamp: session.createdAt,
    sourceRef: { kind: 'session', sessionId: session.id }
  });

  let previousTurn = null;
  const proposals = new Map();
  const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
  history.forEach((message, index) => {
    if (!message || !['user', 'assistant'].includes(message.role) ||
        !validText(message.content)) return;
    const turnId = 'turn:' + session.id + ':' + index;
    addNode({
      id: turnId, kind: message.role === 'user' ? 'user-turn' : 'ai-reply',
      lane: message.role === 'user' ? 1 : 2,
      author: message.role === 'user' ? 'user' : 'ai',
      status: message.role === 'user' ? 'authored' : 'generated',
      label: preview(message.content),
      timestamp: message.timestamp,
      sourceRef: {
        kind: 'turn', sessionId: session.id, messageIndex: index,
        messageId: typeof message.id === 'string' ? message.id : null
      }
    });
    addEdge(previousTurn || root, turnId,
      previousTurn ? 'next-saved-turn' : 'contains-turn',
      'saved chatHistory order');
    previousTurn = turnId;
    if (message.role !== 'assistant' ||
        message.interaction?.version !== 'reflect.interaction.v1' ||
        !Array.isArray(message.interaction.recommendationCandidates) ||
        typeof message.id !== 'string') return;

    message.interaction.recommendationCandidates.slice(0, 3).forEach((candidate, i) => {
      if (!validText(candidate?.title) || !validText(candidate?.rationale)) return;
      const recommendationKey = 'r-' + message.id + '-' + i;
      const proposalId = 'proposal:' + session.id + ':' + index + ':' + i;
      addNode({
        id: proposalId, kind: 'proposal', lane: 3, author: 'ai', status: 'proposed',
        label: preview(candidate.title), explanation: candidate.rationale,
        timestamp: message.timestamp,
        sourceRef: { kind: 'turn', sessionId: session.id, messageIndex: index,
          messageId: message.id },
        recommendationKey
      });
      addEdge(turnId, proposalId, 'suggested-by', 'saved assistant interaction v1');
      proposals.set(recommendationKey, {
        proposalId, assistantId: message.id, candidateIndex: i,
        title: candidate.title
      });
    });
  });

  const acceptedDecisions = new Map();
  const decisions = session.recommendationDecisions;
  if (decisions && typeof decisions === 'object' && !Array.isArray(decisions)) {
    Object.entries(decisions).forEach(([key, decision]) => {
      const origin = proposals.get(key);
      if (!origin || !decisionTypes.has(decision?.status) ||
          decision.assistantMessageId !== origin.assistantId ||
          decision.candidateIndex !== origin.candidateIndex ||
          decision.title !== origin.title) return;
      const decisionId = 'decision:' + session.id + ':' + key;
      addNode({
        id: decisionId, kind: 'decision', lane: 4, author: 'user',
        status: decision.status, label: decisionLabels[decision.status] + ': ' +
          preview(decision.title, 80),
        timestamp: decision.decidedAt,
        sourceRef: { kind: 'decision', sessionId: session.id, recommendationKey: key,
          messageId: origin.assistantId },
        goalId: typeof decision.goalId === 'string' ? decision.goalId : null
      });
      addEdge(origin.proposalId, decisionId, 'explicit-decision',
        'saved recommendationDecisions record');
      if (decision.status === 'accepted') acceptedDecisions.set(key, decisionId);
    });
  }

  let totalSteps = 0;
  let completedSteps = 0;
  (Array.isArray(goals) ? goals : []).forEach(goal => {
    if (!goal || goal.sessionId !== session.id || !validText(goal.id) ||
        !validText(goal.text)) return;
    const goalId = 'goal:' + session.id + ':' + goal.id;
    const complete = goal.completed === true ||
      (goal.status === 'completed' && goal.completed !== false);
    addNode({
      id: goalId, kind: 'goal', lane: 5, author: 'user',
      status: complete ? 'completed' : goal.status === 'paused' ? 'paused' : 'active',
      label: preview(goal.text), timestamp: goal.createdAt,
      sourceRef: { kind: 'goal', goalId: goal.id, sessionId: session.id },
      goalId: goal.id,
      explanation: validText(goal.successCriteria)
        ? 'Критерий: ' + preview(goal.successCriteria, 200) : ''
    });
    const linkedDecision = typeof goal.sourceRecommendationKey === 'string' &&
      acceptedDecisions.get(goal.sourceRecommendationKey);
    addEdge(linkedDecision || root, goalId,
      linkedDecision ? 'confirmed-goal-from-decision' : 'linked-to-session',
      linkedDecision ? 'matching accepted decision + saved goal' : 'saved goal.sessionId');
    (Array.isArray(goal.subItems) ? goal.subItems : []).forEach((step, index) => {
      if (!validText(step?.text)) return;
      totalSteps++;
      const done = step.completed === true;
      if (done) completedSteps++;
      const stepId = 'step:' + session.id + ':' + goal.id + ':' + index;
      addNode({
        id: stepId, kind: 'step', lane: 6, author: 'user',
        status: done ? 'completed' : 'pending',
        label: preview(step.text), timestamp: step.completedAt || null,
        sourceRef: { kind: 'goal', goalId: goal.id, sessionId: session.id,
          stepIndex: index },
        goalId: goal.id
      });
      addEdge(goalId, stepId, 'goal-step', 'saved goal.subItems');
    });
    (Array.isArray(goal.reflections) ? goal.reflections : []).forEach((entry, index) => {
      if (!validText(entry?.text)) return;
      const reflectionId = 'reflection:' + session.id + ':' + goal.id + ':' + index;
      addNode({
        id: reflectionId, kind: 'reflection', lane: 6, author: 'user',
        status: 'authored', label: preview(entry.text), timestamp: entry.createdAt,
        sourceRef: { kind: 'goal', goalId: goal.id, sessionId: session.id },
        goalId: goal.id
      });
      addEdge(goalId, reflectionId, 'goal-reflection', 'saved goal.reflections');
    });
    // A completion event has a defensible date ONLY if completedAt was saved.
    if (complete && timestampMs(goal.completedAt) !== null) {
      const completeId = 'completion:' + session.id + ':' + goal.id;
      addNode({
        id: completeId, kind: 'completion', lane: 7, author: 'user',
        status: 'completed', label: 'Цель завершена: ' + preview(goal.text, 95),
        timestamp: goal.completedAt,
        sourceRef: { kind: 'goal', goalId: goal.id, sessionId: session.id },
        goalId: goal.id
      });
      addEdge(goalId, completeId, 'user-confirmed-completion',
        'saved goal.completed + goal.completedAt');
    }
  });

  let returns = 0;
  let previousReturn = null;
  (Array.isArray(session.returnCheckIns) ? session.returnCheckIns : []).forEach((entry, index) => {
    if (!entry || entry.author !== 'user' ||
        entry.type !== 'return-check-in' || !validText(entry.text)) return;
    returns++;
    const returnId = 'return:' + session.id + ':' + index;
    addNode({
      id: returnId, kind: 'return', lane: 7, author: 'user',
      status: 'authored', label: preview(entry.text),
      timestamp: entry.recordedAtClient,
      sourceRef: { kind: 'return', sessionId: session.id, returnIndex: index,
        returnId: typeof entry.id === 'string' ? entry.id : null }
    });
    addEdge(root, returnId, 'return-to-topic', 'saved session.returnCheckIns');
    if (previousReturn) addEdge(previousReturn, returnId, 'next-recorded-return',
      'saved returnCheckIns order');
    previousReturn = returnId;
  });
  return {
    nodes, edges,
    metrics: { confirmedDecisions: acceptedDecisions.size, returns, completedSteps, totalSteps }
  };
}

const visibleKind = {
  all: () => true,
  own: node => node.author === 'user',
  ai: node => node.author === 'ai',
  decisions: node => node.kind === 'decision',
  goals: node => ['goal', 'step', 'completion', 'reflection'].includes(node.kind),
  returns: node => node.kind === 'return'
};

export function filterJourneyGraph(graph, {
  kind = 'all', period = 'all', goalId = 'all', nowMs = Date.now()
} = {}) {
  const allow = visibleKind[kind] || visibleKind.all;
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : null;
  const cutoff = periodDays === null ? null : nowMs - periodDays * 86400000;
  let related = null;
  if (goalId !== 'all') {
    related = new Set(graph.nodes.filter(node =>
      node.goalId === goalId).map(node => node.id));
    // Bring back ONLY saved ancestors of a matching goal, never all session
    // messages or unrelated return visits.
    const queue = [...related];
    while (queue.length) {
      const next = queue.pop();
      graph.edges.forEach(edge => {
        if (edge.to === next && !related.has(edge.from)) {
          related.add(edge.from); queue.push(edge.from);
        }
      });
    }
  }
  const nodes = graph.nodes.filter(node => {
    if (related && !related.has(node.id)) return false;
    if (node.kind === 'session') return true;
    if (!allow(node)) return false;
    // Unknown timestamps are not silently placed inside a period.
    if (cutoff !== null && (node.timeMs === null ||
        node.timeMs < cutoff || node.timeMs > nowMs)) return false;
    return true;
  });
  const ids = new Set(nodes.map(node => node.id));
  return {
    nodes,
    edges: graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)),
    metrics: graph.metrics
  };
}

/** Stable visual order: known timestamps first, source index breaks ties. */
export function layoutJourneyNodes(nodes, zoom = 1) {
  const scale = [0.75, 1, 1.25].includes(zoom) ? zoom : 1;
  const sorted = [...nodes].sort((a, b) =>
    (a.kind === 'session' ? -1 : b.kind === 'session' ? 1 : 0) ||
    (a.timeMs === null ? 1 : b.timeMs === null ? -1 : a.timeMs - b.timeMs) ||
    a.index - b.index);
  const positioned = sorted.map((node, row) => ({
    ...node, x: (24 + node.lane * 232) * scale,
    y: (24 + row * 110) * scale,
    width: 202 * scale, height: 83 * scale
  }));
  return {
    nodes: positioned,
    width: Math.max(500, (24 + 8 * 232) * scale),
    height: Math.max(210, (60 + positioned.length * 110) * scale)
  };
}
