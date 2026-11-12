import React, { useMemo, useState } from 'react';
import {
  Activity, ArrowRight, BookOpen, BrainCircuit, CalendarDays, CheckSquare,
  GitBranch, MessageSquareText, Target
} from 'lucide-react';
import { buildDashboardSnapshot } from './dashboardModel';

const dateLabel=at=>at===null?'Дата не сохранена':
  new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'})
    .format(new Date(at));
const dayLabel=day=>new Intl.DateTimeFormat('ru-RU',{
  day:'numeric',month:'short',timeZone:'UTC'
}).format(new Date(day+'T12:00:00Z'));
const goalDue=day=>day?new Intl.DateTimeFormat('ru-RU',{
  day:'numeric',month:'long',year:'numeric',timeZone:'UTC'
}).format(new Date(day+'T12:00:00Z')):'Без срока';

/** A quiet activity overview sourced only from explicitly stored objects. */
export default function Dashboard({
  sessions=[],goals=[],diaryNotes=[],onOpenGoal,onOpenSession,
  onOpenJourney,onOpenMindspace,onOpenDiary,onOpenDiaryNote,onNewSession,nowMs
}){
  const [days,setDays]=useState(7);
  const snapshot=useMemo(()=>buildDashboardSnapshot({
    sessions,goals,diaryNotes,days,nowMs
  }),[sessions,goals,diaryNotes,days,nowMs]);
  const maxCount=Math.max(1,...snapshot.activity.map(day=>day.total));
  const hasAny=sessions.length>0||goals.length>0||diaryNotes.length>0;
  const hasPeriodEvents=snapshot.eventCounts.total>0;
  return (
    <section className="reflect-dashboard" aria-label="Личный обзор Reflect">
      <header className="reflect-dashboard-header">
        <div>
          <h2>Главная</h2>
          <p>Что сейчас важно, какие решения приняты и к каким темам вы возвращались. Только сохранённые факты.</p>
        </div>
        <div className="reflect-dashboard-header-links">
          {onOpenMindspace&&(
            <button type="button" onClick={onOpenMindspace}>
              <BrainCircuit size={17} aria-hidden="true"/> Mindspace
            </button>
          )}
          {onOpenJourney&&(
            <button type="button" onClick={onOpenJourney}>
              <GitBranch size={17} aria-hidden="true"/> Карта пути
            </button>
          )}
        </div>
      </header>
      {snapshot.sourceTruncated&&(
        <p role="status" className="reflect-dashboard-note">
          Часть событий не вошла в текущий лимит аналитической проекции.
          Показатели неполные; исходные записи не изменены.
        </p>
      )}
      {!hasAny?(
        <div className="reflect-dashboard-empty" role="status">
          <h3>Ваше пространство пока пусто</h3>
          <p>Начните с собственной мысли или цели. Reflect не создаёт результаты без вашего участия.</p>
          {onNewSession&&<button type="button" onClick={onNewSession}>Начать сеанс</button>}
        </div>
      ):(
        <>
          <section className="reflect-dashboard-section" aria-label="Что сейчас важно">
            <div className="reflect-dashboard-section-heading">
              <h3><Target size={19} aria-hidden="true"/> Что сейчас важно</h3>
              {onOpenGoal&&<span>Открыть конкретную цель можно из карточки</span>}
            </div>
            {snapshot.activeGoals.length?(
              <div className="reflect-dashboard-goal-grid">
                {snapshot.activeGoals.slice(0,4).map(goal=>(
                  <article key={goal.id} className="reflect-dashboard-goal">
                    <small>{goal.status==='paused'?'На паузе':'В работе'} · {goalDue(goal.dueDay)}</small>
                    <h4>{goal.title}</h4>
                    {goal.nextStep&&<p>Следующий отмеченный вами шаг: <strong>{goal.nextStep}</strong></p>}
                    {goal.stepsTotal>0&&<p>Шаги: {goal.stepsDone} из {goal.stepsTotal} отмечены выполненными, без привязки к периоду</p>}
                    {onOpenGoal&&<button type="button" onClick={()=>onOpenGoal(goal.id)}>
                      Открыть цель <ArrowRight size={15} aria-hidden="true"/>
                    </button>}
                  </article>
                ))}
              </div>
            ):(
              <p className="reflect-dashboard-section-empty">
                Активных целей нет. Это не означает отсутствие прогресса или неудачу.
              </p>
            )}
          </section>
          <section className="reflect-dashboard-section" aria-label="Подтверждённая активность">
            <div className="reflect-dashboard-section-heading">
              <h3><Activity size={19} aria-hidden="true"/> Подтверждённая активность</h3>
              <div className="reflect-dashboard-period" role="group" aria-label="Период активности">
                {[7,30].map(value=>(
                  <button type="button" key={value} aria-pressed={days===value}
                    onClick={()=>setDays(value)}>{value} дней</button>
                ))}
              </div>
            </div>
            <p className="reflect-dashboard-note">Календарные дни UTC. Считаются только сохранённые решения, наблюдения и записи дневника с датой. Не оценивается психическое здоровье.</p>
            {hasPeriodEvents?(
              <>
                <div className="reflect-dashboard-metrics" aria-label="Подтверждённые события за период">
                  <p><strong>{snapshot.eventCounts.acceptedDecisions}</strong> принятых решений</p>
                  <p><strong>{snapshot.eventCounts.returns}</strong> возвращений к темам</p>
                  <p><strong>{snapshot.eventCounts.diaryEntries}</strong> собственных записей</p>
                </div>
                <div className="reflect-dashboard-activity-chart" role="img"
                  aria-label={`Активность за ${days} дней: ${snapshot.eventCounts.total} сохранённых событий. По одному столбцу на календарный день.`}>
                  {snapshot.activity.map(day=>(
                    <div className="reflect-dashboard-activity-day" key={day.day}
                      title={`${day.day}: решений ${day.decisions}, возвращений ${day.returns}, записей ${day.notes}`}>
                      <div className="reflect-dashboard-activity-barbox">
                        <div className="reflect-dashboard-activity-bar"
                          style={{height:`${Math.max(0,Math.round(100*day.total/maxCount))}%`}}/>
                      </div>
                      {(days===7||day.day.endsWith('-01')||snapshot.activity.indexOf(day)===snapshot.activity.length-1)&&(
                        <small>{dayLabel(day.day)}</small>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ):(
              <p className="reflect-dashboard-section-empty" role="status">
                За выбранный период нет подтверждённых событий с датой. Отсутствие записей не является оценкой результата.
              </p>
            )}
            {snapshot.stepProgress&&(
              <p className="reflect-dashboard-note">
                <CheckSquare size={15} aria-hidden="true"/>
                За всё время: {snapshot.stepProgress.done} из {snapshot.stepProgress.total} шагов
                имеют отметку «выполнено». Без дат завершения мы не приписываем их последним {days} дням.
              </p>
            )}
          </section>
          <div className="reflect-dashboard-bottom-grid">
            <section className="reflect-dashboard-section" aria-label="Последние возвращения к темам">
              <div className="reflect-dashboard-section-heading">
                <h3><MessageSquareText size={19} aria-hidden="true"/> Возвращения к темам</h3>
              </div>
              {snapshot.recentReturns.length?(
                <ul className="reflect-dashboard-list">
                  {snapshot.recentReturns.map(item=>(
                    <li key={item.id}>
                      <small>{item.sessionTitle} · {dateLabel(item.at)}
                        {item.timestampSource==='client-device'?' (время устройства)':''}
                      </small>
                      <p>{item.text}</p>
                      {onOpenSession&&<button type="button"
                        onClick={()=>onOpenSession(item.sessionId)}>Открыть сеанс</button>}
                    </li>
                  ))}
                </ul>
              ):<p className="reflect-dashboard-section-empty">Вы ещё не сохранили наблюдений при возвращении к темам.</p>}
            </section>
            <section className="reflect-dashboard-section" aria-label="Собственные записи дневника">
              <div className="reflect-dashboard-section-heading">
                <h3><BookOpen size={19} aria-hidden="true"/> Записи дневника</h3>
              </div>
              {snapshot.recentNotes.length?(
                <ul className="reflect-dashboard-list">
                  {snapshot.recentNotes.map(note=>(
                    <li key={note.id}>
                      <small>{note.title} · {dateLabel(note.at)}</small>
                      <p>{note.text}</p>
                      {onOpenDiaryNote&&<button type="button"
                        onClick={()=>onOpenDiaryNote(note.sourceRef)}>
                        Открыть запись <ArrowRight size={15} aria-hidden="true"/>
                      </button>}
                    </li>
                  ))}
                </ul>
              ):<p className="reflect-dashboard-section-empty">Записей дневника пока нет.</p>}
              {snapshot.recentNotes.length>0&&onOpenDiary&&(
                <button type="button" className="reflect-dashboard-section-link"
                  onClick={onOpenDiary}>Открыть дневник <ArrowRight size={15}/></button>
              )}
            </section>
          </div>
        </>
      )}
      <p className="reflect-dashboard-disclaimer">
        Данные об активности — записи, а не оценка личности. Время возвращений указано
        по устройству; несохранённые ответы и неподтверждённые AI-гипотезы не учитываются.
      </p>
    </section>
  );
}
