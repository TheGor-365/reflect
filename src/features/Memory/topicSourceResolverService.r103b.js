/**
 * R10.3-B — on-demand, demo-only, owner-scoped source readback.
 * Explicit candidate IDs only; no unbounded collection queries, listeners,
 * background refresh, writes or calls to an external AI provider.
 * Client Firebase SDK reads are NOT independent server attestation.
 */
import { doc, getDoc } from 'firebase/firestore';
import { topicMemoryCheckpointEnabled } from './topicMemoryCheckpoint.js';
import {
  planTopicSourceRead, resolveTopicSourceDocument,
  packageTopicSourceReadback
} from './topicSourceResolver.r103b.js';

const ensure = (condition, code) => { if (!condition) throw new Error(code); };

export function topicSourceReadEnabled() {
  return topicMemoryCheckpointEnabled() &&
    import.meta.env.VITE_ENABLE_REFLECT_MEMORY_SOURCE_RESOLVER === 'true';
}

export async function readTopicSourceCandidates({
  database, auth, appId, ownerId, topicId, inventory,
  candidateIds, maxTextChars, maxTotalBytes
}) {
  ensure(topicSourceReadEnabled(), 'memory-source-disabled');
  ensure(database?.app?.options?.projectId === 'demo-reflect-auth-qa' &&
    appId === 'reflect-8fdc8' && auth?.currentUser?.uid === ownerId,
  'memory-source-invalid-scope');
  // All input validation must finish before a single getDoc call.
  const plan = planTopicSourceRead({ inventory, ownerId, topicId, candidateIds });
  const root = ['artifacts', appId, 'users', ownerId];
  const unique = new Map();
  for (const record of plan.selected) {
    const { collection, documentId } = record.source;
    const key = `${collection}/${documentId}`;
    if (!unique.has(key)) {
      unique.set(key, doc(database, ...root, collection, documentId));
    }
  }
  const references = [...unique.values()];
  const snapshots = await Promise.all(references.map(ref => getDoc(ref)));
  ensure(auth?.currentUser?.uid === ownerId, 'memory-source-owner-changed');
  const current = new Map();
  let i = 0;
  for (const [key, ref] of unique) {
    const snapshot = snapshots[i++];
    ensure(snapshot?.exists() &&
      (snapshot.id === undefined || snapshot.id === ref.id),
    'memory-source-document-missing');
    current.set(key, snapshot.data());
  }

  // The first read is not enough: source documents are mutable and a stale
  // inventory must fail instead of silently being treated as historical fact.
  const original = plan.selected.map(record => resolveTopicSourceDocument({
    ownerId, topicId, record,
    document: current.get(`${record.source.collection}/${record.source.documentId}`)
  }));
  const latest = await Promise.all(references.map(ref => getDoc(ref)));
  ensure(auth?.currentUser?.uid === ownerId, 'memory-source-owner-changed');
  const reread = new Map();
  i = 0;
  for (const [key, ref] of unique) {
    const snap = latest[i++];
    ensure(snap?.exists() &&
      (snap.id === undefined || snap.id === ref.id),
    'memory-source-document-missing');
    reread.set(key, snap.data());
  }
  for (const [index, record] of plan.selected.entries()) {
    const fresh = resolveTopicSourceDocument({ ownerId, topicId, record,
      document: reread.get(`${record.source.collection}/${record.source.documentId}`)
    });
    const old = original[index];
    ensure(old.text === fresh.text &&
      old.sourceVersion === fresh.sourceVersion &&
      old.goalStatus === fresh.goalStatus &&
      old.archived === fresh.archived,
    'memory-source-concurrent-change');
  }
  const report = packageTopicSourceReadback({ plan, resolved: original,
    maxTextChars, maxTotalBytes });
  return {
    ...report, documentsRead: unique.size, readOperations: 2 * unique.size,
    bestEffortReadbackStable: true,
    // The actual Rules are the access boundary; checking the claimed UID in
    // this client must not be mistaken for a backend security attestation.
    ownerPathAuthorizationChecked: false
  };
}
