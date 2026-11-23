/**
 * R10.0 — pure, read-only contract for sourced long-term evidence.
 * No Firebase reads/writes, network, provider dispatch, model classifications,
 * or implicit permission to share history. This is NOT the persistent event log.
 *
 * Each eventId must be issued by the trusted owner-scoped write path.
 * Corrections and changed reviews need NEW eventIds; legacy snapshots cannot
 * reconstruct historical changes that were previously overwritten.
 */

export const TOPIC_EVIDENCE_VERSION = 1;

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const KINDS = Object.freeze({
  'user.turn': 'owner-stated',
  'assistant.hypothesis': 'model-proposed',
  'owner.hypothesis.review': 'owner-reviewed',
  'owner.correction': 'owner-corrected',
  'owner.recommendation.decision': 'owner-decided',
  'owner.goal.observation': 'owner-observed',
  'owner.topic.return': 'owner-observed',
  'owner.diary.observation': 'owner-observed'
});
const SOURCES = new Set(['sessions', 'goals', 'diaryNotes']);
const safeId = value => typeof value === 'string' && ID.test(value);
const bytes = value => new TextEncoder().encode(value).byteLength;
const assert = (value, code = 'invalid-memory-event') => {
  if (!value) throw new Error(code);
};

/** Reject any event that crosses owner/topic scope or fabricates provenance. */
export function validateTopicEvidenceEvent(event, { ownerId, topicId }) {
  assert(safeId(ownerId) && safeId(topicId), 'invalid-memory-scope');
  assert(event && typeof event === 'object' && !Array.isArray(event));
  assert(event.schemaVersion === TOPIC_EVIDENCE_VERSION);
  assert(safeId(event.eventId) && event.ownerId === ownerId &&
    event.topicId === topicId && safeId(event.sessionId));
  assert(Object.hasOwn(KINDS, event.kind));
  const origin = event.kind === 'assistant.hypothesis' ? 'model' : 'owner';
  assert(event.origin === origin &&
    event.verification === KINDS[event.kind]);
  const source = event.source;
  assert(source && typeof source === 'object' && !Array.isArray(source) &&
    SOURCES.has(source.collection) && safeId(source.documentId) &&
    safeId(source.recordId));
  if (event.kind === 'owner.diary.observation') {
    assert(source.collection === 'diaryNotes');
  } else if (event.kind === 'owner.goal.observation') {
    assert(['sessions', 'goals'].includes(source.collection));
  } else {
    assert(source.collection === 'sessions');
  }
  // Source-provided server index must be validated before entering analytics.
  assert(Number.isSafeInteger(event.sequence) && event.sequence >= 0);
  assert(typeof event.text === 'string' && event.text.trim().length > 0 &&
    event.text === event.text.trim() && bytes(event.text) <= 1500 &&
    !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(event.text));
  assert(event.supersedes === undefined || (
    safeId(event.supersedes) && event.kind === 'owner.correction'
  ));
  return Object.freeze({
    schemaVersion: TOPIC_EVIDENCE_VERSION,
    eventId: event.eventId, ownerId, topicId,
    sessionId: event.sessionId, sequence: event.sequence,
    kind: event.kind, origin,
    verification: KINDS[event.kind], text: event.text,
    source: Object.freeze({
      collection: source.collection,
      documentId: source.documentId,
      recordId: source.recordId
    }),
    ...(event.supersedes ? { supersedes: event.supersedes } : {})
  });
}

/** Deduplicates confirmed event IDs; conflicting replays are fatal. */
export function buildTopicEvidenceTimeline({ ownerId, topicId, events = [] }) {
  assert(Array.isArray(events) && events.length <= 1000, 'invalid-memory-collection');
  const dedup = new Map();
  for (const item of events) {
    const event = validateTopicEvidenceEvent(item, { ownerId, topicId });
    const prev = dedup.get(event.eventId);
    if (prev) {
      assert(JSON.stringify(prev) === JSON.stringify(event), 'memory-replay-conflict');
    } else dedup.set(event.eventId, event);
  }
  const timeline = [...dedup.values()].sort((a, b) =>
    a.sequence - b.sequence || a.eventId.localeCompare(b.eventId));
  // A duplicate sequence from two distinct events cannot be a trusted order.
  for (let i = 1; i < timeline.length; i += 1) {
    assert(timeline[i].sequence !== timeline[i - 1].sequence,
      'memory-sequence-conflict');
  }
  const byId = new Map(timeline.map(item => [item.eventId, item]));
  for (const event of timeline) {
    if (!event.supersedes) continue;
    const original = byId.get(event.supersedes);
    assert(original && original.sequence < event.sequence,
      'memory-provenance-conflict');
  }
  return Object.freeze(timeline);
}

/** Explicit owner-recorded returns only; reading/opening is not a return. */
export function countRecordedTopicReturns(timeline) {
  assert(Array.isArray(timeline), 'invalid-memory-collection');
  return timeline.filter(event => event.kind === 'owner.topic.return').length;
}

/**
 * A local EGRESS PLAN, never the act of sending. Requires a scoped, unexpired
 * permission supplied by the caller. Cross-topic history requires its own
 * grant; no automatic blanket permissions or hidden AI sends.
 */
export function planTopicEvidenceContext({
  ownerId, topicId, events = [], permission, nowMs,
  maxItems = 10, maxBytes = 3200
}) {
  assert(safeId(ownerId) && safeId(topicId), 'invalid-memory-scope');
  if (!permission || permission.granted !== true ||
      permission.ownerId !== ownerId || permission.topicId !== topicId ||
      !Number.isSafeInteger(nowMs) ||
      !Number.isSafeInteger(permission.expiresAtMs) ||
      permission.expiresAtMs <= nowMs) {
    return { authorized: false, items: [], usedBytes: 0, omitted: 0 };
  }
  assert(Number.isInteger(maxItems) && maxItems >= 1 && maxItems <= 20 &&
    Number.isInteger(maxBytes) && maxBytes >= 256 && maxBytes <= 12000,
  'invalid-memory-budget');
  const timeline = buildTopicEvidenceTimeline({ ownerId, topicId, events });
  const rank = event => {
    if (event.kind === 'owner.correction') return 0;
    if (event.kind === 'owner.hypothesis.review') return 1;
    if (event.kind === 'owner.goal.observation') return 2;
    if (event.kind === 'owner.recommendation.decision') return 3;
    if (event.kind === 'owner.topic.return') return 4;
    if (event.kind === 'user.turn') return 5;
    return 6;
  };
  const prioritized = [...timeline].sort((a, b) =>
    rank(a) - rank(b) || b.sequence - a.sequence);
  const items = [];
  let usedBytes = 0;
  for (const event of prioritized) {
    // Account for metadata, provenance and text in byte budget.
    const size = bytes(JSON.stringify(event));
    if (items.length >= maxItems || usedBytes + size > maxBytes) continue;
    items.push(event);
    usedBytes += size;
  }
  return Object.freeze({
    authorized: true, items: Object.freeze(items),
    usedBytes, omitted: prioritized.length - items.length,
    providerContextSent: false
  });
}
