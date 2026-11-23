/**
 * R10.2-B — explicit, local-demo-only Firestore projection checkpoint.
 *
 * Checkpoints are REBUILDABLE CLIENT COMPUTED CACHES, NOT ATTESTED FACTS.
 * They MUST NOT be provided to Grok or interpreted as user-verified source
 * evidence. R10.4 needs an independently verified server-side retrieval path.
 *
 * Reads a bounded window of immutable owner events, then re-reads each event
 * inside a Firestore transaction and commits an optimistic versioned
 * checkpoint. No background polling, deletes, retries of paid calls or writes
 * to existing session/goal/diary documents occur here.
 */
import {
  collection, doc, getDoc, getDocs, limit, orderBy, query,
  runTransaction, serverTimestamp, where
} from 'firebase/firestore';
import {
  emptyTopicMemoryProjection, projectTopicMemory,
  TOPIC_MEMORY_PROJECTION_VERSION
} from './topicMemoryProjection.js';

export const TOPIC_MEMORY_CHECKPOINT_VERSION = 1;
export const MAX_CHECKPOINT_BATCH = 25;
const MAX_CHECKPOINT_BYTES = 160000;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const validId = value => typeof value === 'string' && ID.test(value);
const ensure = (value, error) => {
  if (!value) throw new Error(error);
};
const size = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

// Separate feature gate from R10.1 writes. Production and staging fail closed.
export function topicMemoryCheckpointEnabled() {
  return import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
    import.meta.env.VITE_ENABLE_REFLECT_MEMORY_LEDGER === 'true' &&
    import.meta.env.VITE_ENABLE_REFLECT_MEMORY_CHECKPOINT === 'true';
}

function validateSavedCheckpoint(raw, { ownerId, topicId }) {
  if (raw === null) {
    return {
      asOfSequence: 0, asOfEventId: null,
      projection: emptyTopicMemoryProjection({ ownerId, topicId })
    };
  }
  ensure(raw && typeof raw === 'object' &&
    raw.checkpointVersion === TOPIC_MEMORY_CHECKPOINT_VERSION &&
    raw.ownerId === ownerId && raw.topicId === topicId &&
    raw.clientComputed === true && raw.providerUseAllowed === false &&
    Number.isSafeInteger(raw.asOfSequence) && raw.asOfSequence > 0 &&
    validId(raw.asOfEventId) && raw.projection &&
    raw.projection.projectionVersion === TOPIC_MEMORY_PROJECTION_VERSION &&
    raw.projection.lastProcessedSequence === raw.asOfSequence &&
    raw.projection.lastEventId === raw.asOfEventId,
  'memory-checkpoint-invalid');
  // Pure projector does full structural validation even with zero new events.
  const projection = projectTopicMemory({
    ownerId, topicId, previous: raw.projection, events: []
  });
  ensure(size(projection) <= MAX_CHECKPOINT_BYTES, 'memory-checkpoint-too-large');
  return { asOfSequence: raw.asOfSequence, asOfEventId: raw.asOfEventId,
    projection };
}

/**
 * One bounded increment only (not an unbounded "catch up" loop). Call again
 * explicitly if `hasMore` is true. Does not perform consent or provider I/O.
 */
export async function advanceTopicMemoryCheckpoint({
  database, appId, ownerId, topicId, batchSize = MAX_CHECKPOINT_BATCH
}) {
  ensure(topicMemoryCheckpointEnabled(), 'memory-checkpoint-disabled');
  ensure(database && appId === 'reflect-8fdc8' && validId(ownerId) &&
    validId(topicId) && Number.isSafeInteger(batchSize) && batchSize >= 1 &&
    batchSize <= MAX_CHECKPOINT_BATCH, 'memory-checkpoint-invalid-scope');

  const base = `artifacts/${appId}/users/${ownerId}`;
  const checkpointRef = doc(database, base, 'memoryProjections', topicId);
  const counterRef = doc(database, base, 'memoryTopics', topicId);
  const eventsRef = collection(database, base, 'memoryEvents');
  const first = await getDoc(checkpointRef);
  const initial = validateSavedCheckpoint(first.exists() ? first.data() : null,
    { ownerId, topicId });

  // The where/order/limit query bounds reads to this topic and unprocessed
  // sequence. For hosted Firestore, a composite index must be reviewed before
  // enabling the feature (this implementation is demo Emulator only).
  const batch = await getDocs(query(eventsRef,
    where('topicId', '==', topicId),
    where('sequence', '>', initial.asOfSequence),
    orderBy('sequence', 'asc'), limit(batchSize)));
  const IDs = batch.docs.map(item => item.id);
  ensure(IDs.every(validId) && new Set(IDs).size === IDs.length,
    'memory-checkpoint-invalid-query');

  return runTransaction(database, async tx => {
    // All transaction reads happen before the conditional write.
    const [checkpointSnap, topicSnap] = await Promise.all([
      tx.get(checkpointRef), tx.get(counterRef)
    ]);
    ensure(topicSnap.exists(), 'memory-checkpoint-missing-topic');
    const topic = topicSnap.data();
    ensure(topic.ownerId === ownerId && topic.topicId === topicId &&
      ['explicit', 'session-provisional'].includes(topic.scopeMode) &&
      Number.isSafeInteger(topic.lastSequence) && topic.lastSequence >= 1 &&
      validId(topic.lastEventId), 'memory-checkpoint-invalid-topic');
    const latest = validateSavedCheckpoint(
      checkpointSnap.exists() ? checkpointSnap.data() : null,
      { ownerId, topicId }
    );
    ensure(latest.asOfSequence === initial.asOfSequence &&
      latest.asOfEventId === initial.asOfEventId,
    'memory-checkpoint-concurrent-update');
    ensure(latest.asOfSequence <= topic.lastSequence,
      'memory-checkpoint-ahead-of-ledger');

    if (IDs.length === 0) {
      ensure(latest.asOfSequence === topic.lastSequence,
        'memory-checkpoint-incomplete-query');
      return { asOfSequence: latest.asOfSequence,
        remaining: 0, hasMore: false, wrote: false,
        providerUseAllowed: false };
    }

    const committed = [];
    for (const id of IDs) {
      const snapshot = await tx.get(doc(database, base, 'memoryEvents', id));
      ensure(snapshot.exists(), 'memory-checkpoint-missing-event');
      const record = snapshot.data();
      ensure(record.eventId === id && record.ownerId === ownerId &&
        record.topicId === topicId &&
        Number.isSafeInteger(record.sequence) &&
        record.sequence > latest.asOfSequence &&
        record.sequence <= topic.lastSequence,
      'memory-checkpoint-invalid-event');
      committed.push(record);
    }
    const projection = projectTopicMemory({ ownerId, topicId,
      previous: latest.projection, events: committed });
    ensure(projection.topicScope === topic.scopeMode,
      'memory-checkpoint-topic-scope-conflict');
    ensure(size(projection) <= MAX_CHECKPOINT_BYTES,
      'memory-checkpoint-too-large');
    const asOfSequence = projection.lastProcessedSequence;
    const asOfEventId = projection.lastEventId;
    const values = {
      checkpointVersion: TOPIC_MEMORY_CHECKPOINT_VERSION,
      ownerId, topicId, asOfSequence, asOfEventId, projection,
      clientComputed: true, providerUseAllowed: false,
      updatedAt: serverTimestamp()
    };
    if (checkpointSnap.exists()) {
      tx.update(checkpointRef, {
        asOfSequence, asOfEventId, projection, updatedAt: values.updatedAt
      });
    } else {
      tx.set(checkpointRef, { ...values, createdAt: serverTimestamp() });
    }
    const remaining = topic.lastSequence - asOfSequence;
    return { asOfSequence, remaining, hasMore: remaining > 0,
      wrote: true, providerUseAllowed: false };
  });
}
