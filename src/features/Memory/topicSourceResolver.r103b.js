/**
 * R10.3-B: exact, bounded, read-only resolution of R10.3-A source pointers.
 *
 * Input is an UNTRUSTED inventory of candidates, never attested evidence.
 * Documents must be obtained through an owner-scoped read path by the caller.
 * This module does not assign topics by similarity, write a ledger, grant
 * provider access, infer psychological facts or attest historical truth.
 */
export const TOPIC_SOURCE_RESOLVER_VERSION = 1;
export const MAX_SOURCE_REQUESTS = 12;
export const MAX_SOURCE_TEXT_CHARS = 2000;
export const MAX_SOURCE_TOTAL_BYTES = 20000;

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const validId = value => typeof value === 'string' && ID.test(value);
const isObject = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value);
const requireValid = (condition, code) => { if (!condition) throw new Error(code); };
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const COLLECTIONS = new Set(['sessions', 'goals', 'diaryNotes']);
const ORIGINS = Object.freeze({
  sessions: new Set(['owner-stated', 'model-proposed', 'owner-observed']),
  goals: new Set(['owner-goal-snapshot']),
  diaryNotes: new Set(['owner-diary-snapshot'])
});

function claimMatches(document, ownerId) {
  for (const key of ['ownerId', 'ownerUid', 'userId']) {
    if (Object.hasOwn(document, key)) {
      requireValid(document[key] === ownerId, 'memory-source-cross-owner');
    }
  }
}

/**
 * Validates all pointers before ANY document read. A source linked to a topic
 * only by its parent session is not automatically eligible: it first requires
 * an owner-confirmed, durable topic link (a later R10 slice).
 */
export function planTopicSourceRead({ inventory, ownerId, topicId,
  candidateIds, maxRequests = MAX_SOURCE_REQUESTS }) {
  requireValid(validId(ownerId) && validId(topicId) &&
    Number.isInteger(maxRequests) && maxRequests >= 1 &&
    maxRequests <= MAX_SOURCE_REQUESTS &&
    isObject(inventory) && inventory.inventoryVersion === 1 &&
    inventory.ownerId === ownerId && inventory.topicId === topicId &&
    inventory.ownerPathAuthorizationChecked === false &&
    inventory.independentServerAttestation === false &&
    inventory.providerUseAllowed === false &&
    Array.isArray(inventory.records) && inventory.records.length <= 200 &&
    Number.isSafeInteger(inventory.omitted) && inventory.omitted >= 0 &&
    inventory.candidateCount === inventory.records.length &&
    Array.isArray(candidateIds) && candidateIds.length >= 1 &&
    candidateIds.length <= maxRequests,
  'memory-source-invalid-request');

  const known = new Map();
  for (const candidate of inventory.records) {
    const source = candidate?.source;
    requireValid(isObject(candidate) && isObject(source) &&
      COLLECTIONS.has(source.collection) && validId(source.documentId) &&
      validId(source.recordId) &&
      candidate.candidateId === `${source.collection}/${source.documentId}/${source.recordId}` &&
      ORIGINS[source.collection].has(candidate.origin) &&
      ['explicit', 'session-provisional', 'session-linked'].includes(candidate.topicLink) &&
      candidate.verification === 'unverified-source-snapshot' &&
      ((source.collection === 'sessions' &&
        ['explicit', 'session-provisional'].includes(candidate.topicLink)) ||
       (source.collection !== 'sessions' &&
        ['explicit', 'session-linked'].includes(candidate.topicLink))) &&
      candidate.sourceMutable === true &&
      candidate.requiresOwnerTopicConfirmation === (candidate.topicLink === 'session-linked') &&
      typeof candidate.textPreview === 'string' &&
      candidate.textPreview.length >= 1 && candidate.textPreview.length <= 1500 &&
      typeof candidate.truncated === 'boolean' &&
      !known.has(candidate.candidateId), 'memory-source-invalid-candidate');
    if (source.collection !== 'sessions') {
      requireValid(candidate.topicLink !== 'session-provisional' &&
        (source.collection !== 'goals' ||
          source.recordId === source.documentId),
      'memory-source-invalid-candidate');
    }
    known.set(candidate.candidateId, candidate);
  }

  const seen = new Set();
  const selected = [];
  const pendingOwnerConfirmation = [];
  for (const id of candidateIds) {
    requireValid(typeof id === 'string' && !seen.has(id) && known.has(id),
      'memory-source-unknown-or-duplicate');
    seen.add(id);
    const record = known.get(id);
    if (record.topicLink === 'session-linked') {
      pendingOwnerConfirmation.push({ candidateId: id,
        reason: 'owner-topic-confirmation-required' });
      continue;
    }
    selected.push(record);
  }
  return {
    ownerId, topicId, selected, pendingOwnerConfirmation,
    requestedCount: candidateIds.length,
    inventoryOmitted: inventory.omitted,
    ownerPathAuthorizationChecked: false,
    independentServerAttestation: false, providerUseAllowed: false
  };
}

function eligibleTopic(document, record, topicId) {
  if (record.topicLink === 'explicit') {
    requireValid(document.topicId === topicId,
      'memory-source-topic-mismatch');
  } else {
    // Legacy session => topic provisional solely when IDs match and there is
    // no distinct explicit topic assigned later.
    requireValid(record.source.collection === 'sessions' &&
      record.source.documentId === topicId &&
      (document.topicId === undefined || document.topicId === null ||
        document.topicId === ''), 'memory-source-topic-mismatch');
  }
}

/**
 * Exact match to the mutable, currently saved document. Does not claim that
 * a prior version still exists, or that a human endorsed assistant content.
 * All extracted fields are primitives; no Firebase Timestamp/credentials exit.
 */
export function resolveTopicSourceDocument({ ownerId, topicId, record, document }) {
  requireValid(validId(ownerId) && validId(topicId) &&
    isObject(record) && isObject(record.source) && isObject(document),
  'memory-source-invalid-document');
  claimMatches(document, ownerId);
  eligibleTopic(document, record, topicId);
  requireValid((document.archived === true) === record.archived,
    'memory-source-changed');

  const { collection, documentId, recordId } = record.source;
  let text; let sourceVersion = null;
  let goalStatus = null;
  let origin = record.origin;
  if (collection === 'sessions') {
    requireValid(Array.isArray(document.chatHistory),
      'memory-source-malformed-document');
    const turns = document.chatHistory.filter(turn => turn?.id === recordId);
    const visits = Array.isArray(document.returnCheckIns)
      ? document.returnCheckIns.filter(item => item?.id === recordId) : [];
    // Reject ambiguous collisions between a turn ID and return-check-in ID.
    requireValid(turns.length + visits.length === 1,
      'memory-source-missing-or-ambiguous-record');
    if (record.sourceType === 'return-check-in') {
      requireValid(turns.length === 0 && visits.length === 1 &&
        origin === 'owner-observed' &&
        visits[0].author === 'user' &&
        visits[0].type === 'return-check-in',
      'memory-source-record-mismatch');
      text = visits[0].text;
      sourceVersion = validId(visits[0].memoryEventId)
        ? visits[0].memoryEventId : null;
      requireValid(record.sourceVersion === sourceVersion,
        'memory-source-changed');
    } else {
      requireValid(visits.length === 0 && turns.length === 1 &&
        (turns[0].role === 'user' || turns[0].role === 'assistant') &&
        ((turns[0].role === 'user' && origin === 'owner-stated') ||
         (turns[0].role === 'assistant' && origin === 'model-proposed')),
      'memory-source-record-mismatch');
      text = turns[0].content;
      requireValid(record.sourceVersion === null,
        'memory-source-record-mismatch');
    }
  } else if (collection === 'goals') {
    requireValid(documentId === recordId && origin === 'owner-goal-snapshot' &&
      record.sourceVersion === null,
    'memory-source-record-mismatch');
    text = document.text;
    goalStatus = ['active', 'paused', 'completed'].includes(document.status)
      ? document.status : 'unknown';
    requireValid(goalStatus === record.goalStatus,
      'memory-source-changed');
  } else if (collection === 'diaryNotes') {
    requireValid(origin === 'owner-diary-snapshot' &&
      Number.isInteger(record.entryIndex) && record.entryIndex >= 0 &&
      recordId === `entry-${record.entryIndex}` &&
      Array.isArray(document.entries), 'memory-source-record-mismatch');
    const entry = document.entries[record.entryIndex];
    requireValid(isObject(entry), 'memory-source-missing-or-ambiguous-record');
    text = entry.text;
    sourceVersion = Number.isSafeInteger(entry.version) && entry.version > 0
      ? entry.version : null;
    requireValid(sourceVersion === record.sourceVersion,
      'memory-source-changed');
  } else {
    throw new Error('memory-source-unsupported-collection');
  }

  requireValid(typeof text === 'string' && text.trim() &&
    text.length <= 50000, 'memory-source-invalid-text');
  const normalized = text.trim();
  const n = record.textPreview.length;
  requireValid(normalized.slice(0, n) === record.textPreview &&
    (normalized.length > n) === record.truncated,
  'memory-source-changed');
  return {
    candidateId: record.candidateId,
    source: { collection, documentId, recordId },
    origin, topicLink: record.topicLink,
    text: normalized, sourceVersion, goalStatus,
    archived: document.archived === true,
    verifiedAgainstCurrentSnapshot: true,
    independentServerAttestation: false,
    providerUseAllowed: false
  };
}

/** Bounded source excerpts; always disclose truncation. Never an AI payload. */
export function packageTopicSourceReadback({ plan, resolved,
  maxTextChars = MAX_SOURCE_TEXT_CHARS,
  maxTotalBytes = MAX_SOURCE_TOTAL_BYTES }) {
  requireValid(isObject(plan) && Array.isArray(plan.selected) &&
    Array.isArray(plan.pendingOwnerConfirmation) &&
    Array.isArray(resolved) && resolved.length === plan.selected.length &&
    Number.isInteger(maxTextChars) && maxTextChars >= 64 &&
    maxTextChars <= MAX_SOURCE_TEXT_CHARS &&
    Number.isInteger(maxTotalBytes) && maxTotalBytes >= 1024 &&
    maxTotalBytes <= MAX_SOURCE_TOTAL_BYTES,
  'memory-source-invalid-budget');
  const records = [];
  let usedBytes = 0;
  for (const [i, value] of resolved.entries()) {
    requireValid(value.candidateId === plan.selected[i].candidateId &&
      value.independentServerAttestation === false &&
      value.providerUseAllowed === false &&
      typeof value.text === 'string', 'memory-source-invalid-readback');
    const letters = Array.from(value.text);
    const base = {
      candidateId: value.candidateId, source: value.source,
      origin: value.origin, topicLink: value.topicLink,
      archived: value.archived, sourceVersion: value.sourceVersion,
      goalStatus: value.goalStatus,
      verification: 'current-owner-snapshot-only',
      sourceMutable: true,
      independentServerAttestation: false, providerUseAllowed: false
    };
    const remaining = maxTotalBytes - usedBytes;
    let hi = Math.min(maxTextChars, letters.length);
    let lo = 0;
    // Exact UTF-8 JSON byte cap, including provenance metadata.
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = { ...base, text: letters.slice(0, mid).join(''),
        truncated: mid < letters.length };
      if (bytes(candidate) <= remaining) lo = mid;
      else hi = mid - 1;
    }
    requireValid(lo > 0, 'memory-source-budget-exceeded');
    const item = { ...base, text: letters.slice(0, lo).join(''),
      truncated: lo < letters.length };
    usedBytes += bytes(item);
    records.push(item);
  }
  return {
    resolverVersion: TOPIC_SOURCE_RESOLVER_VERSION,
    ownerId: plan.ownerId, topicId: plan.topicId,
    requestedCount: plan.requestedCount,
    inventoryOmitted: plan.inventoryOmitted,
    readbackScope: 'requested-candidates-only',
    completeTopicMemory: false,
    resolvedCount: records.length,
    pendingOwnerConfirmation: plan.pendingOwnerConfirmation,
    readbackComplete: plan.pendingOwnerConfirmation.length === 0 &&
      records.every(item => !item.truncated),
    records, usedBytes,
    ownerPathAuthorizationChecked: false,
    independentServerAttestation: false,
    providerUseAllowed: false, providerContextSent: false,
    writePerformed: false
  };
}
