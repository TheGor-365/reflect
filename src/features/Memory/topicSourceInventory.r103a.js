/**
 * R10.3-A — deterministic, read-only inventory of possible cross-source evidence.
 *
 * IMPORTANT: The caller must independently obtain these documents through an
 * owner-authorized path. This is neither an event ledger append nor server
 * attestation, and it MUST NOT be used as provider context. Snapshots can be
 * edited later; all evidence here is explicitly marked unverified.
 *
 * No topic inference by keywords, titles, sentiment or model output.
 */
export const TOPIC_SOURCE_INVENTORY_VERSION = 1;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const isId = value => typeof value === 'string' && ID.test(value);
const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value);
const ensure = (condition, code) => { if (!condition) throw new Error(code); };

function ownerClaim(record, ownerId) {
  for (const key of ['ownerId', 'ownerUid', 'userId']) {
    if (Object.hasOwn(record, key)) {
      ensure(record[key] === ownerId, 'memory-inventory-cross-owner');
    }
  }
}

function validatedCollection(records, ownerId, kind) {
  ensure(Array.isArray(records) && records.length <= 500,
    'memory-inventory-too-many-sources');
  const result = new Map();
  for (const record of records) {
    ensure(isRecord(record) && isId(record.id),
      'memory-inventory-invalid-source');
    ownerClaim(record, ownerId);
    ensure(!result.has(record.id), 'memory-inventory-duplicate-source');
    result.set(record.id, record);
  }
  return result;
}

function preview(value, maxPreviewChars) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  return {
    textPreview: text.slice(0, maxPreviewChars),
    truncated: text.length > maxPreviewChars
  };
}

function includeSession(record, topicId) {
  if (record.topicId !== undefined && record.topicId !== null &&
      record.topicId !== '') {
    ensure(isId(record.topicId), 'memory-inventory-invalid-topic-link');
    return record.topicId === topicId ? 'explicit' : null;
  }
  return record.id === topicId ? 'session-provisional' : null;
}

/**
 * Collects source pointers, not new committed evidence. Topic membership for
 * goals/notes linked by session is only a CANDIDATE until confirmed by owner.
 * The source texts are previews only, never whole-history egress payloads.
 */
export function inventoryTopicSources({
  ownerId, topicId, sessions = [], goals = [], diaryNotes = [],
  maxItems = 200, maxPreviewChars = 480
}) {
  ensure(isId(ownerId) && isId(topicId), 'memory-inventory-invalid-scope');
  ensure(Number.isInteger(maxItems) && maxItems >= 1 && maxItems <= 500 &&
    Number.isInteger(maxPreviewChars) && maxPreviewChars >= 64 &&
    maxPreviewChars <= 1500, 'memory-inventory-invalid-budget');

  const bySessions = validatedCollection(sessions, ownerId, 'sessions');
  const byGoals = validatedCollection(goals, ownerId, 'goals');
  const byNotes = validatedCollection(diaryNotes, ownerId, 'diaryNotes');
  const eligibleSessions = new Map();
  for (const session of bySessions.values()) {
    const scope = includeSession(session, topicId);
    if (scope) eligibleSessions.set(session.id, scope);
  }

  const records = [];
  const seen = new Set();
  let omitted = 0;
  const add = ({ collection, documentId, recordId, origin,
    topicLink, content, archived = false, sourceVersion = null,
    sourceMutable = true, ...extra }) => {
    const excerpt = preview(content, maxPreviewChars);
    if (!excerpt || !isId(recordId)) return;
    const ref = { collection, documentId, recordId };
    const key = `${collection}/${documentId}/${recordId}`;
    ensure(!seen.has(key), 'memory-inventory-duplicate-record');
    seen.add(key);
    if (records.length >= maxItems) { omitted += 1; return; }
    records.push({
      candidateId: key, source: ref, origin, topicLink,
      verification: 'unverified-source-snapshot',
      requiresOwnerTopicConfirmation: topicLink === 'session-linked',
      sourceMutable, sourceVersion, archived: archived === true,
      ...excerpt, ...extra
    });
  };

  for (const [sessionId, scope] of eligibleSessions) {
    const session = bySessions.get(sessionId);
    const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
    ensure(history.length <= 2000, 'memory-inventory-history-too-large');
    const turnIds = new Set();
    for (const turn of history) {
      if (!isRecord(turn) || !isId(turn.id)) continue;
      ensure(!turnIds.has(turn.id), 'memory-inventory-duplicate-turn');
      turnIds.add(turn.id);
      if (turn.role !== 'user' && turn.role !== 'assistant') continue;
      add({ collection: 'sessions', documentId: sessionId, recordId: turn.id,
        origin: turn.role === 'user' ? 'owner-stated' : 'model-proposed',
        topicLink: scope, content: turn.content,
        archived: session.archived === true,
        sourceVersion: null, sourceMutable: true });
    }
    const visits = Array.isArray(session.returnCheckIns)
      ? session.returnCheckIns : [];
    ensure(visits.length <= 1000, 'memory-inventory-history-too-large');
    for (const visit of visits) {
      if (!isRecord(visit) || visit.author !== 'user' ||
        visit.type !== 'return-check-in') continue;
      add({ collection: 'sessions', documentId: sessionId, recordId: visit.id,
        origin: 'owner-observed', topicLink: scope, content: visit.text,
        archived: session.archived === true,
        sourceVersion: isId(visit.memoryEventId) ? visit.memoryEventId : null,
        sourceMutable: true, sourceType: 'return-check-in' });
    }
  }

  for (const goal of byGoals.values()) {
    let topicLink = null;
    if (goal.topicId !== undefined && goal.topicId !== null &&
        goal.topicId !== '') {
      ensure(isId(goal.topicId), 'memory-inventory-invalid-topic-link');
      if (goal.topicId === topicId) topicLink = 'explicit';
    } else if (isId(goal.sessionId) && eligibleSessions.has(goal.sessionId)) {
      topicLink = 'session-linked';
    }
    if (!topicLink) continue;
    add({ collection: 'goals', documentId: goal.id, recordId: goal.id,
      origin: 'owner-goal-snapshot', topicLink, content: goal.text,
      archived: goal.archived === true, sourceMutable: true,
      linkedSessionId: isId(goal.sessionId) ? goal.sessionId : null,
      goalStatus: ['active', 'paused', 'completed'].includes(goal.status)
        ? goal.status : 'unknown' });
  }

  for (const note of byNotes.values()) {
    let topicLink = null;
    if (note.topicId !== undefined && note.topicId !== null &&
        note.topicId !== '') {
      ensure(isId(note.topicId), 'memory-inventory-invalid-topic-link');
      if (note.topicId === topicId) topicLink = 'explicit';
    } else if (isId(note.sourceSessionId) &&
               eligibleSessions.has(note.sourceSessionId)) {
      topicLink = 'session-linked';
    }
    if (!topicLink) continue;
    const entries = Array.isArray(note.entries) ? note.entries : [];
    ensure(entries.length <= 2000, 'memory-inventory-history-too-large');
    for (const [index, entry] of entries.entries()) {
      if (!isRecord(entry)) continue;
      const version = Number.isSafeInteger(entry.version) && entry.version > 0
        ? entry.version : null;
      add({ collection: 'diaryNotes', documentId: note.id,
        recordId: `entry-${index}`, origin: 'owner-diary-snapshot',
        topicLink, content: entry.text, archived: note.archived === true,
        sourceMutable: true, sourceVersion: version,
        entryIndex: index });
    }
  }

  return {
    inventoryVersion: TOPIC_SOURCE_INVENTORY_VERSION,
    ownerId, topicId, ownerPathAuthorizationChecked: false,
    independentServerAttestation: false,
    providerUseAllowed: false, providerContextSent: false,
    candidateCount: records.length, omitted, records
  };
}
