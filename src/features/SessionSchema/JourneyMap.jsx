import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GitBranch, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  projectJourney, filterJourney, journeyFacts, layoutJourney, journeyDate
} from './journeyModel';

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

export default function JourneyMap({
  sessions = [], goals = [], selectedSessionId = null,
  onOpenSource
}) {
  const [sessionFilter,setSessionFilter]=useState(selectedSessionId || 'all');
  const [period,setPeriod]=useState('all');
  const [kind,setKind]=useState('all');
  const [status,setStatus]=useState('all');
  const [selectedId,setSelectedId]=useState(null);
  const [scale,setScale]=useState(initialGraphScale);
  const [pan,setPan]=useState({x:8,y:8});
  const [listOpen,setListOpen]=useState(false);
  const canvasRef=useRef(null);
  const dragRef=useRef(null);
  const touchPoints=useRef(new Map());
  const pinchRef=useRef(null);
  const mobileRef=useRef(mobileGraph());
  const graph=useMemo(()=>projectJourney(sessions,goals),[sessions,goals]);
  const projected=useMemo(()=>filterJourney(graph,{
    sessionId:sessionFilter,period,kind,status
  }),[graph,sessionFilter,period,kind,status]);
  const layout=useMemo(()=>layoutJourney(projected),[projected]);
  const facts=useMemo(()=>journeyFacts(projected,period),[projected,period]);
  const selected=projected.nodes.find(node=>node.id===selectedId) || null;
  const visibleSessions=graph.nodes.filter(n=>n.type==='session');
  useEffect(() => {
    if(selectedSessionId && graph.nodes.some(n=>n.type==='session'&&n.sessionId===selectedSessionId)) {
      setSessionFilter(selectedSessionId);
    }
  },[selectedSessionId,graph]);
  useEffect(() => {
    setSelectedId(value=>projected.nodes.some(node=>node.id===value)?value:null);
  },[projected]);
  useEffect(()=>{setPan({x:8,y:8});},[sessionFilter,period,kind,status]);
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
        setScale(mobile?.62:.8);
        setPan({x:8,y:8});
      }
    };
    window.addEventListener('resize',onResize);
    return ()=>window.removeEventListener('resize',onResize);
  },[]);
  const move=(dx,dy)=>setPan(previous=>({x:previous.x+dx,y:previous.y+dy}));
  // Zoom about the viewport center instead of throwing the current graph away.
  const zoom=direction=>{
    const next=within(Math.round((scale+direction)*100)/100,.45,1.45);
    const rect=canvasRef.current?.getBoundingClientRect();
    if(rect){
      const center={x:rect.width/2,y:rect.height/2};
      const ratio=next/scale;
      setPan(previous=>({
        x:center.x-(center.x-previous.x)*ratio,
        y:center.y-(center.y-previous.y)*ratio
      }));
    }
    setScale(next);
  };
  const reset=()=>{
    touchPoints.current.clear();
    pinchRef.current=null;dragRef.current=null;
    setScale(initialGraphScale());setPan({x:8,y:8});
  };
  const startPinch=()=>{
    const points=[...touchPoints.current.values()].slice(0,2);
    const rect=canvasRef.current?.getBoundingClientRect();
    if(points.length!==2||!rect)return;
    const center=pointerMidpoint(...points);
    const distance=pointerDistance(...points);
    if(distance<8)return;
    pinchRef.current={
      distance,scale,
      worldX:(center.x-rect.left-pan.x)/scale,
      worldY:(center.y-rect.top-pan.y)/scale
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
      setScale(next);
      setPan({
        x:center.x-rect.left-pinchRef.current.worldX*next,
        y:center.y-rect.top-pinchRef.current.worldY*next
      });
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
          <p>От вопроса к решению и собственным действиям. Связи показываются только при наличии источника.</p>
        </div>
        <span className="reflect-journey-version">Факты, не AI-оценка личности</span>
      </header>
      <div className="reflect-journey-filters" role="group" aria-label="Фильтры карты">
        <label>Тема
          <select aria-label="Тема карты" value={sessionFilter}
            onChange={event=>setAndReset(setSessionFilter)(event.target.value)}>
            <option value="all">Все темы</option>
            {visibleSessions.map(session=>(
              <option key={session.id} value={session.sessionId}>{session.label}</option>
            ))}
          </select>
        </label>
        <label>Период
          <select aria-label="Период карты" value={period}
            onChange={event=>setAndReset(setPeriod)(event.target.value)}>
            {PERIODS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>Тип
          <select aria-label="Тип событий" value={kind}
            onChange={event=>setAndReset(setKind)(event.target.value)}>
            {KINDS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>Статус
          <select aria-label="Статус событий" value={status}
            onChange={event=>setAndReset(setStatus)(event.target.value)}>
            {STATUSES.map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      {projected.nodes.length===0||!projected.nodes.some(n=>n.type!=='session') ? (
        <div className="reflect-journey-empty" role="status">
          <strong>{sessions.length===0?'Пока нет сохранённых сеансов':'Нет событий под выбранные фильтры'}</strong>
          <p>Начните сеанс и явно сохраните его. AI-предложения без решения не становятся достижениями; старые данные не изменяются.</p>
          {(period!=='all'||kind!=='all'||status!=='all')&&(
            <button type="button" onClick={()=>{
              setPeriod('all');setKind('all');setStatus('all');
            }}>Показать все события</button>
          )}
        </div>
      ) : (
        <>
          <div className="reflect-journey-evidence" aria-label="Факты по отфильтрованным данным">
            <p><strong>{facts.acceptedDecisions}</strong> подтверждённых решений</p>
            <p><strong>{facts.returns}</strong> собственных возвращений</p>
            <p>{facts.stepProgress
              ? <><strong>{facts.stepProgress.done}/{facts.stepProgress.total}</strong> шагов отмечены выполненными, за всё время</>
              : 'Доля завершённых шагов за этот период неизвестна: даты выполнения не подтверждены'}</p>
          </div>
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
            <div className="reflect-journey-world"
              style={{width:layout.width,height:layout.height,
                transform:`translate(${pan.x}px, ${pan.y}px) scale(${scale})`}}>
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
                  <small>{TYPE[node.type]} · {STATUS[node.status]}</small>
                  <span>{node.label}</span>
                </button>
              ))}
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
            <aside className="reflect-journey-source" aria-label="Источник выбранного события">
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
          <p className="reflect-journey-note">
            Линия «содержит» означает принадлежность сеансу, а «принято как цель» — только подтверждённую транзакцией связь. Отсутствующее событие не восстанавливается догадкой.
          </p>
        </>
      )}
    </section>
  );
}
