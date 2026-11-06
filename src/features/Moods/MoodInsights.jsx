import React, { useMemo } from 'react';
import { Activity, CalendarDays, ShieldCheck } from 'lucide-react';
import { MOOD_SYMBOLS, summarizeMoods } from './moodInsights';

const labelDay = value => {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

export default function MoodInsights({ moods = [], isLoading = false, now }) {
  const summary = useMemo(() => summarizeMoods(moods, now || new Date()), [moods, now]);
  const maximum = Math.max(1, ...summary.days.map(day => day.total));
  return (
    <section className="reflect-mood-insights" aria-labelledby="reflect-mood-insights-title">
      <div className="reflect-mood-insights-heading">
        <span className="reflect-mood-insights-icon" aria-hidden="true">
          <Activity size={21} />
        </span>
        <div>
          <p className="reflect-overline">Только ваши отметки</p>
          <h3 id="reflect-mood-insights-title">Настроение за 7 дней</h3>
        </div>
      </div>
      <p className="reflect-mood-insights-explainer">
        Обзор ваших записей, а не оценка здоровья. Дни без отметок не считаются спокойными или тревожными.
      </p>
      {isLoading ? (
        <p role="status" className="reflect-mood-insights-empty">Загрузка записей…</p>
      ) : summary.total === 0 ? (
        <p className="reflect-mood-insights-empty">
          За последние семь календарных дней нет датированных отметок настроения.
        </p>
      ) : (
        <>
          <div className="reflect-mood-metrics" aria-label="Сводка настроений">
            <div><strong>{summary.total}</strong><span>Отметок</span></div>
            <div><strong>{summary.observedDays} / 7</strong><span>Дней с отметками</span></div>
            <div>
              <strong>{summary.averageIntensity === null ? '—' : summary.averageIntensity.toLocaleString('ru-RU')}</strong>
              <span>Средняя отмеченная интенсивность</span>
              <small>{summary.withValidIntensity} из {summary.total} отметок</small>
            </div>
          </div>
          <div className="reflect-mood-week" role="group" aria-label="Отметки по дням">
            {summary.days.map(day => (
              <div key={day.day} className="reflect-mood-week-day">
                <div className="reflect-mood-week-count" aria-hidden="true">
                  {day.total ? day.total : '—'}
                </div>
                <div className="reflect-mood-week-bar-track"
                  role="img" aria-label={`${labelDay(day.day)}: ${day.total} отметок`}>
                  <span style={{ height: day.total ? `${Math.max(10, day.total / maximum * 100)}%` : '0%' }} />
                </div>
                <span className="reflect-mood-week-date">{labelDay(day.day)}</span>
              </div>
            ))}
          </div>
          <div className="reflect-mood-categories" aria-label="Распределение по выбранным настроениям">
            {summary.categories.filter(category => category.count > 0).map(category => (
              <span className="reflect-mood-category" key={category.key}>
                <span aria-hidden="true">{MOOD_SYMBOLS[category.key]}</span>
                {category.label}: <strong>{category.count}</strong>
              </span>
            ))}
            {summary.unknownCategory > 0 && (
              <span className="reflect-mood-category">
                Без распознанной категории: <strong>{summary.unknownCategory}</strong>
              </span>
            )}
          </div>
        </>
      )}
      <div className="reflect-mood-insights-footnote">
        <ShieldCheck size={15} aria-hidden="true"/>
        <p>
          Расчёт выполняется в браузере по загруженным данным вашего аккаунта. 
          Тексты комментариев не используются.
          {summary.undatedCount > 0 &&
            ` Записей без подтверждённой даты: ${summary.undatedCount}; они не включены в семь дней.`}
        </p>
      </div>
      <div className="reflect-mood-insights-calendar" aria-hidden="true">
        <CalendarDays size={15}/> {labelDay(summary.since)} — {labelDay(summary.through)}
      </div>
    </section>
  );
}
