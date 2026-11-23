/**
 * R10.2-A — deterministic, read-only topic projection from committed R10.1 events.
 *
 * Only explicit owner reviews, corrections, recommendation decisions and
 * return check-ins are projected. This module does not infer psychological
 * facts, merge unrelated sessions, write Firestore or dispatch to an AI.
 *
 * A persisted projection is a cache, not a replacement for the immutable
 * event ledger. Caller must obtain a trusted, owner-scoped checkpoint and
 * contiguous subsequent events; never use arbitrary client-provided memory
 * as verified evidence or as provider context.
 */
import { validateTopicEvidenceEvent } from './topicEvidenceContract.js';

export const TOPIC_MEMORY_PROJECTION_VERSION = 1;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const STATUSES = new Set(['saved', 'postponed', 'dismissed', 'accepted']);
const MAX_KEYS = 256;
const RECENT_RETURNS = 6;
const MAX_BATCH_EVENTS = 1000;
const encoder = new TextEncoder();
const bytes = value => encoder.encode(value).byteLength;
const okId = value => typeof value === 'string' && ID.test(value);
const fail = (value, code) => {
  if (!value) throw new Error(code);
};
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const sourceRef = item => ({
  eventId: item.eventId,
  sessionId: item.sessionId,
  source: { ...item.source }
});
const isText = (text, limit) => typeof text === 'string' &&
  text.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);

export function emptyTopicMemoryProjection({ ownerId, topicId }) {
  fail(okId(ownerId) && okId(topicId), 'memory-projection-invalid-scope');
  return {
    projectionVersion: TOPIC_MEMORY_PROJECTION_VERSION,
    ownerId, topicId, topicScope: null,
    lastProcessedSequence: 0, lastEventId: null, lastEventFingerprint: null,
    counts: {
      processed: 0, reviews: 0, corrections: 0,
      decisions: 0, explicitReturns: 0
    },
    hypothesisReviews: {}, recommendations: {}, recentReturns: []
  };
}

function checkProjection(snapshot, ownerId, topicId) {
  fail(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) &&
    snapshot.projectionVersion === TOPIC_MEMORY_PROJECTION_VERSION &&
    snapshot.ownerId === ownerId && snapshot.topicId === topicId &&
    validCount(snapshot.lastProcessedSequence) &&
    snapshot.lastProcessedSequence <= 1000000 &&
    (snapshot.topicScope === null ||
      ['explicit', 'session-provisional'].includes(snapshot.topicScope)) &&
    (snapshot.lastProcessedSequence === 0 ?
      snapshot.lastEventId === null && snapshot.lastEventFingerprint === null :
      okId(snapshot.lastEventId) &&
      typeof snapshot.lastEventFingerprint === 'string' &&
      snapshot.lastEventFingerprint.length > 0) &&
    snapshot.counts && typeof snapshot.counts === 'object' &&
    ['processed', 'reviews', 'corrections', 'decisions', 'explicitReturns']
      .every(key => validCount(snapshot.counts[key])) &&
    snapshot.counts.processed === snapshot.lastProcessedSequence &&
    snapshot.counts.processed === snapshot.counts.reviews +
      snapshot.counts.corrections + snapshot.counts.decisions +
      snapshot.counts.explicitReturns &&
    (snapshot.lastProcessedSequence === 0) === (snapshot.topicScope === null) &&
    snapshot.hypothesisReviews &&
    typeof snapshot.hypothesisReviews === 'object' &&
    !Array.isArray(snapshot.hypothesisReviews) &&
    snapshot.recommendations && typeof snapshot.recommendations === 'object' &&
    !Array.isArray(snapshot.recommendations) &&
    Array.isArray(snapshot.recentReturns) &&
    snapshot.recentReturns.length <= RECENT_RETURNS &&
    Object.keys(snapshot.hypothesisReviews).length <= MAX_KEYS &&
    Object.keys(snapshot.recommendations).length <= MAX_KEYS,
  'memory-projection-invalid-checkpoint');
  // This is structural validation, not cryptographic source attestation.
  for (const item of [
    ...Object.values(snapshot.hypothesisReviews),
    ...Object.values(snapshot.recommendations),
    ...snapshot.recentReturns
  ]) {
    fail(item && typeof item === 'object' && okId(item.eventId) &&
      okId(item.sessionId) && item.source &&
      item.source.collection === 'sessions' &&
      item.source.documentId === item.sessionId &&
      okId(item.source.recordId) &&
      Number.isSafeInteger(item.sequence) && item.sequence > 0 &&
      item.sequence <= snapshot.lastProcessedSequence,
    'memory-projection-invalid-checkpoint');
  }
}

function validateOwnerPayload(event) {
  const payload = event.payload;
  fail(payload && typeof payload === 'object' && !Array.isArray(payload) &&
    event.source.collection === 'sessions' &&
    event.source.documentId === event.sessionId &&
    ['explicit', 'session-provisional'].includes(event.topicScope) &&
    (event.topicScope !== 'session-provisional' || event.topicId === event.sessionId),
  'memory-projection-invalid-event');

  if (event.kind === 'owner.hypothesis.review' ||
      event.kind === 'owner.correction') {
    fail(Number.isInteger(payload.grade) && payload.grade >= 0 &&
      payload.grade <= 4 && isText(payload.comment, 500) &&
      okId(payload.assistantMessageId) &&
      Number.isInteger(payload.hypothesisIndex) &&
      payload.hypothesisIndex >= 0 && payload.hypothesisIndex <= 1,
    'memory-projection-invalid-payload');
    const key = `h-${payload.assistantMessageId}-${payload.hypothesisIndex}`;
    fail(event.source.recordId === (key.length <= 128 ? key : payload.assistantMessageId),
      'memory-projection-source-mismatch');
    return {
      key, grade: payload.grade, comment: payload.comment,
      assistantMessageId: payload.assistantMessageId,
      hypothesisIndex: payload.hypothesisIndex
    };
  }
  if (event.kind === 'owner.recommendation.decision') {
    fail(STATUSES.has(payload.status) && isText(payload.title, 120) &&
      payload.title.trim().length > 0 && okId(payload.assistantMessageId) &&
      okId(payload.sourceMessageId) &&
      Number.isInteger(payload.candidateIndex) &&
      payload.candidateIndex >= 0 && payload.candidateIndex <= 1 &&
      (payload.goalId === undefined || okId(payload.goalId)),
    'memory-projection-invalid-payload');
    const key = `r-${payload.assistantMessageId}-${payload.candidateIndex}`;
    fail(event.source.recordId === (key.length <= 128 ? key : payload.assistantMessageId),
      'memory-projection-source-mismatch');
    return {
      key, status: payload.status, title: payload.title,
      assistantMessageId: payload.assistantMessageId,
      sourceMessageId: payload.sourceMessageId,
      candidateIndex: payload.candidateIndex,
      ...(payload.goalId ? { goalId: payload.goalId } : {})
    };
  }
  fail(event.kind === 'owner.topic.return' && isText(payload.note, 1200) &&
    payload.note.trim().length > 0 &&
    (payload.nextStep === undefined || isText(payload.nextStep, 240)) &&
    (payload.goalId === undefined || okId(payload.goalId)),
  'memory-projection-unsupported-kind');
  return {
    note: payload.note,
    ...(payload.nextStep ? { nextStep: payload.nextStep } : {}),
    ...(payload.goalId ? { goalId: payload.goalId } : {})
  };
}

// Stable normalized fingerprint makes retrying the immediately preceding
// event harmless but refuses changed content under the same ID/sequence.
function verifiedEntry(event, ownerId, topicId) {
  const evidence = validateTopicEvidenceEvent(event, { ownerId, topicId });
  const ownerData = validateOwnerPayload(event);
  const fingerprint = JSON.stringify({ evidence, topicScope: event.topicScope, ownerData });
  return { evidence, ownerData, fingerprint, topicScope: event.topicScope };
}

/**
 * Project a contiguous sequence. A missing/duplicated/out-of-order sequence
 * fails closed instead of dropping a correction or miscounting a return.
 * Supports an exact replay of the last processed event after an ambiguous ack.
 */
export function projectTopicMemory({ ownerId, topicId, events = [], previous = null }) {
  fail(okId(ownerId) && okId(topicId), 'memory-projection-invalid-scope');
  fail(Array.isArray(events) && events.length <= MAX_BATCH_EVENTS,
    'memory-projection-invalid-batch');
  const current = previous === null
    ? emptyTopicMemoryProjection({ ownerId, topicId })
    : structuredClone(previous);
  checkProjection(current, ownerId, topicId);

  for (const raw of events) {
    const { evidence, ownerData, fingerprint, topicScope } =
      verifiedEntry(raw, ownerId, topicId);
    if (evidence.sequence === current.lastProcessedSequence &&
        evidence.eventId === current.lastEventId &&
        fingerprint === current.lastEventFingerprint) continue;
    fail(evidence.sequence === current.lastProcessedSequence + 1,
      'memory-projection-noncontiguous-sequence');
    fail(current.topicScope === null || current.topicScope === topicScope,
      'memory-projection-topic-scope-conflict');
    if (current.topicScope === null) current.topicScope = topicScope;
    const entry = {
      ...ownerData, ...sourceRef(evidence), sequence: evidence.sequence
    };
    // IDs of assistant turns are only guaranteed inside their source session.
    // Never collapse unrelated source turns across two sessions sharing topicId.
    const projectionKey = ownerData.key ? `${evidence.sessionId}:${ownerData.key}` : null;
    if (evidence.kind === 'owner.hypothesis.review' ||
        evidence.kind === 'owner.correction') {
      const original = current.hypothesisReviews[projectionKey];
      if (evidence.kind === 'owner.correction') {
        fail(original && original.eventId === evidence.supersedes &&
          original.sessionId === evidence.sessionId &&
          original.assistantMessageId === ownerData.assistantMessageId &&
          original.hypothesisIndex === ownerData.hypothesisIndex,
        'memory-projection-invalid-correction-chain');
        current.counts.corrections += 1;
      } else {
        fail(!original && !evidence.supersedes,
          'memory-projection-duplicate-review');
        current.counts.reviews += 1;
      }
      fail(original || Object.keys(current.hypothesisReviews).length < MAX_KEYS,
        'memory-projection-capacity-exceeded');
      current.hypothesisReviews[projectionKey] = {
        ...entry,
        revision: original ? original.revision + 1 : 1,
        // User agreement is not proof of an objective psychological fact.
        stance: ownerData.grade <= 1 ? 'owner-disputed' :
          ownerData.grade === 2 ? 'owner-uncertain' : 'owner-supported',
        ...(evidence.supersedes ? { supersedes: evidence.supersedes } : {})
      };
    } else if (evidence.kind === 'owner.recommendation.decision') {
      const original = current.recommendations[projectionKey];
      fail(original || Object.keys(current.recommendations).length < MAX_KEYS,
        'memory-projection-capacity-exceeded');
      current.recommendations[projectionKey] = {
        ...entry, revision: original ? original.revision + 1 : 1
      };
      current.counts.decisions += 1;
    } else if (evidence.kind === 'owner.topic.return') {
      current.recentReturns = [...current.recentReturns, entry]
        .slice(-RECENT_RETURNS);
      current.counts.explicitReturns += 1;
    } else {
      throw new Error('memory-projection-unsupported-kind');
    }
    current.lastProcessedSequence = evidence.sequence;
    current.lastEventId = evidence.eventId;
    current.lastEventFingerprint = fingerprint;
    current.counts.processed += 1;
  }
  return current;
}

/**
 * Local, non-provider memory view with source provenance. Does not grant or
 * infer permission for AI egress; R10.4 must perform independent consent,
 * current-owner verification and token budgeting before any provider call.
 */
export function buildTopicMemoryDigest({ ownerId, topicId, projection,
  maxBytes = 3200, maxItems = 12 }) {
  fail(okId(ownerId) && okId(topicId), 'memory-projection-invalid-scope');
  checkProjection(projection, ownerId, topicId);
  fail(Number.isInteger(maxBytes) && maxBytes >= 256 && maxBytes <= 12000 &&
    Number.isInteger(maxItems) && maxItems >= 1 && maxItems <= 30,
  'memory-projection-invalid-budget');

  const entries = [];
  for (const review of Object.values(projection.hypothesisReviews)) {
    entries.push({
      kind: 'owner.hypothesis.review',
      stance: review.stance,
      grade: review.grade, comment: review.comment,
      revision: review.revision,
      ...sourceRef(review), sequence: review.sequence
    });
  }
  for (const decision of Object.values(projection.recommendations)) {
    entries.push({
      kind: 'owner.recommendation.decision', status: decision.status,
      title: decision.title, ...(decision.goalId ? { goalId: decision.goalId } : {}),
      ...sourceRef(decision), sequence: decision.sequence
    });
  }
  for (const visit of projection.recentReturns) {
    entries.push({
      kind: 'owner.topic.return', note: visit.note,
      ...sourceRef(visit), sequence: visit.sequence
    });
  }
  const rank = item => item.kind === 'owner.hypothesis.review'
    ? (item.stance === 'owner-disputed' ? 0 : 2)
    : item.kind === 'owner.recommendation.decision'
      ? (item.status === 'dismissed' ? 1 : 3) : 4;
  entries.sort((a, b) => rank(a) - rank(b) ||
    b.sequence - a.sequence || a.eventId.localeCompare(b.eventId));
  const selected = [];
  let usedEntryBytes = bytes('[]');
  for (const entry of entries) {
    const candidateBytes = bytes(JSON.stringify([...selected, entry]));
    if (selected.length < maxItems && candidateBytes <= maxBytes) {
      selected.push(entry);
      usedEntryBytes = candidateBytes;
    }
  }
  return {
    projectionVersion: TOPIC_MEMORY_PROJECTION_VERSION,
    ownerId, topicId,
    asOfSequence: projection.lastProcessedSequence,
    // Accurate counters across entire processed journal, not just recentReturns.
    counts: { ...projection.counts },
    entries: selected, usedEntryBytes, budgetScope: 'entries-only',
    omitted: entries.length - selected.length,
    providerContextSent: false,
    authorizedForProvider: false
  };
}
