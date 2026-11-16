import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import AnimatedCollapse from '../../components/common/AnimatedCollapse';
import { sessionWorkProgress } from './sessionWorkProgress';

/** One compact, inspectable indicator per saved session, never per AI turn. */
export default function SessionWorkProgress({ session, goals=[] }){
  const [open,setOpen]=useState(false);
  const result=useMemo(()=>sessionWorkProgress(session,goals),[session,goals]);
  if(!session?.id)return null;
  const radius=21, circumference=2*Math.PI*radius;
  return (
    <section className="reflect-session-work" aria-label="Проработка темы сеанса">
      <button type="button" className="reflect-session-work-toggle"
        onClick={()=>setOpen(value=>!value)} aria-expanded={open}
        aria-controls="reflect-session-work-details">
        <span className="reflect-session-work-ring" role="progressbar"
          aria-label="Зафиксированная работа над темой"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.percent}>
          <svg viewBox="0 0 52 52" aria-hidden="true" focusable="false">
            <circle cx="26" cy="26" r={radius} className="reflect-session-work-track"/>
            <circle cx="26" cy="26" r={radius} className="reflect-session-work-value"
              strokeDasharray={circumference}
              strokeDashoffset={circumference*(100-result.percent)/100}/>
          </svg>
          <output>{result.percent}%</output>
        </span>
        <span className="reflect-session-work-title">Проработка темы</span>
        <ChevronDown size={14} aria-hidden="true"
          className={open?'reflect-session-work-chevron is-open':'reflect-session-work-chevron'}/>
      </button>
      <AnimatedCollapse open={open} id="reflect-session-work-details">
        <div className="reflect-session-work-breakdown">
          <table>
            <caption>Вклад сохранённых событий в показатель проработки</caption>
            <thead><tr><th scope="col">Что учтено</th>
              <th scope="col">Баллы</th><th scope="col">Максимум</th></tr></thead>
            <tbody>
              {result.rows.map(item=>(
                <tr key={item.id} title={item.source}>
                  <th scope="row">{item.label}</th>
                  <td data-positive={item.points>0}>{item.points}</td>
                  <td>{item.max}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row">Итого</th>
              <td>{result.points}</td><td>{result.max}</td></tr></tfoot>
          </table>
          <p>Процент — открытая шкала сохранённой работы над темой. Это не оценка
            человека, эффективности решения или точности AI. При удалении или
            изменении подтверждённых записей показатель может уменьшиться.</p>
        </div>
      </AnimatedCollapse>
    </section>
  );
}
