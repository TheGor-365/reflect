import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReflectSelect from '../../components/ReflectSelect';
import SmoothDisclosure from '../../components/common/SmoothDisclosure';
import ReflectContentIcon from '../../components/common/ReflectContentIcon';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GitBranch, Maximize2, Minus, Plus, RotateCcw, MessageSquareText,
  Bot, Clock3, CheckCircle2, RefreshCw, ListChecks, Lightbulb } from 'lucide-react';
import {
  projectJourney, filterJourney, journeyFacts, journeyCoverage, layoutJourney, journeyDate
} from './journeyModel';
import { summarizeOwnerHypothesisRatings } from './hypothesisStatistics';
import { isArchivedRecord } from '../Archive/archiveSelectors';

const KINDS = [
  ['all','Все события'],['dialogue','Диалог'],
  ['decisions','Предложения и решения'],['actions','Цели и шаги'],
  ['returns','Возвращения']
];
const STATUSES = [
  ['all','Любой статус'],['confirmed','Подтверждено'],
  ['open','Открыто'],['proposed','AI-предложения'],
  ['dismissed','Отклонено']
];
const PERIODS = [['all','За всё время'],['7d','7 дней'],['30d','30 дней']];
const spanLabel = ms => ms === null ? 'Недостаточно дат'
  : ms < 3600000 ? `${Math.round(ms/60000)} мин`
    : ms < 86400000 ? `${Math.round(ms/3600000*10)/10} ч`
      : `${Math.round(ms/86400000*10)/10} дн`;
const TYPE = {
  session:'Тема',turn:'Сообщение',proposal:'AI-предложение',
  decision:'Решение',goal:'Цель',step:'Шаг',return:'Возвращение'
};
const STATUS = {
  stored:'Сохранено',authored:'Слова пользователя',
  'ai-response':'Ответ AI — не подтверждённый факт',
  proposed:'Предположение AI',saved:'Сохранено как идея',
  postponed:'Отложено',dismissed:'Отклонено',
  accepted:'Принято пользователем',active:'В работе',
  paused:'На паузе',completed:'Отмечено выполненным'
};
const describe = node => {
  const prefix = TYPE[node.type] || 'Запись';
  return `${prefix}: ${node.label}. ${STATUS[node.status] || ''}`;
};
const within = (x,min,max)=>Math.min(Math.max(x,min),max);
const scaleWidth = scale=>Math.round(scale*100);
const mobileGraph = () => typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(max-width: 600px)').matches);
const initialGraphScale = () => mobileGraph() ? .62 : .8;
const pointerDistance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const pointerMidpoint = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const GRAPH_PAD=28; // Unscaled viewport-space padding on all sides.

export default function JourneyMap({
  sessions = [], goals = [], selectedSessionId = null,
  includeArchived = false, onOpenSource
}) {
  const archiveRequested = sessions.some(session => session.id === selectedSessionId &&
    isArchivedRecord(session));
  const historyMode = includeArchived || archiveRequested;
  const mappedSessions = useMemo(() => historyMode ? sessions :
    sessions.filter(session => !isArchivedRecord(session)),[sessions,historyMode]);
  const mappedGoals = useMemo(() => historyMode ? goals :
    goals.filter(goal => !isArchivedRecord(goal)),[goals,historyMode]);
  const [sessionFilter,setSessionFilter]=useState(selectedSessionId || mappedSessions[0]?.id || '');
  const [period,setPeriod]=useState('all');
  const [kind,setKind]=useState('all');
  const [status,setStatus]=useState('all');
  const [selectedId,setSelectedId]=useState(null);
  const [scale,setScale]=useState(initialGraphScale);
  const [listOpen,setListOpen]=useState(false);
  const canvasRef=useRef(null);
  const dragRef=useRef(null);
  const touchPoints=useRef(new Map());
  const pinchRef=useRef(null);
  const pendingScroll=useRef(null);
  const lastRequestedSession=useRef(selectedSessionId);
  const mobileRef=useRef(mobileGraph());
  const graph=useMemo(()=>projectJourney(mappedSessions,mappedGoals,{
    includeArchivedRecommendations:historyMode
  }),[mappedSessions,mappedGoals,historyMode]);
  const visibleSessions=useMemo(()=>graph.nodes.filter(n=>n.type==='session'),[graph]);
  // Always show exactly one persisted session. Keep the user's manual choice
  // while it is valid; only fall back when that record is no longer available.
  const activeSessionId=visibleSessions.some(n=>n.sessionId===sessionFilter)
    ? sessionFilter
    : visibleSessions.some(n=>n.sessionId===selectedSessionId)
      ? selectedSessionId
      : mappedSessions.find(s=>visibleSessions.some(n=>n.sessionId===s.id))?.id || '';
  const projected=useMemo(()=>filterJourney(graph,{
    sessionId:activeSessionId,period,kind,status
  }),[graph,activeSessionId,period,kind,status]);
  const layout=useMemo(()=>layoutJourney(projected),[projected]);
  const facts=useMemo(()=>journeyFacts(projected,period),[projected,period]);
  const coverage=useMemo(()=>journeyCoverage(projected),[projected]);
  const hypothesisStats=useMemo(()=>summarizeOwnerHypothesisRatings(mappedSessions,{
    sessionId:activeSessionId,period
  }),[mappedSessions,activeSessionId,period]);
  const selected=projected.nodes.find(node=>node.id===selectedId) || null;
  // Respect a newly requested session, but don't erase a manual choice on
  // unrelated Firestore updates. Newly loaded sessions get a valid fallback.
  useEffect(() => {
    const preferredChanged=lastRequestedSession.current!==selectedSessionId;
    lastRequestedSession.current=selectedSessionId;
    const ids=new Set(visibleSessions.map(n=>n.sessionId));
    setSessionFilter(previous=>
      preferredChanged && ids.has(selectedSessionId) ? selectedSessionId
        : ids.has(previous) ? previous
          : ids.has(selectedSessionId) ? selectedSessionId
            : mappedSessions.find(s=>ids.has(s.id))?.id || '');
  },[selectedSessionId,graph,mappedSessions,visibleSessions]);
  useEffect(() => {
    setSelectedId(value=>projected.nodes.some(node=>node.id===value)?value:null);
  },[projected]);
  useEffect(()=>{
    pendingScroll.current=null;
    if(canvasRef.current){
      canvasRef.current.scrollLeft=0;
      canvasRef.current.scrollTop=0;
    }
  },[activeSessionId,period,kind,status]);
  // Restore the same visual anchor after the scaled scroll surface is sized.
  useLayoutEffect(()=>{
    if(!pendingScroll.current || !canvasRef.current) return;
    canvasRef.current.scrollLeft=pendingScroll.current.left;
    canvasRef.current.scrollTop=pendingScroll.current.top;
    pendingScroll.current=null;
  },[scale,layout.width,layout.height]);
  // A desktop-to-mobile resize should initialize a legible two-node overview.
  // User-controlled zoom stays untouched within either breakpoint.
  useEffect(()=>{
    const onResize=()=>{
      const mobile=mobileGraph();
      if(mobile!==mobileRef.current){
        mobileRef.current=mobile;
        touchPoints.current.clear();
        pinchRef.current=null;
        dragRef.current=null;
        pendingScroll.current=null;
        setScale(mobile?.62:.8);
        if(canvasRef.current){
          canvasRef.current.scrollLeft=0;
          canvasRef.current.scrollTop=0;
        }
      }
    };
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);
  // Panning moves the viewport's real scroll offsets, not an unbounded
  // transform that can place source nodes outside the reachable area.
  const move=(dx,dy)=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    canvas.scrollLeft-=dx;
    canvas.scrollTop-=dy;
  };
  // Preserve the viewport center when zooming via the accessible controls.
  const zoom=direction=>{
    const next=within(Math.round((scale+direction)*100)/100,.45,1.45);
    const canvas=canvasRef.current;
    if(next===scale)return;
    if(canvas){
      const rect=canvas.getBoundingClientRect();
      const cx=canvas.clientWidth/2 || rect.width/2;
      const cy=canvas.clientHeight/2 || rect.height/2;
      const worldX=(canvas.scrollLeft+cx-GRAPH_PAD)/scale;
      const worldY=(canvas.scrollTop+cy-GRAPH_PAD)/scale;
      pendingScroll.current={
        left:GRAPH_PAD+worldX*next-cx,
        top:GRAPH_PAD+worldY*next-cy
      };
    }
    setScale(next);
  };
  const reset=()=>{
    touchPoints.current.clear();
    pinchRef.current=null;dragRef.current=null;
    pendingScroll.current=null;
    setScale(initialGraphScale());
    if(canvasRef.current){
      canvasRef.current.scrollLeft=0;
      canvasRef.current.scrollTop=0;
    }
  };
  const startPinch=()=>{
    const points=[...touchPoints.current.values()].slice(0,2);
    const rect=canvasRef.current?.getBoundingClientRect();
    if(points.length!==2||!rect)return;
    const center=pointerMidpoint(...points);
    const distance=pointerDistance(...points);
    if(distance<8)return;
    const canvas=canvasRef.current;
    pinchRef.current={
      distance,scale,
      worldX:(canvas.scrollLeft+center.x-rect.left-GRAPH_PAD)/scale,
      worldY:(canvas.scrollTop+center.y-rect.top-GRAPH_PAD)/scale
    };
    dragRef.current=null;
  };
  const pointerDown=event=>{
    if(event.pointerType==='touch'){
      touchPoints.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(touchPoints.current.size>=2){
        startPinch();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        return;
      }
    }
    // Tapping a node selects it; dragging starts on the empty graph canvas.
    if(event.target.closest?.('button'))return;
    if(event.pointerType!=='touch'&&event.button!==0)return;
    dragRef.current={x:event.clientX,y:event.clientY,pointerId:event.pointerId};
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove=event=>{
    if(touchPoints.current.has(event.pointerId)){
      touchPoints.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    }
    if(pinchRef.current&&touchPoints.current.size>=2){
      const points=[...touchPoints.current.values()].slice(0,2);
      const rect=canvasRef.current?.getBoundingClientRect();
      if(!rect)return;
      const center=pointerMidpoint(...points);
      const next=within(
        Math.round(pinchRef.current.scale*
          pointerDistance(...points)/pinchRef.current.distance*100)/100,
        .45,1.45
      );
      const anchor={
        left:GRAPH_PAD+pinchRef.current.worldX*next-(center.x-rect.left),
        top:GRAPH_PAD+pinchRef.current.worldY*next-(center.y-rect.top)
      };
      if(next===scale){
        canvasRef.current.scrollLeft=anchor.left;
        canvasRef.current.scrollTop=anchor.top;
      }else{
        pendingScroll.current=anchor;
        setScale(next);
      }
      return;
    }
    const drag=dragRef.current;
    if(!drag||drag.pointerId!==event.pointerId)return;
    move(event.clientX-drag.x,event.clientY-drag.y);
    dragRef.current={...drag,x:event.clientX,y:event.clientY};
  };
  const pointerEnd=event=>{
    touchPoints.current.delete(event.pointerId);
    if(pinchRef.current) {
      // Avoid a jump from pinch to drag until the next deliberate touch.
      pinchRef.current=null;
      dragRef.current=null;
    }
    if(dragRef.current?.pointerId===event.pointerId)dragRef.current=null;
  };
  const follow=node=>node?.sourceRef && onOpenSource?.(node.sourceRef);
  const setAndReset=setter=>value=>{
    setter(value);
    setSelectedId(null);
  };
  const title='Карта пути: сохранённые события и подтверждённые связи';
  return (
    <section className="reflect-journey" aria-label={title}>
      <header className="reflect-journey-header">
        <div>
          <h2><GitBranch size={24} aria-hidden="true"/> Карта пути</h2>
        </div>
      </header>
      {mappedSessions.some(session=>session.id===activeSessionId && isArchivedRecord(session)) &&
        <p role="status" className="reflect-journey-note">Архивная тема · карта доступна только для чтения</p>}
      <div className="reflect-journey-filters" role="group" aria-label="Фильтры карты">
        <ReflectSelect label="Тема" ariaLabel="Тема карты"
          value={activeSessionId} onChange={setAndReset(setSessionFilter)}
          options={visibleSessions.map(
            session => [session.sessionId, session.label]
          )}/>
        <ReflectSelect label="Период" ariaLabel="Период карты"
          value={period} onChange={setAndReset(setPeriod)} options={PERIODS}/>
        <ReflectSelect label="Тип" ariaLabel="Тип событий"
          value={kind} onChange={setAndReset(setKind)} options={KINDS}/>
        <ReflectSelect label="Статус" ariaLabel="Статус событий"
          value={status} onChange={setAndReset(setStatus)} options={STATUSES}/>
      </div>
      {projected.nodes.length===0||!projected.nodes.some(n=>n.type!=='session') ? (
        <div className="reflect-journey-empty" role="status">
          <strong>{mappedSessions.length===0
              ? (sessions.length===0?'Пока нет сохранённых сеансов':'Пока нет текущих сеансов')
              : 'Нет событий под выбранные фильтры'}</strong>
          <p>Начните сеанс и явно сохраните его. AI-предложения без решения не становятся достижениями; старые данные не изменяются.</p>
          {(period!=='all'||kind!=='all'||status!=='all')&&(
            <button type="button" onClick={()=>{
              setPeriod('all');setKind('all');setStatus('all');
            }}>Показать все события</button>
          )}
        </div>
      ) : (
        <>
          <div className="reflect-journey-fact-strips"
            aria-label="Краткие показатели выбранной темы">
            {[
              ['session','Ваши сообщения',coverage.authored],
              ['reflection','Ответы Reflect',coverage.aiReplies],
              ['recommendation','Идеи AI',coverage.proposed],
              ['goal','Ваши решения',facts.acceptedDecisions],
              ['return','Возвращения',facts.returns],
              ['goal','Выполненные шаги',
                facts.stepProgress
                  ? `${facts.stepProgress.done}/${facts.stepProgress.total}`
                  : '—']
            ].map(([kind,label,value])=>(
              <div className="reflect-journey-fact-strip" key={label}>
                <ReflectContentIcon kind={kind} size={17}/>
                <span><strong>{value}</strong><small>{label}</small></span>
              </div>
            ))}
          </div>
          {hypothesisStats.reviewed>0 && (
            <SmoothDisclosure
              className="reflect-journey-hypothesis-stats"
              label={`Оценки гипотез · ${hypothesisStats.reviewed} из ${hypothesisStats.reviewable}`}
              iconKind="information">
              <p className="reflect-journey-hypothesis-summary">
                Похоже: {hypothesisStats.match} · частично: {hypothesisStats.partial}
                {' '}· не похоже: {hypothesisStats.miss}
              </p>
              <div className="reflect-journey-hypothesis-meter"
                role="img" aria-label={`Оценки: ${hypothesisStats.counts.join(', ')} от совсем мимо до очень точно`}>
                {hypothesisStats.counts.map((count,index)=>(
                  count>0&&<span key={index} data-grade={index}
                    style={{width:`${count/hypothesisStats.reviewed*100}%`}}
                    title={['Совсем мимо','Скорее мимо','Частично похоже',
                      'Близко','Очень точно'][index]+': '+count}/>
                ))}
              </div>
              <p>Это ваши субъективные оценки соответствия гипотез ситуации.
                Не вероятность их истинности и не показатель профессионализма
                модели. Для изменения оценки откройте исходный ответ Reflect.</p>
            </SmoothDisclosure>
          )}
          <SmoothDisclosure label="Подробные показатели и методика"
            iconKind="information" className="reflect-journey-metrics-disclosure">
            <div className="reflect-journey-facts-table-wrap">
              <table className="reflect-journey-facts-table"
                aria-label="Фактические метрики выбранной темы">
                <caption>Что известно о вашем пути — только сохранённые события</caption>
                <thead><tr><th scope="col">Показатель</th>
                  <th scope="col">Значение</th>
                  <th scope="col">Что учитывается</th></tr></thead>
                <tbody>
                  <tr><th scope="row"><MessageSquareText size={16}/> Ваши сообщения</th>
                    <td>{coverage.authored}</td>
                    <td>Сохранённые сообщения пользователя в выбранном представлении</td></tr>
                  <tr><th scope="row"><Bot size={16}/> Ответы Reflect</th>
                    <td>{coverage.aiReplies}</td>
                    <td>Ответы модели; не подтверждение истинности её объяснений</td></tr>
                  <tr><th scope="row"><Clock3 size={16}/> Период обсуждения</th>
                    <td>{spanLabel(coverage.timespanMs)}</td>
                    <td>{coverage.complete
                      ? 'Время между первым и последним сообщением, не длительность работы над проблемой'
                      : 'Недостаточно подтверждённых дат для интервала'}</td></tr>
                  <tr><th scope="row"><Lightbulb size={16}/> Идеи AI</th>
                    <td>{coverage.proposed}</td>
                    <td>Открытые предложения, не проверенные действия</td></tr>
                  <tr><th scope="row"><CheckCircle2 size={16}/> Принятые решения</th>
                    <td>{facts.acceptedDecisions}</td>
                    <td>Только решения, подтверждённые вами</td></tr>
                  <tr><th scope="row"><RefreshCw size={16}/> Возвращения к теме</th>
                    <td>{facts.returns}</td>
                    <td>Сохранённые наблюдения о возвращении к теме</td></tr>
                  <tr><th scope="row"><ListChecks size={16}/> Выполненные шаги</th>
                    <td>{facts.stepProgress
                      ? `${facts.stepProgress.done}/${facts.stepProgress.total}` : 'Нет данных'}</td>
                    <td>{facts.stepProgress
                      ? 'Отмеченные вами шаги за всё время; дата выполнения может быть неизвестна'
                      : 'Нет подтверждённых данных; доля за период не рассчитывается'}</td></tr>
                </tbody>
              </table>
            </div>
          </SmoothDisclosure>
          {period!=='all'&&(
            <p className="reflect-journey-note">
              Фильтр периода показывает только события с датой. Шаги без собственной временной отметки не приписываются выбранной неделе или месяцу.
            </p>
          )}
          {graph.truncated&&<p role="status" className="reflect-journey-note">
            Событий больше установленного лимита отображения ({graph.nodes.length}).
            Для просмотра остальных используйте хронологию темы; данные не удалялись.
          </p>}
          <p className="reflect-journey-touch-hint">
            Перемещайте карту пальцем, раздвигайте два пальца для масштаба.
            Коснитесь узла, чтобы увидеть его источник.
          </p>
          <div className="reflect-journey-view-controls" aria-label="Навигация по карте">
            <button type="button" onClick={()=>zoom(-.1)} aria-label="Уменьшить масштаб"><Minus size={16}/></button>
            <output aria-live="off" aria-label="Масштаб">{scaleWidth(scale)}%</output>
            <button type="button" onClick={()=>zoom(.1)} aria-label="Увеличить масштаб"><Plus size={16}/></button>
            <button type="button" className="reflect-journey-pan-control" onClick={()=>move(75,0)} aria-label="Сдвинуть вправо"><ArrowRight size={16}/></button>
            <button type="button" className="reflect-journey-pan-control" onClick={()=>move(-75,0)} aria-label="Сдвинуть влево"><ArrowLeft size={16}/></button>
            <button type="button" className="reflect-journey-pan-control" onClick={()=>move(0,-75)} aria-label="Сдвинуть вверх"><ArrowUp size={16}/></button>
            <button type="button" className="reflect-journey-pan-control" onClick={()=>move(0,75)} aria-label="Сдвинуть вниз"><ArrowDown size={16}/></button>
            <button type="button" onClick={reset} aria-label="Сбросить масштаб и смещение"><RotateCcw size={16}/></button>
            <button type="button" className="reflect-journey-list-toggle"
              aria-expanded={listOpen} aria-controls="reflect-journey-accessible-list"
              onClick={()=>setListOpen(value=>!value)}>
              {listOpen?'Скрыть ленту':'Лента'}
            </button>
          </div>
          <div ref={canvasRef} className="reflect-journey-canvas" role="region"
            aria-label="Интерактивная диаграмма связей"
            tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove}
            onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
            onKeyDown={event=>{
              if(event.target!==event.currentTarget)return;
              const delta={ArrowRight:[-50,0],ArrowLeft:[50,0],
                ArrowUp:[0,50],ArrowDown:[0,-50]}[event.key];
              if(delta){event.preventDefault();move(...delta);}
            }}>
            <div className="reflect-journey-surface"
              style={{width:Math.ceil(layout.width*scale+GRAPH_PAD*2),
                height:Math.ceil(layout.height*scale+GRAPH_PAD*2)}}>
              <div className="reflect-journey-world"
                style={{width:layout.width,height:layout.height,
                  left:GRAPH_PAD,top:GRAPH_PAD,
                  transform:`scale(${scale})`}}>
              <svg width={layout.width} height={layout.height}
                className="reflect-journey-lines" aria-hidden="true">
                <defs>
                  <marker id="reflect-journey-arrow" markerWidth="8" markerHeight="8"
                    refX="6" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6" fill="none" stroke="currentColor" strokeWidth="1.3"/>
                  </marker>
                </defs>
                {layout.edges.map(edge=>{
                  const middle=Math.max(35,Math.abs(edge.x2-edge.x1)/2);
                  const d=`M${edge.x1},${edge.y1} C${edge.x1+middle},${edge.y1} ${edge.x2-middle},${edge.y2} ${edge.x2},${edge.y2}`;
                  return <path key={edge.id} d={d}
                    markerEnd="url(#reflect-journey-arrow)" className="reflect-journey-connector"/>;
                })}
              </svg>
              {layout.nodes.map(node=>(
                <button type="button" key={node.id}
                  className={`reflect-journey-node reflect-journey-node--${node.type} reflect-journey-node--${node.status}${selectedId===node.id?' is-selected':''}`}
                  style={{left:node.x,top:node.y,width:node.width,minHeight:node.height}}
                  onClick={()=>setSelectedId(node.id)}
                  aria-pressed={selectedId===node.id}
                  aria-label={describe(node)}>
                  <small>
                    {node.type==='turn'
                      ? node.author==='ai'
                        ? <Bot size={14} aria-hidden="true"/>
                        : <MessageSquareText size={14} aria-hidden="true"/>
                      : <ReflectContentIcon
                        kind={node.type==='proposal'?'recommendation':
                          node.type==='goal'||node.type==='step'?'goal':
                          node.type==='return'?'return':
                          node.type==='session'?'session':'reflection'}
                        size={14}/>}
                    {node.type==='turn'
                      ? (node.author==='ai'?'Reflect · ответ':'Вы · сообщение')
                      : TYPE[node.type]} · {STATUS[node.status]}</small>
                  <span>{node.label}</span>
                </button>
              ))}
              </div>
            </div>
          </div>
          <div id="reflect-journey-accessible-list"
            className={`reflect-journey-mobile-list${listOpen?' is-open':''}`}
            aria-label="Доступная лента узлов">
            <h3>Лента карты</h3>
            <ol>{projected.nodes.filter(n=>n.type!=='session').map(node=>(
              <li key={node.id}>
                <button type="button" aria-pressed={selectedId===node.id}
                  onClick={()=>setSelectedId(node.id)}>
                  <small>{TYPE[node.type]} · {journeyDate(node.timestampMs)}</small>
                  <strong>{node.label}</strong>
                  <span>{STATUS[node.status]}</span>
                </button>
              </li>
            ))}</ol>
          </div>
          {selected&&(
            <aside key={selected.id}
              className="reflect-journey-source reflect-journey-source--animated"
              aria-label="Источник выбранного события">
              <div>
                <h3>{TYPE[selected.type]} — {selected.label}</h3>
                <p>{STATUS[selected.status]}. Источник: {selected.author==='ai'
                  ? 'ответ модели' : selected.author==='user' ? 'запись пользователя' : 'сохранённый сеанс'}.</p>
                <p>Дата: {journeyDate(selected.timestampMs)}
                  {selected.timestampSource==='client-device'?' (время устройства)':''}</p>
                {selected.rationale&&<p>Обоснование AI: {selected.rationale}. Это предложение, не проверенное событие.</p>}
              </div>
              <button type="button" onClick={()=>follow(selected)}>
                <Maximize2 size={16} aria-hidden="true"/> Открыть источник
              </button>
            </aside>
          )}
          <SmoothDisclosure label="Что означают линии и связи"
            iconKind="information" className="reflect-journey-methodology">
            <p>Линия «содержит» показывает принадлежность сеансу.
              «Принято как цель» означает связь с подтверждённым
              пользовательским решением. Пропущенные события нельзя
              восстановить догадкой.</p>
          </SmoothDisclosure>
        </>
      )}
    </section>
  );
}
