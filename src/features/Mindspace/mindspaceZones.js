/**
 * RC05.4: navigational grouping by EXPLICIT user-authored topic titles only.
 * Not a psychological inference, validated diagnosis, growth score, or
 * confirmed semantic relationship. Never submit these labels to Grok.
 */
export const MINDSPACE_ZONES = Object.freeze([
  { id: 'professional', label: 'Работа и карьера', angle: -Math.PI / 2,
    pattern: /(?:работ|карьер|профес|бизнес|клиент|фриланс|проект|приложен|разработ|код|запуск|сайт|веб|релиз|офис|учёб|учеб|обучен|навык)/i },
  { id: 'growth', label: 'Личностный рост', angle: -Math.PI / 4,
    pattern: /(?:саморазвит|личност|привыч|дисциплин|самооцен|самопозн|самоорганиз|характер|уверенност)/i },
  { id: 'decisions', label: 'Выбор и дилеммы', angle: 0,
    pattern: /(?:выбор|выбрать|решени|дилемм|сомнен|определит|вариант|стоит ли|не знаю как)/i },
  { id: 'emotions', label: 'Эмоции и состояние', angle: Math.PI / 4,
    pattern: /(?:тревог|эмоци|страх|настроен|беспокой|выгоран|чувств|переживан|грусть|стресс)/i },
  { id: 'relationships', label: 'Отношения и общение', angle: Math.PI / 2,
    pattern: /(?:отношен|семь|семьи|друз|дружб|партнер|партнёр|общен|близк|любов|ссор)/i },
  { id: 'energy', label: 'Здоровье и энергия', angle: Math.PI * 3 / 4,
    pattern: /(?:здоров|здоровь|энерг|сон|спать|трениров|питани|спорт|самочувств|устал|отдых|ресурс)/i },
  { id: 'plans', label: 'Цели и планы', angle: Math.PI,
    pattern: /(?:цел|план|задач|срок|дедлайн|результат|достиг|намерен|путь к)/i },
  { id: 'values', label: 'Смыслы и ценности', angle: -Math.PI * 3 / 4,
    pattern: /(?:смысл|ценност|приоритет|важно|значим|призван|предназнач|зачем жив)/i }
].map(({pattern, ...info})=>Object.freeze({...info, pattern})));
export const UNASSIGNED_ZONE = Object.freeze({
  id: 'unassigned', label: 'Без направления', angle: null
});

export function zoneFromTitle(value) {
  if (typeof value !== 'string' || !value.trim()) return UNASSIGNED_ZONE.id;
  // Priority is deterministic, and ambiguity stays a provisional layout —
  // no claim that a topic is actually about the category chosen.
  return MINDSPACE_ZONES.find(zone=>zone.pattern.test(value))?.id ||
    UNASSIGNED_ZONE.id;
}

export function zoneForNode(node, graph) {
  if (!node || !Array.isArray(graph?.nodes)) return UNASSIGNED_ZONE.id;
  if (node.kind !== 'session' && node.sourceRef?.sessionId) {
    const parent = graph.nodes.find(item=>item.kind === 'session' &&
      item.refId === node.sourceRef.sessionId);
    if (parent) return zoneFromTitle(parent.label);
  }
  return zoneFromTitle(node.label);
}

export function zoneCounts(graph) {
  const counts = Object.fromEntries(
    [...MINDSPACE_ZONES.map(zone=>zone.id),UNASSIGNED_ZONE.id]
      .map(id=>[id,0])
  );
  for (const node of Array.isArray(graph?.nodes)?graph.nodes:[]) {
    counts[zoneForNode(node,graph)]++;
  }
  return counts;
}

export function filterMindspaceZone(graph, zoneId = 'all') {
  if (zoneId === 'all') return graph;
  if (![...MINDSPACE_ZONES,UNASSIGNED_ZONE].some(zone=>zone.id===zoneId)) {
    return graph;
  }
  const nodes=graph.nodes.filter(node=>zoneForNode(node,graph)===zoneId);
  const ids=new Set(nodes.map(node=>node.id));
  const edges=graph.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));
  return {...graph,nodes,edges,
    confirmedLinks:edges.filter(e=>e.kind==='semantic'&&e.status==='confirmed').length,
    suggestedNodes:nodes.filter(node=>node.kind==='proposal'&&node.status==='proposed').length
  };
}
