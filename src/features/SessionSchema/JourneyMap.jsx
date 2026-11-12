import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GitBranch,
  List, Maximize2, Minus, Plus
} from 'lucide-react';
import { buildJourneyGraph, filterJourneyGraph, layoutJourneyNodes, timestampMs } from './journeyGraph';

const typeLabels = {
  session: 'Тема', 'user-turn': 'Ваши слова', 'ai-reply': 'Ответ AI',
  proposal: 'Предложение AI', decision: 'Ваше решение',
  goal: 'Ваша цель', step: 'Шаг', reflection: 'Ваша проработка',
  completion: 'Завершение цели', return: 'Возвращение'
};
const statuses = {
  proposed: 'Не подтверждено', generated: 'Ответ AI', authored: 'Ваши слова',
  saved: 'Сохранено', accepted: 'Принято вами', postponed: 'Отложено',
  dismissed: 'Отклонено', completed: 'Отмечено выполненным',
  pending: 'Не выполнено', active: 'В работе', paused: 'На паузе'
};
const dateLabel = value => {
  const ms = timestampMs(value);
  if (ms === null) return 'Время не указано';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(ms));
};
const MAX_MAP_NODES = 80;

export default function JourneyMap({ session, goals = [], onOpenSource }) {
  const [kind, setKind] = useState('all');
  const [period, setPeriod] = useState('all');
  const [goalId, setGoalId] = useState('all');
  const [status, setStatus] = useState('all');
  const [mode, setMode] = useState('map');
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const viewportRef = useRef(null);
  const graph = useMemo(() => buildJourneyGraph(session, goals), [session, goals]);
  const goalOptions = useMemo(() => goals.filter(goal =>
    goal?.sessionId === session?.id && typeof goal?.id === 'string' &&
    typeof goal?.text === 'string'), [session?.id, goals]);
  const scoped = useMemo(() => {
    const filtered = filterJourneyGraph(graph, { kind, period, goalId });
    if (status === 'all') return filtered;
    const nodes = filtered.nodes.filter(node =>
      node.kind === 'session' || node.status === status);
    const ids = new Set(nodes.map(node => node.id));
    return { ...filtered, nodes, edges: filtered.edges.filter(edge =>
      ids.has(edge.from) && ids.has(edge.to)) };
  }, [graph, kind, period, goalId, status]);
  const selected = scoped.nodes.find(node => node.id === selectedId) || null;
  const visible = scoped.nodes.filter(node => node.kind !== 'session');
  const mapGraph = useMemo(() => {
    const included = new Set(scoped.nodes.slice(0, MAX_MAP_NODES).map(node => node.id));
    const subset = scoped.nodes.filter(node => included.has(node.id));
    const placed = layoutJourneyNodes(subset, zoom);
    const positions = new Map(placed.nodes.map(node => [node.id, node]));
    return {
      ...placed, edges: scoped.edges.filter(edge =>
        positions.has(edge.from) && positions.has(edge.to)),
      positions
    };
  }, [scoped, zoom]);
  const scrollMap = (x, y) => viewportRef.current?.scrollBy?.({
    left: x, top: y, behavior: 'smooth'
  });
  const chooseZoom = delta => setZoom(current => {
    const scales = [0.75, 1, 1.25];
    return scales[Math.max(0, Math.min(2, scales.indexOf(current) + delta))];
  });
  const nodeButton = node => (
    <button type="button" key={node.id}
      className={'reflect-journey-node reflect-journey-node--' + node.kind +
        (selectedId === node.id ? ' is-selected' : '')}
      style={{
        left: node.x, top: node.y, width: node.width, minHeight: node.height
      }}
      aria-pressed={selectedId === node.id}
      aria-label={(typeLabels[node.kind] || 'Событие') + ': ' + node.label}
      onClick={() => setSelectedId(node.id)}>
      <span className="reflect-journey-node-kind">{typeLabels[node.kind] || 'Событие'}</span>
      <span className="reflect-journey-node-label">{node.label}</span>
      <small>{statuses[node.status] || node.status}</small>
    </button>
  );

  return (
    <div className="reflect-journey" aria-label="Карта пути по подтверждённым событиям">
      <div className="reflect-journey-controls">
        <label>Тип событий
          <select value={kind} onChange={event => { setKind(event.target.value); setSelectedId(null); }}>
            <option value="all">Все</option>
            <option value="own">Мои записи и действия</option>
            <option value="ai">Ответы и предложения AI</option>
            <option value="decisions">Принятые решения</option>
            <option value="goals">Цели и шаги</option>
            <option value="returns">Возвращения к теме</option>
          </select>
        </label>
        <label>Период
          <select value={period} onChange={event => { setPeriod(event.target.value); setSelectedId(null); }}>
            <option value="all">Все даты</option>
            <option value="7d">Последние 7 дней</option>
            <option value="30d">Последние 30 дней</option>
          </select>
        </label>
        <label>Связанная цель
          <select value={goalId} onChange={event => { setGoalId(event.target.value); setSelectedId(null); }}>
            <option value="all">Все цели</option>
            {goalOptions.map(goal => <option key={goal.id} value={goal.id}>{goal.text}</option>)}
          </select>
        </label>
        <label>Статус
          <select value={status} onChange={event => { setStatus(event.target.value); setSelectedId(null); }}>
            <option value="all">Любой</option>
            <option value="proposed">Только предложения AI</option>
            <option value="accepted">Принятые рекомендации</option>
            <option value="dismissed">Отклонённые рекомендации</option>
            <option value="completed">Отмечено выполненным</option>
          </select>
        </label>
      </div>
      <div className="reflect-journey-metrics" aria-label="Факты за всё время сеанса">
        <span>Принято рекомендаций: <b>{graph.metrics.confirmedDecisions}</b></span>
        <span>Возвращений: <b>{graph.metrics.returns}</b></span>
        <span>Шаги цели: <b>{graph.metrics.totalSteps
          ? graph.metrics.completedSteps + ' из ' + graph.metrics.totalSteps
          : 'пока не заданы'}</b></span>
        <small>Это состояния сохранённых записей за всё время, не психологическая оценка.</small>
      </div>

      {visible.length === 0 ? (
        <div className="reflect-journey-empty" role="status">
          Подтверждённых событий по этому фильтру пока нет.
          Запишите мысль, сохраните сеанс или вернитесь к существующей теме.
        </div>
      ) : (
        <>
          <div className="reflect-journey-viewbar">
            <div role="group" aria-label="Отображение пути">
              <button type="button" aria-pressed={mode === 'map'}
                onClick={() => setMode('map')}><GitBranch size={16} aria-hidden="true"/> Карта</button>
              <button type="button" aria-pressed={mode === 'list'}
                onClick={() => setMode('list')}><List size={16} aria-hidden="true"/> Лента</button>
            </div>
            {mode === 'map' && (
              <div role="group" aria-label="Масштаб карты">
                <button type="button" aria-label="Уменьшить масштаб" disabled={zoom <= .75}
                  onClick={() => chooseZoom(-1)}><Minus size={16}/></button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="Увеличить масштаб" disabled={zoom >= 1.25}
                  onClick={() => chooseZoom(1)}><Plus size={16}/></button>
                <button type="button" aria-label="Масштаб 100%" onClick={() => setZoom(1)}>
                  <Maximize2 size={16}/></button>
              </div>
            )}
          </div>
          {mode === 'map' && (
            <>
              <p className="reflect-journey-hint">
                Прокручивайте карту; Tab выбирает узлы. Стрелки перемещают область, +/- меняют масштаб.
                Линии означают только сохранённую связь, не причинно-следственную закономерность.
              </p>
              {scoped.nodes.length > MAX_MAP_NODES && (
                <p role="status">На карте показаны первые {MAX_MAP_NODES} узлов из {scoped.nodes.length}.
                  Полный набор доступен во вкладке «Лента».</p>
              )}
              <div className="reflect-journey-viewport" ref={viewportRef}
                role="region" aria-label="Интерактивная прокручиваемая карта пути"
                tabIndex={0}
                onKeyDown={event => {
                  const target = event.target;
                  if (target !== event.currentTarget) return;
                  if (event.key === 'ArrowLeft') { event.preventDefault(); scrollMap(-150, 0); }
                  if (event.key === 'ArrowRight') { event.preventDefault(); scrollMap(150, 0); }
                  if (event.key === 'ArrowUp') { event.preventDefault(); scrollMap(0, -150); }
                  if (event.key === 'ArrowDown') { event.preventDefault(); scrollMap(0, 150); }
                  if (event.key === '+') { event.preventDefault(); chooseZoom(1); }
                  if (event.key === '-') { event.preventDefault(); chooseZoom(-1); }
                }}>
                <div className="reflect-journey-canvas" style={{
                  width: mapGraph.width, height: mapGraph.height
                }}>
                  <svg aria-hidden="true" width={mapGraph.width} height={mapGraph.height}>
                    <defs>
                      <marker id="reflect-journey-arrow" viewBox="0 0 10 10"
                        refX="9" refY="5" markerWidth="6" markerHeight="6"
                        orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/>
                      </marker>
                    </defs>
                    {mapGraph.edges.map(edge => {
                      const from = mapGraph.positions.get(edge.from);
                      const to = mapGraph.positions.get(edge.to);
                      const x1 = from.x + from.width;
                      const y1 = from.y + from.height / 2;
                      const x2 = to.x;
                      const y2 = to.y + to.height / 2;
                      const mid = (x1 + x2) / 2;
                      return <path key={edge.id}
                        className="reflect-journey-edge"
                        d={'M' + x1 + ',' + y1 + ' C' + mid + ',' + y1 +
                          ' ' + mid + ',' + y2 + ' ' + x2 + ',' + y2}
                        fill="none" markerEnd="url(#reflect-journey-arrow)" />;
                    })}
                  </svg>
                  {mapGraph.nodes.map(nodeButton)}
                </div>
              </div>
              <div className="reflect-journey-pan" role="group" aria-label="Прокрутка карты">
                <button type="button" aria-label="Прокрутить влево" onClick={() => scrollMap(-190,0)}>
                  <ArrowLeft size={17}/></button>
                <button type="button" aria-label="Прокрутить вверх" onClick={() => scrollMap(0,-190)}>
                  <ArrowUp size={17}/></button>
                <button type="button" aria-label="Прокрутить вниз" onClick={() => scrollMap(0,190)}>
                  <ArrowDown size={17}/></button>
                <button type="button" aria-label="Прокрутить вправо" onClick={() => scrollMap(190,0)}>
                  <ArrowRight size={17}/></button>
              </div>
            </>
          )}
          {mode === 'list' && (
            <ol className="reflect-journey-list" aria-label="Структурированная лента событий">
              {scoped.nodes.filter(node => node.kind !== 'session')
                .sort((a,b) => (a.timeMs === null ? 1 : b.timeMs === null ? -1 :
                  a.timeMs - b.timeMs) || a.index - b.index)
                .map(node => (
                  <li key={node.id}>
                    <button type="button" className={selectedId === node.id ? 'is-selected' : ''}
                      onClick={() => setSelectedId(node.id)}>
                      <strong>{typeLabels[node.kind] || 'Событие'}</strong>
                      <span>{node.label}</span>
                      <small>{dateLabel(node.timestamp)} · {statuses[node.status] || node.status}</small>
                    </button>
                  </li>
                ))}
            </ol>
          )}
          {selected && (
            <aside className="reflect-journey-selected" aria-label="Источник выбранного узла">
              <strong>{typeLabels[selected.kind] || 'Событие'}</strong>
              <p>{selected.label}</p>
              {selected.explanation && <p>{selected.explanation}</p>}
              <small>{dateLabel(selected.timestamp)}
                {selected.kind === 'return' ? ' · Время устройства' : ''}
                {' · '}{statuses[selected.status] || selected.status}</small>
              <div className="reflect-journey-selected-actions">
                {onOpenSource && <button type="button"
                  onClick={() => onOpenSource(selected.sourceRef)}>
                  Открыть исходную запись
                </button>}
                <button type="button" onClick={() => setSelectedId(null)}>Закрыть</button>
              </div>
            </aside>
          )}
        </>
      )}
    </div>
  );
}
