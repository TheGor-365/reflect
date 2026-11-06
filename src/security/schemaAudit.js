/**
 * Stage 03G — read-only, aggregate-only schema compatibility inventory.
 *
 * Input must be the already validated, UID-scoped in-memory owner export.
 * Do not print raw field names, values, document IDs, paths, user IDs, or
 * any full document. This is NOT a schema migration or permission check.
 */
const KNOWN_FIELDS = Object.freeze({
  profiles: new Set(['name', 'age', 'gender', 'createdAt', 'updatedAt']),
  diaryNotes: new Set([
    'title', 'entries', 'createdAt', 'updatedAt', 'sessionId', 'source',
    'sessionTitle'
  ]),
  moods: new Set(['mood', 'intensity', 'comment', 'createdAt', 'updatedAt']),
  goals: new Set([
    'text', 'purpose', 'type', 'status', 'completed', 'completedAt',
    'dueDay', 'dueDate', 'deadline', 'createdAt', 'updatedAt',
    'subItems', 'reflections', 'checklistFeedback', 'sessionTitle',
    'sessionId', 'lastEditedAt', 'description'
  ]),
  sessions: new Set([
    'title', 'chatHistory', 'recommendations', 'exercises', 'createdAt',
    'updatedAt', 'summary', 'sessionTitle'
  ])
});
const COLLECTIONS = Object.freeze(['profiles', 'diaryNotes', 'moods', 'goals', 'sessions']);
const LIMIT_DOCS = 10000;
const WARNING_BYTES = 750000;
const DOCUMENT_BYTES = 900000;
const MAX_ENTRY_TEXT = 20000;
const MAX_TITLE = 240;
const textEncoder = new TextEncoder();

const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const integer = value => Number.isSafeInteger(value);
const timestamp = value => plain(value) &&
  value.__reflectFirestoreType === 'timestamp' &&
  integer(value.seconds) && integer(value.nanoseconds);

// A privacy-safe, per-document compatibility signal, not a ban on legacy
// records. Unknown shapes are intentionally flagged for manual review,
// never changed, discarded, rejected, or displayed.
function inspectFields(kind, fields) {
  let unexpectedTopLevelFields = 0;
  for (const key of Object.keys(fields)) {
    if (!KNOWN_FIELDS[kind].has(key)) unexpectedTopLevelFields++;
  }
  let shapeWarnings = 0;
  let noteVersions = 0;
  let legacyEntries = 0;
  if (kind === 'profiles') {
    if (typeof fields.name !== 'string' || fields.name.length > 80) shapeWarnings++;
    if (fields.age !== undefined && fields.age !== '' &&
        !(integer(fields.age) && fields.age >= 1 && fields.age <= 120)) shapeWarnings++;
    if (fields.gender !== undefined &&
        !['не указан', 'мужской', 'женский'].includes(fields.gender)) shapeWarnings++;
  } else if (kind === 'diaryNotes') {
    if (fields.title !== undefined &&
        (typeof fields.title !== 'string' || fields.title.length > MAX_TITLE)) shapeWarnings++;
    if (!Array.isArray(fields.entries) || fields.entries.length === 0) {
      shapeWarnings++;
    } else {
      for (const entry of fields.entries) {
        if (!plain(entry) || typeof entry.text !== 'string' ||
            !entry.text.trim() || entry.text.length > MAX_ENTRY_TEXT) {
          shapeWarnings++;
          continue;
        }
        if (!integer(entry.version) || entry.version < 1) legacyEntries++;
        if (entry.displayTitle !== undefined &&
            (typeof entry.displayTitle !== 'string' || entry.displayTitle.length > MAX_TITLE)) {
          shapeWarnings++;
        }
        if (entry.versions !== undefined) {
          if (!Array.isArray(entry.versions)) {
            shapeWarnings++;
          } else {
            noteVersions += entry.versions.length;
            if (entry.versions.some(item => !plain(item) ||
                typeof item.text !== 'string' || item.text.length > MAX_ENTRY_TEXT ||
                (item.title !== undefined && typeof item.title !== 'string') ||
                (item.savedAt !== undefined && !timestamp(item.savedAt)))) {
              shapeWarnings++;
            }
          }
        }
      }
    }
  } else if (kind === 'moods') {
    if (typeof fields.mood !== 'string' ||
        !['happy', 'content', 'neutral', 'sad', 'anxious'].includes(fields.mood)) shapeWarnings++;
    if (!integer(fields.intensity) || fields.intensity < 1 || fields.intensity > 5) shapeWarnings++;
    if (fields.comment !== undefined && typeof fields.comment !== 'string') shapeWarnings++;
  } else if (kind === 'goals') {
    if (typeof fields.text !== 'string' || !fields.text.trim() ||
        fields.text.length > MAX_TITLE) shapeWarnings++;
    if (fields.type !== undefined && !['reflection', 'checklist'].includes(fields.type)) shapeWarnings++;
    if (fields.subItems !== undefined && !Array.isArray(fields.subItems)) shapeWarnings++;
    if (fields.reflections !== undefined && !Array.isArray(fields.reflections)) shapeWarnings++;
  } else if (kind === 'sessions') {
    if (typeof fields.title !== 'string' || !fields.title.trim()) shapeWarnings++;
    if (!Array.isArray(fields.chatHistory)) shapeWarnings++;
  }
  return { unexpectedTopLevelFields, shapeWarnings, noteVersions, legacyEntries };
}

function emptyBucket() {
  return {
    documents: 0, unknownFields: 0, shapeWarnings: 0,
    oversizedDocuments: 0, nearLimitDocuments: 0,
    noteVersions: 0, legacyEntries: 0
  };
}

function kindFromPath(path, expectedUid) {
  if (typeof path !== 'string') throw new Error('Неподдерживаемая структура документа.');
  const segments = path.split('/');
  if (segments.length !== 6 || segments[0] !== 'artifacts' ||
      segments[1] !== 'reflect-8fdc8' || segments[2] !== 'users' ||
      segments[3] !== expectedUid || !COLLECTIONS.includes(segments[4]) || !segments[5]) {
    throw new Error('Неизвестное расположение документа. Анализ отменён.');
  }
  if (segments[4] === 'profiles' && segments[5] !== 'userProfile') {
    throw new Error('Неизвестный профиль. Анализ отменён.');
  }
  return segments[4];
}

export function auditOwnerSchema(inspection) {
  if (!inspection || inspection.namespace !== 'reflect-8fdc8' ||
      typeof inspection.uid !== 'string' || !inspection.uid ||
      !Array.isArray(inspection.documents) || inspection.documents.length > LIMIT_DOCS) {
    throw new Error('Сначала проверьте поддерживаемый архив текущего аккаунта.');
  }
  const buckets = Object.fromEntries(COLLECTIONS.map(name => [name, emptyBucket()]));
  for (const item of inspection.documents) {
    const kind = kindFromPath(item?.path, inspection.uid);
    if (!plain(item.fields)) {
      throw new Error('Неверная структура документа. Анализ отменён.');
    }
    const bucket = buckets[kind];
    bucket.documents++;
    const findings = inspectFields(kind, item.fields);
    bucket.unknownFields += findings.unexpectedTopLevelFields;
    bucket.shapeWarnings += findings.shapeWarnings;
    bucket.noteVersions += findings.noteVersions;
    bucket.legacyEntries += findings.legacyEntries;
    // Aggregate size only. Never include the serialized document in output.
    const size = textEncoder.encode(JSON.stringify(item.fields)).byteLength;
    if (size > DOCUMENT_BYTES) bucket.oversizedDocuments++;
    else if (size > WARNING_BYTES) bucket.nearLimitDocuments++;
  }
  const totals = COLLECTIONS.reduce((sum, name) => {
    const bucket = buckets[name];
    for (const key of Object.keys(sum)) sum[key] += bucket[key] || 0;
    return sum;
  }, {
    documents: 0, unknownFields: 0, shapeWarnings: 0,
    oversizedDocuments: 0, nearLimitDocuments: 0,
    noteVersions: 0, legacyEntries: 0
  });
  return {
    format: 'reflect-aggregate-schema-audit-v1',
    collectionSummary: buckets,
    totals,
    // "No warnings" is NOT a production readiness assertion: a snapshot can
    // contain 0 entries for a whole collection or omit legacy data.
    reviewedCollections: COLLECTIONS.filter(name => buckets[name].documents > 0).length,
    requiresManualReview: totals.unknownFields > 0 ||
      totals.shapeWarnings > 0 || totals.oversizedDocuments > 0 ||
      totals.nearLimitDocuments > 0 || totals.legacyEntries > 0
  };
}
