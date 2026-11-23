/**
 * R10.2-C — explicit demo-only readback of the FULL bounded owner ledger,
 * saved source sessions and cache. Never writes or sends AI requests.
 * Snapshot consistency is checked with a second read of topic+checkpoint;
 * conflicting concurrent writes cause a refusal instead of a false PASS.
 * Client-supplied Firebase environment alone is NOT independent attestation.
 */
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where }
  from 'firebase/firestore';
import { topicMemoryCheckpointEnabled }
  from './topicMemoryCheckpoint.js';
import { MAX_AUDIT_EVENTS, MAX_AUDIT_SESSIONS,
  auditTopicMemorySnapshot, canonicalMemoryValue }
  from './topicMemoryAudit.r102c.js';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const validId = value => typeof value === 'string' && ID.test(value);
const ensure = (value, code) => { if (!value) throw new Error(code); };
const read = snap => snap.exists() ? snap.data() : null;
const headFingerprint = h => canonicalMemoryValue(h && {
  ownerId: h.ownerId, topicId: h.topicId, scopeMode: h.scopeMode,
  lastSequence: h.lastSequence, lastEventId: h.lastEventId
});
const cacheFingerprint = c => canonicalMemoryValue(c && {
  checkpointVersion: c.checkpointVersion, ownerId: c.ownerId,
  topicId: c.topicId, asOfSequence: c.asOfSequence,
  asOfEventId: c.asOfEventId, clientComputed: c.clientComputed,
  providerUseAllowed: c.providerUseAllowed, projection: c.projection
});

export async function inspectTopicMemoryCheckpoint({
  database, appId, ownerId, topicId
}) {
  ensure(topicMemoryCheckpointEnabled(), 'memory-audit-disabled');
  ensure(database?.app?.options?.projectId === 'demo-reflect-auth-qa' &&
    appId === 'reflect-8fdc8' && validId(ownerId) && validId(topicId),
  'memory-audit-invalid-scope');
  const root = `artifacts/${appId}/users/${ownerId}`;
  const topicRef = doc(database, root, 'memoryTopics', topicId);
  const checkpointRef = doc(database, root, 'memoryProjections', topicId);
  const headBeforeSnap = await getDoc(topicRef);
  ensure(headBeforeSnap.exists(), 'memory-audit-topic-missing');
  const head = read(headBeforeSnap);
  ensure(Number.isSafeInteger(head.lastSequence) && head.lastSequence >= 1 &&
    head.lastSequence <= MAX_AUDIT_EVENTS,
  'memory-audit-topic-too-large');
  const cacheBefore = read(await getDoc(checkpointRef));
  const eventQuery = query(collection(database, root, 'memoryEvents'),
    where('topicId', '==', topicId), orderBy('sequence', 'asc'),
    limit(head.lastSequence + 1));
  const queried = await getDocs(eventQuery);
  ensure(queried.docs.length === head.lastSequence,
    'memory-audit-incomplete-ledger');
  const events = queried.docs.map(snapshot => {
    const event = snapshot.data();
    ensure(event?.eventId === snapshot.id,
      'memory-audit-event-id-conflict');
    return event;
  });
  const sourceIds = [...new Set(events.map(event => event.sessionId))];
  ensure(sourceIds.length <= MAX_AUDIT_SESSIONS &&
    sourceIds.every(validId), 'memory-audit-session-limit');
  const sessionsById = Object.create(null);
  for (const sessionId of sourceIds) {
    sessionsById[sessionId] = read(await getDoc(
      doc(database, root, 'sessions', sessionId)));
  }
  const afterHead = read(await getDoc(topicRef));
  const afterCache = read(await getDoc(checkpointRef));
  ensure(headFingerprint(afterHead) === headFingerprint(head) &&
    cacheFingerprint(afterCache) === cacheFingerprint(cacheBefore),
  'memory-audit-concurrent-write');
  return auditTopicMemorySnapshot({ ownerId, topicId, topic: head,
    events, checkpoint: cacheBefore, sessionsById });
}
