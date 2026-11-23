/**
 * R10.2-C — read-only, local-demonstration audit of a memory projection.
 *
 * This is NOT server attestation or a grant to send data to an AI provider.
 * Caller must obtain owner-scoped documents from a trusted Firestore path.
 * Rebuilds from the entire contiguous Event Ledger, checks original session
 * references, then compares an untrusted cache to the replayed projection.
 * No Firestore writes, repair/delete, implicit inference, or provider I/O.
 */
import { emptyTopicMemoryProjection, projectTopicMemory }
  from './topicMemoryProjection.js';

export const TOPIC_MEMORY_AUDIT_VERSION = 1;
export const MAX_AUDIT_EVENTS = 250;
export const MAX_AUDIT_SESSIONS = 32;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const okId = id => typeof id === 'string' && ID.test(id);
const ensure = (condition, code) => {
  if (!condition) throw new Error(code);
};
const isObject = value => value && typeof value === 'object' &&
  !Array.isArray(value);

// Firestore map field order need not equal local JS insertion order.
// Compare only JSON-like values, rejecting prototypes/cycles/unserializable
// data rather than pretending that two incompatible representations agree.
export function canonicalMemoryValue(value) {
  const seen = new WeakSet();
  const normalize = (item, depth = 0) => {
    ensure(depth <= 30, 'memory-audit-invalid-value');
    if (item === null || typeof item === 'string' ||
        typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      ensure(Number.isFinite(item), 'memory-audit-invalid-value');
      return item;
    }
    ensure(item && typeof item === 'object' && !seen.has(item),
      'memory-audit-invalid-value');
    const proto = Object.getPrototypeOf(item);
    ensure(Array.isArray(item) || proto === Object.prototype || proto === null,
      'memory-audit-invalid-value');
    seen.add(item);
    const result = Array.isArray(item)
      ? item.map(child => normalize(child, depth + 1))
      : Object.fromEntries(Object.keys(item).sort().map(key => {
        ensure(key !== '__proto__' && key !== 'constructor' &&
          key !== 'prototype', 'memory-audit-invalid-value');
        return [key, normalize(item[key], depth + 1)];
      }));
    seen.delete(item);
    return result;
  };
  return JSON.stringify(normalize(value));
}

const expectedRecordId = (prefix, assistantId, index) => {
  const key = `${prefix}-${assistantId}-${index}`;
  return key.length <= 128 ? key : assistantId;
};

function checkSavedSource(event, session) {
  ensure(isObject(session) && Array.isArray(session.chatHistory),
    'memory-audit-source-missing');
  if (event.topicScope === 'explicit') {
    ensure(session.topicId === event.topicId,
      'memory-audit-topic-source-mismatch');
  }
  const { kind, payload, source } = event;
  const history = session.chatHistory;
  if (kind === 'owner.topic.return') {
    const matches = Array.isArray(session.returnCheckIns)
      ? session.returnCheckIns.filter(entry => entry?.id === source.recordId)
      : [];
    ensure(matches.length === 1 && matches[0].author === 'user' &&
      matches[0].type === 'return-check-in' &&
      matches[0].memoryEventId === event.eventId &&
      matches[0].text === payload.note,
    'memory-audit-source-mismatch');
    return;
  }
  const assistantId = payload.assistantMessageId;
  const matches = history.map((turn, index) => ({ turn, index }))
    .filter(({ turn }) => turn?.id === assistantId && turn?.role === 'assistant');
  ensure(matches.length === 1, 'memory-audit-source-missing');
  const { turn, index } = matches[0];
  ensure(index > 0 && history.slice(0, index).some(message =>
    message?.role === 'user' && okId(message.id)),
  'memory-audit-source-mismatch');
  if (kind === 'owner.hypothesis.review' || kind === 'owner.correction') {
    ensure(source.recordId === expectedRecordId('h', assistantId,
      payload.hypothesisIndex) &&
      typeof turn.interaction?.insights?.[payload.hypothesisIndex] === 'string' &&
      turn.interaction.insights[payload.hypothesisIndex].trim().length > 0,
    'memory-audit-source-mismatch');
    return;
  }
  ensure(kind === 'owner.recommendation.decision',
    'memory-audit-unsupported-kind');
  const candidate = turn.interaction?.recommendationCandidates?.[
    payload.candidateIndex];
  // Match to the original proposal, not merely the current, mutable
  // recommendationDecisions map, which may have changed since this event.
  ensure(source.recordId === expectedRecordId('r', assistantId,
    payload.candidateIndex) && candidate?.title === payload.title &&
    history.slice(0, index).reverse().find(message =>
      message?.role === 'user' && okId(message.id))?.id ===
        payload.sourceMessageId,
  'memory-audit-source-mismatch');
}

/**
 * Complete replay audit, capped so no partial journal can appear verified.
 * `checkpoint` is absent when null. A corrupt cache does NOT prevent an
 * independent ledger replay, but must never be silently overwritten.
 */
export function auditTopicMemorySnapshot({
  ownerId, topicId, topic, events, checkpoint = null, sessionsById
}) {
  ensure(okId(ownerId) && okId(topicId) && isObject(topic) &&
    topic.ownerId === ownerId && topic.topicId === topicId &&
    ['explicit', 'session-provisional'].includes(topic.scopeMode) &&
    Number.isSafeInteger(topic.lastSequence) && topic.lastSequence >= 1 &&
    topic.lastSequence <= MAX_AUDIT_EVENTS && okId(topic.lastEventId),
  'memory-audit-invalid-topic');
  ensure(Array.isArray(events) && events.length === topic.lastSequence &&
    isObject(sessionsById), 'memory-audit-incomplete-ledger');
  const sessionIds = new Set();
  for (const event of events) {
    ensure(event && okId(event.sessionId) &&
      isObject(event.source) && event.source.collection === 'sessions' &&
      event.source.documentId === event.sessionId,
    'memory-audit-invalid-source');
    sessionIds.add(event.sessionId);
  }
  ensure(sessionIds.size <= MAX_AUDIT_SESSIONS,
    'memory-audit-session-limit');
  for (const event of events) {
    ensure(Object.hasOwn(sessionsById, event.sessionId),
      'memory-audit-source-missing');
    checkSavedSource(event, sessionsById[event.sessionId]);
  }

  // Strict order and correction-chain checks are implemented by the existing
  // R10.2-A projector. A missing event or a forged payload fails closed.
  const replayed = projectTopicMemory({ ownerId, topicId, events });
  ensure(replayed.lastProcessedSequence === topic.lastSequence &&
    replayed.lastEventId === topic.lastEventId &&
    replayed.topicScope === topic.scopeMode,
  'memory-audit-ledger-head-mismatch');

  let status = 'checkpoint-missing';
  let repair = 'create-through-existing-transaction';
  let comparedThrough = 0;
  if (checkpoint !== null) {
    const structurallyValid = isObject(checkpoint) &&
      checkpoint.checkpointVersion === 1 &&
      checkpoint.ownerId === ownerId && checkpoint.topicId === topicId &&
      checkpoint.clientComputed === true &&
      checkpoint.providerUseAllowed === false &&
      Number.isSafeInteger(checkpoint.asOfSequence) &&
      checkpoint.asOfSequence >= 1 &&
      checkpoint.asOfSequence <= topic.lastSequence &&
      checkpoint.projection?.lastProcessedSequence === checkpoint.asOfSequence &&
      checkpoint.projection?.lastEventId === checkpoint.asOfEventId &&
      checkpoint.asOfEventId === events[checkpoint.asOfSequence - 1]?.eventId;
    if (!structurallyValid) {
      status = 'checkpoint-diverged';
      repair = 'authorized-manual-repair-required';
    } else {
      comparedThrough = checkpoint.asOfSequence;
      const expectedPrefix = comparedThrough === topic.lastSequence
        ? replayed
        : projectTopicMemory({ ownerId, topicId,
          events: events.slice(0, comparedThrough),
          previous: emptyTopicMemoryProjection({ ownerId, topicId }) });
      let matches = false;
      try {
        matches = canonicalMemoryValue(expectedPrefix) ===
          canonicalMemoryValue(checkpoint.projection);
      } catch {
        matches = false;
      }
      if (matches && comparedThrough === topic.lastSequence) {
        status = 'checkpoint-matches-ledger';
        repair = 'none';
      } else if (matches) {
        status = 'checkpoint-stale';
        repair = 'advance-through-existing-transaction';
      } else {
        status = 'checkpoint-diverged';
        repair = 'authorized-manual-repair-required';
      }
    }
  }
  return {
    auditVersion: TOPIC_MEMORY_AUDIT_VERSION,
    ownerId, topicId, status, repair,
    ledgerHeadSequence: topic.lastSequence,
    ledgerHeadEventId: topic.lastEventId,
    comparedThrough,
    sourceReferencesChecked: events.length,
    sessionDocumentsChecked: sessionIds.size,
    // Kept in memory solely for operator inspection; never a provider input.
    expectedProjection: replayed,
    independentServerAttestation: false,
    authorizedForProvider: false,
    providerContextSent: false,
    writePerformed: false
  };
}
