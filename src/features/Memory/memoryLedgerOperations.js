/**
 * R10.1 — owner-scoped append-only evidence journal (LOCAL DEMO EMULATOR ONLY).
 *
 * No provider calls, history-sharing permission, migrations or background
 * summarisation. Source writes and the new ledger entry MUST be in one
 * Firestore transaction. Disabled for every hosted build until rules, privacy
 * erasure and migration have their own release acceptance.
 */
import { doc, serverTimestamp } from 'firebase/firestore';
import { TOPIC_EVIDENCE_VERSION, validateTopicEvidenceEvent } from './topicEvidenceContract';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const validId = value => typeof value === 'string' && ID.test(value);
const bytes = value => new TextEncoder().encode(value).byteLength;
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

/** Opt-in is intentionally impossible for staging/production at R10.1. */
export const memoryLedgerEnabled = () =>
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
  import.meta.env.VITE_ENABLE_REFLECT_MEMORY_LEDGER === 'true';

/** Generate ONCE per explicit action, OUTSIDE the retryable transaction. */
export function createMemoryEventId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `ev-${globalThis.crypto.randomUUID()}`;
  }
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('memory-secure-event-id-unavailable');
  }
  const random = new Uint8Array(16);
  globalThis.crypto.getRandomValues(random);
  return `ev-${Array.from(random, n => n.toString(16).padStart(2, '0')).join('')}`;
}

/** UTF-8 safe summary, full original owner text remains in immutable payload. */
export function memoryEvidenceSummary(value, maxBytes = 1400) {
  assert(typeof value === 'string' && value.trim().length > 0,
    'memory-invalid-summary');
  assert(Number.isInteger(maxBytes) && maxBytes >= 32 && maxBytes <= 1450,
    'memory-invalid-summary');
  // Some legacy review editors allow CRLF. Normalise only the compact
  // summary; payload and source keep the owner's exact saved comment.
  const source = value.replace(/\r\n?/g, '\n').trim();
  if (bytes(source) <= maxBytes) return source;
  const suffix = '…';
  let output = '';
  for (const symbol of source) {
    if (bytes(output + symbol + suffix) > maxBytes) break;
    output += symbol;
  }
  return output.trimEnd() + suffix;
}

const TYPES = Object.freeze({
  'owner.hypothesis.review': 'owner-reviewed',
  'owner.correction': 'owner-corrected',
  'owner.recommendation.decision': 'owner-decided',
  'owner.topic.return': 'owner-observed'
});

function validatedPayload(kind, payload) {
  assert(payload && typeof payload === 'object' && !Array.isArray(payload),
    'memory-invalid-owner-payload');
  if (kind === 'owner.hypothesis.review' || kind === 'owner.correction') {
    assert(Number.isInteger(payload.grade) && payload.grade >= 0 && payload.grade <= 4 &&
      Number.isInteger(payload.hypothesisIndex) && payload.hypothesisIndex >= 0 &&
      payload.hypothesisIndex <= 1 && validId(payload.assistantMessageId) &&
      typeof payload.comment === 'string' && payload.comment.length <= 500,
    'memory-invalid-owner-payload');
    return Object.freeze({
      grade: payload.grade, comment: payload.comment,
      assistantMessageId: payload.assistantMessageId,
      hypothesisIndex: payload.hypothesisIndex
    });
  }
  if (kind === 'owner.recommendation.decision') {
    assert(['saved','postponed','dismissed','accepted'].includes(payload.status) &&
      typeof payload.title === 'string' && payload.title.trim().length > 0 &&
      payload.title.length <= 120 && validId(payload.assistantMessageId) &&
      validId(payload.sourceMessageId) && Number.isInteger(payload.candidateIndex) &&
      payload.candidateIndex >= 0 && payload.candidateIndex <= 1 &&
      (!payload.goalId || validId(payload.goalId)), 'memory-invalid-owner-payload');
    return Object.freeze({
      status: payload.status, title: payload.title,
      assistantMessageId: payload.assistantMessageId,
      sourceMessageId: payload.sourceMessageId,
      candidateIndex: payload.candidateIndex,
      ...(payload.goalId ? { goalId: payload.goalId } : {})
    });
  }
  assert(kind === 'owner.topic.return' && typeof payload.note === 'string' &&
    payload.note.trim().length > 0 && payload.note.length <= 1200 &&
    (!payload.goalId || validId(payload.goalId)) &&
    (payload.nextStep === undefined || (typeof payload.nextStep === 'string' &&
      payload.nextStep.length <= 240)), 'memory-invalid-owner-payload');
  return Object.freeze({
    note: payload.note,
    ...(payload.nextStep ? { nextStep: payload.nextStep } : {}),
    ...(payload.goalId ? { goalId: payload.goalId } : {})
  });
}

/**
 * Caller MUST have read and verified the exact owner session and source
 * inside THIS transaction; the Firestore Rules are a separate enforcement
 * layer. Never assume a user's topic identity from AI similarity.
 * Legacy sessions use a provisional session-scoped topic until reviewed.
 */
export async function appendOwnerEvidenceInTransaction({
  tx, database, appId, ownerId, sessionId, session, eventId, kind,
  sourceRecordId, text, payload, supersedes
}) {
  assert(memoryLedgerEnabled(), 'memory-ledger-disabled');
  assert(tx && typeof tx.get === 'function' && typeof tx.set === 'function' &&
    typeof tx.update === 'function' && database && validId(appId) &&
    validId(ownerId) && validId(sessionId) && validId(eventId) &&
    validId(sourceRecordId) && session && typeof session === 'object' &&
    Object.hasOwn(TYPES, kind), 'memory-invalid-write-scope');
  assert(session.topicId === undefined || validId(session.topicId),
    'memory-invalid-topic-identity');
  const topicId = session.topicId || sessionId;
  const scopeMode = session.topicId ? 'explicit' : 'session-provisional';
  const root = `artifacts/${appId}/users/${ownerId}`;
  // R10.3-C2B3-B (DEMO): this owner-readable marker is written atomically
  // with the private erasure fence by trusted Admin code. It is never
  // client-writable. Reading it inside this transaction guarantees that an
  // overlapping erasure prepare causes the SDK to retry against the new
  // state, rather than failing an otherwise valid owner action.
  const erasureRef = doc(database, root, 'memoryControl', 'erasure');
  const erasure = await tx.get(erasureRef);
  if (erasure.exists()) {
    const state = erasure.data();
    assert(state && state.schemaVersion === 1 &&
      state.ownerId === ownerId && state.state === 'erasure-fenced' &&
      Number.isSafeInteger(state.createdAtMs) && state.createdAtMs >= 0,
    'memory-erasure-state-invalid');
    // This is a SOURCE-ONLY transaction. Do not forge a memory event or
    // reuse a stale memoryEventId from a deleted history. No provider call.
    return { suppressed: true, reason: 'erasure-fence' };
  }
  const ownerPayload = validatedPayload(kind, payload);
  const eventRef = doc(database, root, 'memoryEvents', eventId);
  const topicRef = doc(database, root, 'memoryTopics', topicId);

  // All transaction reads precede all writes, including goal creation.
  const [eventSnapshot, topicSnapshot] = await Promise.all([
    tx.get(eventRef), tx.get(topicRef)
  ]);
  const priorTopic = topicSnapshot.exists() ? topicSnapshot.data() : null;
  const lastSequence = priorTopic ? priorTopic.lastSequence : 0;
  assert((!priorTopic || (priorTopic.ownerId === ownerId &&
    priorTopic.topicId === topicId && priorTopic.scopeMode === scopeMode)) &&
    Number.isSafeInteger(lastSequence) && lastSequence >= 0 &&
    lastSequence < 1000000 &&
    (!priorTopic || validId(priorTopic.lastEventId)),
  'memory-topic-counter-invalid');
  const sequence = lastSequence + 1;
  const event = validateTopicEvidenceEvent({
    schemaVersion: TOPIC_EVIDENCE_VERSION, eventId, ownerId, topicId, sessionId,
    sequence, kind, origin: 'owner', verification: TYPES[kind],
    source: { collection: 'sessions', documentId: sessionId, recordId: sourceRecordId },
    text: memoryEvidenceSummary(text),
    ...(supersedes ? { supersedes } : {})
  }, { ownerId, topicId });

  // A replay of a previously committed ID is idempotent; changed content is
  // not. The owner action also independently detects same-value no-ops.
  if (eventSnapshot.exists()) {
    const stored = eventSnapshot.data();
    const comparable = { ...event, sequence: stored.sequence };
    const saved = validateTopicEvidenceEvent(stored, { ownerId, topicId });
    assert(JSON.stringify(saved) === JSON.stringify(comparable) &&
      JSON.stringify(stored.payload) === JSON.stringify(ownerPayload) &&
      stored.topicScope === scopeMode, 'memory-event-replay-conflict');
    return { eventId, topicId, sequence: saved.sequence, replay: true };
  }

  // Existing superseded events have to be owner/topic scoped and earlier;
  // never invent a historical correction from a legacy overwritten field.
  if (supersedes) {
    assert(validId(supersedes) && supersedes !== eventId,
      'memory-invalid-superseded-event');
    const originalRef = doc(database, root, 'memoryEvents', supersedes);
    const originalSnap = await tx.get(originalRef);
    assert(originalSnap.exists(), 'memory-missing-correction-source');
    const original = originalSnap.data();
    assert(original.ownerId === ownerId && original.topicId === topicId &&
      original.sessionId === sessionId && original.sequence < sequence &&
      original.source?.documentId === sessionId &&
      original.source?.recordId === sourceRecordId,
    'memory-correction-source-conflict');
  }

  if (priorTopic) {
    tx.update(topicRef, {
      lastSequence: sequence, lastEventId: eventId, updatedAt: serverTimestamp()
    });
  } else {
    tx.set(topicRef, {
      ownerId, topicId, lastSequence: sequence, lastEventId: eventId, scopeMode,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  }
  tx.set(eventRef, {
    ...event, payload: ownerPayload, topicScope: scopeMode,
    createdAt: serverTimestamp()
  });
  return { eventId, topicId, sequence, replay: false };
}
