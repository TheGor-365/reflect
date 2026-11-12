/**
 * PRODUCT-05A Dashboard. Read-only owner-data projection.
 * Period metrics count dated USER-AUTHORED actions only, never AI output,
 * inferred completion, missing dates, or medical/psychological scores.
 */
import { buildJourneyGraph, timestampMs } from '../SessionSchema/journeyGraph';
import { dueDayOf } from '../Goals/goalDomain';

const validText = value => typeof value === 'string' && value.trim().length > 0;
const idOk = value => typeof value === 'string' && value.length > 0;
const statusOf = goal => ['active', 'paused', 'completed'].includes(goal.status)
  ? goal.status : goal.completed === true ? 'completed' : 'active';

function deviceDay(ms) {
  const date = new Date(ms);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') +
    '-' + String(date.getDate()).padStart(2, '0');
}

function asEvent(timestamp, kind, label, source) {
  const timeMs = timestampMs(timestamp);
  return {
    kind, timeMs, label, source,
    dated: timeMs !== null
  };
}

function noteDate(note) {
  if (timestampMs(note?.createdAt) !== null) return note.createdAt;
  const entries = Array.isArray(note?.entries) ? note.entries : [];
  return entries.find(entry => timestampMs(entry?.createdAt) !== null)?.createdAt || null;
}

export function summarizeDashboard({
  sessions = [], goals = [], diaryNotes = [], moods = [],
  nowMs = Date.now(), days = 7
} = {}) {
  const span = days === 30 ? 30 : 7;
  const now = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(today.getDate() - span + 1);
  const fromMs = first.getTime();
  const throughMs = now.getTime();
  const dayKeys = [];
  for (let i = 0; i < span; i++) {
    const date = new Date(first);
    date.setDate(first.getDate() + i);
    dayKeys.push(deviceDay(date.getTime()));
  }
  const counts = new Map(dayKeys.map(key => [key, 0]));
  const dated = [];
  const undated = [];
  const push = event => {
    if (!event.dated) { undated.push(event); return; }
    if (event.timeMs < fromMs || event.timeMs > throughMs) return;
    const key = deviceDay(event.timeMs);
    if (!counts.has(key)) return;
    counts.set(key, counts.get(key) + 1);
    dated.push(event);
  };
  const validSessions = (Array.isArray(sessions) ? sessions : [])
    .filter(session => idOk(session?.id));
  const validGoals = (Array.isArray(goals) ? goals : [])
    .filter(goal => idOk(goal?.id) && validText(goal.text));
  const validNotes = (Array.isArray(diaryNotes) ? diaryNotes : [])
    .filter(note => idOk(note?.id) && (Array.isArray(note.entries)
      ? note.entries.some(entry => validText(entry?.text))
      : validText(note?.text)));
  validNotes.forEach(note => {
    const noteTitle = validText(note.title) ? note.title.trim()
      : validText(note.entries?.[0]?.text)
        ? note.entries[0].text.trim().slice(0, 70) : 'Заметка';
    push(asEvent(noteDate(note), 'note', noteTitle, {
      kind: 'note', noteId: note.id
    }));
  });
  (Array.isArray(moods) ? moods : []).forEach(mood => {
    if (!idOk(mood?.id) || !validText(mood.mood)) return;
    push(asEvent(mood.createdAt, 'mood', 'Отметка настроения', {
      kind: 'mood', moodId: mood.id
    }));
  });

  validSessions.forEach(session => {
    const graph = buildJourneyGraph(session, validGoals);
    graph.nodes.forEach(node => {
      if (node.kind === 'return') {
        push(asEvent(node.timestamp, 'return', node.label, node.sourceRef));
      }
      if (node.kind === 'decision' && node.status === 'accepted') {
        push(asEvent(node.timestamp, 'decision', node.label, node.sourceRef));
      }
      // Do not count AI messages, current step state or inferred completion
      // as a time-stamped user action.
    });
  });

  const currentGoals = validGoals.filter(goal => statusOf(goal) !== 'completed');
  currentGoals.sort((a, b) => {
    const ad = dueDayOf(a), bd = dueDayOf(b);
    return (ad && bd ? ad.localeCompare(bd)
      : ad ? -1 : bd ? 1 : 0) ||
      ((timestampMs(a.createdAt) ?? Number.POSITIVE_INFINITY) -
       (timestampMs(b.createdAt) ?? Number.POSITIVE_INFINITY));
  });
  let allSteps = 0;
  let completedSteps = 0;
  const nextSteps = [];
  validGoals.forEach(goal => {
    (Array.isArray(goal.subItems) ? goal.subItems : []).forEach((item, index) => {
      if (!validText(item?.text)) return;
      allSteps++;
      if (item.completed === true) completedSteps++;
      else if (statusOf(goal) === 'active') nextSteps.push({
        text: item.text.trim(), goalId: goal.id,
        goalTitle: goal.text, stepIndex: index
      });
    });
  });
  const byDay = dayKeys.map(day => ({ day, count: counts.get(day) || 0 }));
  const totals = { note: 0, mood: 0, decision: 0, return: 0 };
  dated.forEach(event => { totals[event.kind]++; });
  dated.sort((a, b) => b.timeMs - a.timeMs);
  return {
    days: span, from: dayKeys[0], through: dayKeys.at(-1),
    byDay, totals,
    datedActions: dated.length,
    observedDays: byDay.filter(day => day.count > 0).length,
    undatedActions: undated.length,
    currentGoals, nextSteps, allSteps, completedSteps,
    recentEvents: dated.slice(0, 6),
    emptyAccount: validSessions.length === 0 &&
      validGoals.length === 0 && validNotes.length === 0 &&
      !(Array.isArray(moods) && moods.some(item => idOk(item?.id)))
  };
}
