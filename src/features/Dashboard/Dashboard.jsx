import React, { useMemo, useState } from 'react';
import {
  Activity, ArrowRight, BookOpen, CalendarDays, GitBranch,
  LayoutDashboard, ListChecks, MessageSquareText, Target
} from 'lucide-react';
import { dueDayOf } from '../Goals/goalDomain';
import { summarizeDashboard } from './dashboardModel';

const eventLabels = {
  note: 'Заметка', mood: 'Отметка настроения',
  decision: 'Принятое решение', return: 'Возвращение к теме'
};
const preview = value => typeof value === 'string'
  ? (value.length > 140 ? value.slice(0, 139) + '…' : value) : '';

export default function Dashboard({
  sessions = [], goals = [], diaryNotes = [], moods = [],
  onOpenSession, onOpenGoal, onOpenDiary, onOpenJourney
}) {
  const [days, setDays] = useState(7);
  const report = useMemo(() => summarizeDashboard({
    sessions, goals, diaryNotes, moods, days
  }), [sessions, goals, diaryNotes, moods, days]);
  const maxDay = Math.max(1, ...report.byDay.map(day => day.count));
  const openEvent = event => {
    if (['note', 'mood'].includes(event.source?.kind)) {
      onOpenDiary?.(); return;
    }
    if (event.source?.sessionId) onOpenSession?.(event.source.sessionId);
  };
  return (
    <section className="reflect-dashboard" aria-label="Главная панель Reflect">
      <header className="reflect-dashboard-header">
        <div>
          <span className="reflect-dashboard-eyebrow"><LayoutDashboard size={17} aria-hidden="true"/>
            Личная обзорная панель
          </span>
          <h2>Что сейчас важно</h2>
          <p>Ваши собственные шаги, решения и возвращения к темам — без AI-оценок личности.</p>
        </div>
        {sessions.length > 0 && onOpenJourney && (
          <button type="button" className="reflect-dashboard-link"
            onClick={() => onOpenJourney(sessions[0].id)}>
            <GitBranch size={17} aria-hidden="true"/> Открыть карту пути
          </button>
        )}
      </header>

      {report.emptyAccount ? (
        <div className="reflect-dashboard-empty">
          <h3>Ваш путь начинается с первой собственной записи</h3>
          <p>Здесь появятся только реально сохранённые заметки, цели и решения.</p>
          <div>
            <button type="button" onClick={onOpenDiary}>
              <BookOpen size={17} aria-hidden="true"/> Открыть дневник
            </button>
            <button type="button" onClick={() => onOpenGoal?.()}>
              <Target size={17} aria-hidden="true"/> Добавить цель
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="reflect-dashboard-focus" aria-labelledby="reflect-dashboard-goals">
            <div className="reflect-dashboard-section-heading">
              <h3 id="reflect-dashboard-goals"><Target size={19} aria-hidden="true"/> Текущие цели</h3>
              <button type="button" onClick={() => onOpenGoal?.()}>
                Все цели <ArrowRight size={16} aria-hidden="true"/>
              </button>
            </div>
            {report.currentGoals.length > 0 ? (
              <div className="reflect-dashboard-goal-grid">
                {report.currentGoals.slice(0, 4).map(goal => {
                  const step = report.nextSteps.find(item => item.goalId === goal.id);
                  const due = dueDayOf(goal);
                  return (
                    <article key={goal.id} className="reflect-dashboard-goal-card">
                      <span>{goal.status === 'paused' ? 'На паузе' : 'В работе'}</span>
                      <h4>{goal.text}</h4>
                      <p>{step ? 'Следующий незавершённый шаг: ' + preview(step.text)
                        : 'Добавьте или проверьте шаги этой цели.'}</p>
                      <small><CalendarDays size={14} aria-hidden="true"/>
                        {due ? 'Срок: ' + due : 'Без заданного срока'}</small>
                      <button type="button" onClick={() => onOpenGoal?.(goal.id)}>
                        Открыть цель <ArrowRight size={15} aria-hidden="true"/>
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="reflect-dashboard-placeholder">
                Активных целей пока нет. Создавайте их самостоятельно или принимайте проверенные предложения Reflect.
              </div>
            )}
          </section>

          <section className="reflect-dashboard-activity" aria-labelledby="reflect-dashboard-activity-title">
            <div className="reflect-dashboard-section-heading">
              <h3 id="reflect-dashboard-activity-title">
                <Activity size={19} aria-hidden="true"/> Подтверждённые действия
              </h3>
              <div role="group" aria-label="Период обзора">
                <button type="button" aria-pressed={days === 7}
                  onClick={() => setDays(7)}>7 дней</button>
                <button type="button" aria-pressed={days === 30}
                  onClick={() => setDays(30)}>30 дней</button>
              </div>
            </div>
            <p className="reflect-dashboard-explanation">
              Период {report.from} — {report.through}, по времени вашего устройства.
              Данные основаны на датированных сохранённых записях. Незавершённые шаги
              и ответы AI в статистику действий не входят.
            </p>
            {report.datedActions === 0 ? (
              <div className="reflect-dashboard-placeholder">
                За этот период нет датированных собственных действий. Отсутствие записи не означает отсутствие прогресса.
              </div>
            ) : (
              <>
                <div className="reflect-dashboard-stat-grid">
                  <div><strong>{report.observedDays} из {report.days}</strong><span>Дней с записями</span></div>
                  <div><strong>{report.totals.note}</strong><span>Заметок</span></div>
                  <div><strong>{report.totals.return}</strong><span>Возвращений к теме</span></div>
                  <div><strong>{report.totals.decision}</strong><span>Принятых рекомендаций</span></div>
                  <div><strong>{report.totals.mood}</strong><span>Отметок настроения</span></div>
                </div>
                <div className="reflect-dashboard-bars" role="group"
                  aria-label={'Датированные действия за ' + days + ' дней'}>
                  {report.byDay.map(day => (
                    <div key={day.day} role="img"
                      aria-label={day.day + ': ' + day.count + ' собственных действий'}
                      className="reflect-dashboard-day">
                      <div className="reflect-dashboard-day-track">
                        <span style={{ height: day.count
                          ? Math.max(9, day.count / maxDay * 100) + '%' : '0%' }}/>
                      </div>
                      <small>{day.day.slice(5)}</small>
                    </div>
                  ))}
                </div>
              </>
            )}
            {report.undatedActions > 0 && (
              <p className="reflect-dashboard-undated">
                Ещё {report.undatedActions} записей не имеют проверяемой даты и не включены в период.
              </p>
            )}
            <p className="reflect-dashboard-step-progress">
              <ListChecks size={17} aria-hidden="true"/>
              Состояние шагов сейчас: {report.allSteps
                ? report.completedSteps + ' выполнено из ' + report.allSteps + ' заданных'
                : 'Шаги ещё не заданы'}.
              Это состояние, а не оценка выполненного за выбранный период.
            </p>
          </section>

          <section className="reflect-dashboard-recent" aria-labelledby="reflect-dashboard-recent-title">
            <div className="reflect-dashboard-section-heading">
              <h3 id="reflect-dashboard-recent-title">
                <MessageSquareText size={19} aria-hidden="true"/> Последние подтверждённые события
              </h3>
              <button type="button" onClick={onOpenDiary}>
                Дневник <ArrowRight size={16} aria-hidden="true"/>
              </button>
            </div>
            {report.recentEvents.length ? (
              <ul>
                {report.recentEvents.map((event, index) => (
                  <li key={event.kind + ':' + (event.source?.sessionId ||
                    event.source?.noteId || event.source?.moodId || '') + ':' + index}>
                    <button type="button" onClick={() => openEvent(event)}>
                      <span>{eventLabels[event.kind] || 'Событие'}</span>
                      <strong>{preview(event.label)}</strong>
                      <small>{new Intl.DateTimeFormat('ru-RU', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      }).format(new Date(event.timeMs))}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="reflect-dashboard-placeholder">
                Нет датированных событий за выбранный период.
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
