/**
 * Read-only, UID-scoped timeline projection. It deliberately makes NO Firestore
 * writes and never changes a source document. Missing/unresolved timestamps stay
 * visible in an undated group rather than being assigned an invented date.
 */
export type DiarySource = 'session' | 'goal' | 'mood' | 'note';
export type DiaryFilter = DiarySource | 'all';
export type LegacyRecord = Record<string, unknown>;

export interface DiaryTimelineEvent {
  id: string;
  type: DiarySource;
  sourceKind: DiarySource;
  sourceId: string;
  eventKey: string;
  createdAt: unknown;
  displayAt: Date | null;
  parentSessionId: string | null;
  isPending: boolean;
  isAppend: boolean;
  entryIndex: number | null;
  data: LegacyRecord;
}

export interface DiaryTimelineGroup {
  key: string;
  title: string;
  entries: DiaryTimelineEvent[];
  isUndated: boolean;
}

interface Collections {
  sessions?: LegacyRecord[];
  goals?: LegacyRecord[];
  moods?: LegacyRecord[];
  diaryNotes?: LegacyRecord[];
}
interface FilterOptions {
  kind?: DiaryFilter;
  query?: string;
  from?: string; // YYYY-MM-DD in the viewer's local calendar
  to?: string;
  timeZone?: string;
}

function asRecord(value: unknown): LegacyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as LegacyRecord : {};
}

function asRecords(value: unknown): LegacyRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function sourceId(record: LegacyRecord, index: number, kind: DiarySource): string {
  return typeof record.id === 'string' && record.id.length > 0
    ? record.id : `unidentified-${kind}-${index}`;
}

export function timestampDate(value: unknown): Date | null {
  try {
    const candidate = value instanceof Date ? value
      : value && typeof value === 'object' && 'toDate' in value &&
        typeof value.toDate === 'function' ? value.toDate() : null;
    return candidate instanceof Date && Number.isFinite(candidate.getTime())
      ? new Date(candidate.getTime()) : null;
  } catch {
    return null;
  }
}

function calendarParts(date: Date, timeZone?: string): string {
  if (!timeZone) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const part = (key: string) => parts.find(p => p.type === key)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return calendarParts(date);
  }
}

export function localCalendarKey(date: Date, timeZone?: string): string {
  return calendarParts(date, timeZone);
}

function makeEvent(kind: DiarySource, record: LegacyRecord, id: string,
  eventKey: string, at: unknown, parentSessionId: string | null,
  isAppend = false, entryIndex: number | null = null): DiaryTimelineEvent {
  const displayAt = timestampDate(at);
  return {
    id, type: kind, sourceKind: kind, sourceId: id, eventKey,
    createdAt: at, displayAt, parentSessionId, isPending: !displayAt,
    isAppend, entryIndex, data: record
  };
}

export function buildDiaryTimeline({
  sessions = [], goals = [], moods = [], diaryNotes = []
}: Collections): DiaryTimelineEvent[] {
  const events: DiaryTimelineEvent[] = [];
  sessions.forEach((raw, index) => {
    const record = asRecord(raw);
    const id = sourceId(record, index, 'session');
    events.push(makeEvent('session', record, id, `session:${id}`,
      record.createdAt, id));
  });
  goals.forEach((raw, index) => {
    const record = asRecord(raw);
    const id = sourceId(record, index, 'goal');
    const parent = typeof record.sessionId === 'string' ? record.sessionId : null;
    const reflections = asRecords(record.reflections);
    events.push(makeEvent('goal',
      reflections.length ? { ...record, reflections: [] } : record,
      id, `goal:${id}`, record.createdAt, parent));
    reflections.forEach((entry, reflectionIndex) => {
      events.push(makeEvent('goal', { ...record, reflections: [entry] },
        id, `goal:${id}:reflection:${reflectionIndex}`,
        entry.createdAt, parent, true));
    });
  });
  moods.forEach((raw, index) => {
    const record = asRecord(raw);
    const id = sourceId(record, index, 'mood');
    events.push(makeEvent('mood', record, id, `mood:${id}`,
      record.createdAt, null));
  });
  diaryNotes.forEach((raw, index) => {
    const record = asRecord(raw);
    const id = sourceId(record, index, 'note');
    const entries = asRecords(record.entries);
    if (!entries.length) {
      events.push(makeEvent('note', record, id, `note:${id}`,
        record.createdAt, null));
    }
    entries.forEach((entry, entryIndex) => {
      // A later note entry is a dated event of its own, not a replay of the
      // entire note under the parent's original creation date.
      events.push(makeEvent('note', { ...record, entries: [entry] },
        id, `note:${id}:entry:${entryIndex}`,
        entry.createdAt, null, entryIndex > 0, entryIndex));
    });
  });
  return events.sort((a, b) => {
    const timeDifference = (b.displayAt?.getTime() ?? -Infinity) -
      (a.displayAt?.getTime() ?? -Infinity);
    // Avoid NaN when both are pending.
    return Number.isNaN(timeDifference) || timeDifference === 0
      ? a.eventKey.localeCompare(b.eventKey) : timeDifference;
  });
}

function labelForDate(date: Date, timeZone?: string): string {
  try {
    const formatted = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      ...(timeZone ? { timeZone } : {})
    }).format(date);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return labelForDate(date);
  }
}

export function groupDiaryTimeline(
  entries: DiaryTimelineEvent[], timeZone?: string
): DiaryTimelineGroup[] {
  const groups = new Map<string, DiaryTimelineGroup>();
  for (const entry of entries) {
    const key = entry.displayAt ? localCalendarKey(entry.displayAt, timeZone) : 'undated';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: entry.displayAt ? labelForDate(entry.displayAt, timeZone)
          : 'Без даты / ожидают подтверждения',
        entries: [], isUndated: key === 'undated'
      });
    }
    groups.get(key)!.entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.isUndated) return 1;
    if (b.isUndated) return -1;
    return b.key.localeCompare(a.key);
  });
}

function searchableText(event: DiaryTimelineEvent): string {
  const data = event.data;
  const fragments = [data.title, data.text, data.comment, data.purpose];
  if (event.type === 'note') {
    fragments.push(...asRecords(data.entries).map(e => e.text));
  }
  if (event.type === 'goal') {
    fragments.push(...asRecords(data.reflections).map(e => e.text));
  }
  if (event.type === 'session') {
    fragments.push(...asRecords(data.chatHistory).map(e => e.content));
  }
  return fragments.filter((part): part is string => typeof part === 'string')
    .join(' ').toLocaleLowerCase('ru-RU');
}

export function filterDiaryTimeline(
  events: DiaryTimelineEvent[], options: FilterOptions = {}
): DiaryTimelineEvent[] {
  const kind = options.kind ?? 'all';
  const query = (options.query ?? '').trim().toLocaleLowerCase('ru-RU');
  return events.filter(event => {
    if (kind !== 'all' && kind !== event.sourceKind) return false;
    if (query && !searchableText(event).includes(query)) return false;
    if (options.from || options.to) {
      if (!event.displayAt) return false;
      const day = localCalendarKey(event.displayAt, options.timeZone);
      if (options.from && day < options.from) return false;
      if (options.to && day > options.to) return false;
    }
    return true;
  });
}
