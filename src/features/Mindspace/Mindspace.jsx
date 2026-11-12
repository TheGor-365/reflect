import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, BrainCircuit, Check, CircleHelp, Compass,
  GitBranch, Link2, Network, Pencil, RotateCcw, Sparkles,
  Target, Trash2, X
} from 'lucide-react';
import { buildMindspace, layoutMindspace, RELATIONS } from './mindspaceModel';
import { removeMindLink, saveMindLink } from './mindspaceOperations';

const ICONS={session:BrainCircuit,goal:Target,proposal:Sparkles};
const LABELS={
  session:'Тема',goal:'Цель',proposal:'Идея AI',
  active:'В работе',completed:'Выполнено',paused:'На паузе',
  saved:'Сохранено',accepted:'Принято пользователем',
  proposed:'Предложение AI',dismissed:'Отклонено',
  postponed:'Отложено'
};
const linkKey=(from,to)=>`semantic:${from.refId}:ml-${to.kind}-${to.refId}`;

function MindNode({node,selected,pendingSource,onSelect}){
  const Icon=ICONS[node.kind]||BrainCircuit;
  return (
    <button type="button" className={`reflect-mind-node reflect-mind-node--${node.kind}
      ${selected?'is-selected':''} ${pendingSource?'is-source':''}
      ${node.status==='proposed'?'is-proposed':''}`}
      style={{left:node.x,top:node.y}} onClick={()=>onSelect(node)}
      aria-pressed={selected} aria-label={`${LABELS[node.kind]}: ${node.label}.
        ${LABELS[node.status]||node.subtitle}`}>
      <span className="reflect-mind-node-orb"><Icon size={node.kind==='session'?27:22}
        strokeWidth={1.6} aria-hidden="true"/></span>
      <span className="reflect-mind-node-label">{node.label}</span>
      <span className="reflect-mind-node-metadata">
        {node.kind==='proposal'?'Предположение AI':LABELS[node.kind]}
      </span>
    </button>
  );
}

/** Read-only rendering until a user explicitly confirms a semantic link. */
export default function Mindspace({
  sessions=[],goals=[],userId,onOpenSource,onOpenJourney
}){
  const [showIdeas,setShowIdeas]=useState(true);
  const [selectedId,setSelectedId]=useState(null);
  const [sourceNodeId,setSourceNodeId]=useState(null);
  const [targetNodeId,setTargetNodeId]=useState(null);
  const [relation,setRelation]=useState('related');
  const [note,setNote]=useState('');
  const [editLinkId,setEditLinkId]=useState(null);
  const [confirmRemoval,setConfirmRemoval]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [viewMode,setViewMode]=useState('constellation');
  const canvasRef=useRef(null);
  const graph=useMemo(()=>buildMindspace(sessions,goals,{
    includeProposals:showIdeas
  }),[sessions,goals,showIdeas]);
  const layout=useMemo(()=>layoutMindspace(graph),[graph]);
  const allNodes=graph.nodes;
  const selected=allNodes.find(node=>node.id===selectedId)||null;
  const source=allNodes.find(node=>node.id===sourceNodeId)||null;
  const target=allNodes.find(node=>node.id===targetNodeId)||null;
  const semantic=graph.edges.filter(edge=>edge.kind==='semantic');
  const connected=selected?semantic.filter(edge=>
    edge.from===selected.id||edge.to===selected.id):[];
  const sourceRecord=source?.kind==='session'?
    sessions.find(session=>session.id===source.refId):null;
  const linkDraft=source&&target?sourceRecord?.mindLinks?.find(item=>
    item.id===`ml-${target.kind}-${target.refId}`):null;
  useEffect(()=>{
    setSelectedId(null);setSourceNodeId(null);setTargetNodeId(null);
    setError('');setNotice('');setEditLinkId(null);
  },[userId]);
  useEffect(()=>{
    if(selectedId&&!allNodes.some(node=>node.id===selectedId))setSelectedId(null);
  },[allNodes,selectedId]);
  const reset=()=>{
    setSelectedId(null);setSourceNodeId(null);setTargetNodeId(null);
    setEditLinkId(null);setConfirmRemoval(false);
    setRelation('related');setNote('');setError('');setNotice('');
  };
  const openLink=(from,to)=>{
    setSourceNodeId(from.id);setTargetNodeId(to.id);
    const prior=sessions.find(session=>session.id===from.refId)
      ?.mindLinks?.find(item=>item.id===`ml-${to.kind}-${to.refId}`);
    setRelation(Object.hasOwn(RELATIONS,prior?.relation)?prior.relation:'related');
    setNote(typeof prior?.note==='string'?prior.note:'');
    setEditLinkId(prior?.id||null);
    setConfirmRemoval(false);
    setError('');setNotice('');
  };
  const selectNode=node=>{
    if(busy)return;
    if(sourceNodeId&&node.id!==sourceNodeId){
      const from=allNodes.find(value=>value.id===sourceNodeId);
      if(!from)return reset();
      if(node.kind==='proposal'){
        setError('Идея AI не становится смысловым фактом автоматически. Обсудите её в исходном сеансе.');
        setSelectedId(node.id);return;
      }
      openLink(from,node);setSelectedId(node.id);return;
    }
    setSelectedId(node.id);
    setError('');setNotice('');
  };
  const beginLink=()=>{
    if(selected?.kind!=='session')return;
    setSourceNodeId(selected.id);setTargetNodeId(null);
    setEditLinkId(null);setConfirmRemoval(false);
    setError('');setNotice('');
  };
  const onSave=async event=>{
    event.preventDefault();
    if(busy||!source||!target||!userId)return;
    setBusy(true);setError('');setNotice('');
    try{
      await saveMindLink({userId,sourceSessionId:source.refId,
        targetKind:target.kind,targetId:target.refId,
        relation,note});
      setNotice(editLinkId?'Связь изменена и подтверждена.':
        'Вы подтвердили смысловую связь. Она сохранена в вашей теме.');
      setSourceNodeId(null);setTargetNodeId(null);
      setEditLinkId(null);setConfirmRemoval(false);
    }catch(err){
      setError(err?.message||'Не удалось сохранить связь. Текст остался на экране.');
    }finally{setBusy(false);}
  };
  const onRemove=async()=>{
    if(!confirmRemoval||busy||!source||!target)return;
    setBusy(true);setError('');
    try{
      await removeMindLink({userId,sourceSessionId:source.refId,
        targetKind:target.kind,targetId:target.refId});
      reset();setNotice('Связь удалена. Исходные темы и цели остались без изменений.');
    }catch(err){
      setError(err?.message||'Удаление не подтверждено.');
    }finally{setBusy(false);}
  };
  const chooseEdge=edge=>{
    const from=allNodes.find(node=>node.id===edge.from);
    const to=allNodes.find(node=>node.id===edge.to);
    if(!from||!to)return;
    openLink(from,to);setSelectedId(to.id);
  };
  const center=()=>{
    const element=canvasRef.current;
    if(!element)return;
    element.scrollTo({
      left:Math.max(0,(layout.width-element.clientWidth)/2),
      top:Math.max(0,(layout.height-element.clientHeight)/2),
      behavior:'smooth'
    });
  };
  const noContent=!graph.nodes.length;
  return (
    <section className="reflect-mindspace" aria-label="Mindspace — карта смыслов">
      <header className="reflect-mindspace-top">
        <div>
          <p className="reflect-mindspace-overline"><Sparkles size={15} aria-hidden="true"/> Личное пространство</p>
          <h2>Mindspace<span className="reflect-mindspace-title-dot">.</span></h2>
          <p>Не хронология, а связи ваших тем, решений и целей. Вы решаете, что действительно связано.</p>
        </div>
        <div className="reflect-mindspace-stat" aria-label="Подтверждённые смысловые связи">
          <Network size={20} aria-hidden="true"/>
          <strong>{graph.confirmedLinks}</strong>
          <span>подтверждённых связей</span>
        </div>
      </header>
      <div className="reflect-mindspace-toolbar" role="group" aria-label="Вид карты">
        <div className="reflect-mindspace-segments">
          <button type="button" aria-pressed={viewMode==='constellation'}
            onClick={()=>setViewMode('constellation')}>
            <Network size={16} aria-hidden="true"/> Карта
          </button>
          <button type="button" aria-pressed={viewMode==='list'}
            onClick={()=>setViewMode('list')}>
            <Compass size={16} aria-hidden="true"/> Список
          </button>
        </div>
        {graph.suggestedNodes>0&&(
          <button type="button" className="reflect-mindspace-quiet"
            aria-pressed={showIdeas} onClick={()=>{
              setShowIdeas(current=>!current);reset();
            }}><Sparkles size={15} aria-hidden="true"/>
            Идеи AI {showIdeas?'видны':'скрыты'}</button>
        )}
        {viewMode==='constellation'&&!noContent&&(
          <button type="button" className="reflect-mindspace-center"
            onClick={center} aria-label="Центрировать карту">
            <RotateCcw size={17} aria-hidden="true"/>
          </button>
        )}
      </div>
      {source&& !target&&(
        <div className="reflect-mindspace-guidance" role="status">
          <Link2 size={17} aria-hidden="true"/>
          Выберите вторую тему или цель. Связь появится только после подтверждения.
          <button type="button" onClick={reset} aria-label="Отменить связывание"><X size={16}/></button>
        </div>
      )}
      {noContent?(
        <div className="reflect-mindspace-empty" role="status">
          <div className="reflect-mindspace-empty-art">
            <span><BrainCircuit size={31}/></span>
            <span><Link2 size={23}/></span>
            <span><Target size={29}/></span>
          </div>
          <h3>Смыслы появятся из ваших записей</h3>
          <p>Сохраните первую тему или цель. Мы не создаём психологический профиль и не придумываем связи без ваших решений.</p>
        </div>
      ):(
        <>
          {viewMode==='constellation'?(
            <div className="reflect-mindspace-viewport" ref={canvasRef}
              role="region" tabIndex={0}
              aria-label="Прокручиваемое смысловое пространство">
              <div className="reflect-mindspace-world"
                style={{width:layout.width,height:layout.height}}>
                <svg className="reflect-mindspace-svg" aria-hidden="true"
                  width={layout.width} height={layout.height}>
                  <defs>
                    <radialGradient id="reflect-mind-aura">
                      <stop offset="0" stopColor="var(--reflect-accent)" stopOpacity=".10"/>
                      <stop offset="1" stopColor="var(--reflect-accent)" stopOpacity="0"/>
                    </radialGradient>
                  </defs>
                  <circle cx={layout.width/2} cy={layout.height/2} r="270"
                    fill="url(#reflect-mind-aura)"/>
                  <circle cx={layout.width/2} cy={layout.height/2} r="332"
                    className="reflect-mindspace-orbit"/>
                  <circle cx={layout.width/2} cy={layout.height/2} r="194"
                    className="reflect-mindspace-orbit"/>
                  {layout.edges.map(edge=>(
                    <line key={edge.id} x1={edge.x1} y1={edge.y1}
                      x2={edge.x2} y2={edge.y2}
                      className={`reflect-mind-edge reflect-mind-edge--${edge.kind}
                        reflect-mind-edge--${edge.relation}`}/>
                  ))}
                </svg>
                <span className="reflect-mindspace-centerlabel" aria-hidden="true">
                  <Sparkles size={20} strokeWidth={1.5}/>
                  моё пространство
                </span>
                {layout.nodes.map(node=>(
                  <MindNode key={node.id} node={node}
                    selected={selectedId===node.id}
                    pendingSource={sourceNodeId===node.id}
                    onSelect={selectNode}/>
                ))}
              </div>
            </div>
          ):(
            <div className="reflect-mindspace-accessible-list"
              role="region" aria-label="Список тем, целей и AI-идей">
              {graph.nodes.map(node=>{
                const Icon=ICONS[node.kind]||CircleHelp;
                return <button type="button" key={node.id}
                  onClick={()=>selectNode(node)} aria-pressed={selectedId===node.id}>
                  <Icon size={20} aria-hidden="true"/>
                  <span><strong>{node.label}</strong>
                    <small>{LABELS[node.kind]} · {LABELS[node.status]||node.subtitle}</small>
                  </span><ArrowUpRight size={16} aria-hidden="true"/>
                </button>;
              })}
            </div>
          )}
          <div className="reflect-mindspace-bottom">
            <p className="reflect-mindspace-legend">
              <span className="reflect-mindspace-dot reflect-mindspace-dot--session"/> Тема
              <span className="reflect-mindspace-dot reflect-mindspace-dot--goal"/> Цель
              <span className="reflect-mindspace-dot reflect-mindspace-dot--proposal"/> Идея AI
              <span className="reflect-mindspace-legend-line"/> Подтверждённая связь
            </p>
            <p className="reflect-mindspace-hint">
              {graph.confirmedLinks>0 ?
                'Толстые линии — ваши подтверждённые смысловые связи. Тонкие линии — только принадлежность теме.' :
                'Пока нет подтверждённых смысловых связей. Выберите тему и укажите, как она связана с другой.'}
            </p>
          </div>
          {graph.truncated&&<p role="status" className="reflect-mindspace-warning">
            Карта ограничена первыми {graph.nodes.length} узлами. Часть данных не видна, но ничего не удалено.
          </p>}
        </>
      )}
      {selected&&!target&&(
        <aside className="reflect-mindspace-inspector" aria-label="Выбранный смысловой узел">
          <div className="reflect-mindspace-inspector-heading">
            <div>
              <small>{LABELS[selected.kind]} · {LABELS[selected.status]||'Сохранено'}</small>
              <h3>{selected.label}</h3>
            </div>
            <button type="button" onClick={()=>setSelectedId(null)}
              aria-label="Закрыть сведения об узле"><X size={18}/></button>
          </div>
          {selected.kind==='proposal'&&(
            <p className="reflect-mindspace-warning">
              Это предложение модели из сохранённого ответа — не подтверждённая тема и не вывод о вас.
            </p>
          )}
          {connected.length>0&&(
            <div className="reflect-mindspace-linked">
              <h4>Связано с</h4>
              {connected.map(edge=>{
                const other=graph.nodes.find(n=>n.id===(edge.from===selected.id?edge.to:edge.from));
                return <button type="button" key={edge.id} onClick={()=>chooseEdge(edge)}>
                  <Link2 size={16} aria-hidden="true"/>
                  <span>{edge.relationLabel}: <strong>{other?.label||'Источник недоступен'}</strong></span>
                  <Pencil size={14} aria-hidden="true"/>
                </button>;
              })}
            </div>
          )}
          <div className="reflect-mindspace-inspector-actions">
            {selected.kind==='session'&&(
              <button type="button" className="reflect-mindspace-primary"
                onClick={beginLink}><Link2 size={17}/> Связать с темой или целью</button>
            )}
            {onOpenSource&&(
              <button type="button" onClick={()=>onOpenSource(selected.sourceRef)}>
                Открыть источник <ArrowUpRight size={16}/>
              </button>
            )}
          </div>
        </aside>
      )}
      {source&&target&&(
        <section className="reflect-mindspace-editor" aria-label="Подтверждение смысловой связи">
          <header>
            <span className="reflect-mindspace-editor-path">
              <strong>{source.label}</strong><Link2 size={16}/><strong>{target.label}</strong>
            </span>
            <button type="button" onClick={reset} aria-label="Закрыть редактор связи"><X size={18}/></button>
          </header>
          <form onSubmit={onSave}>
            <label>Как связаны эти темы?
              <select value={relation} disabled={busy}
                onChange={event=>setRelation(event.target.value)}>
                {Object.entries(RELATIONS).map(([id,label])=>(
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label>Почему вы видите связь? <small>Необязательно, до 400 символов</small>
              <textarea value={note} maxLength={400} rows={2} disabled={busy}
                placeholder="Ваша собственная формулировка…"
                onChange={event=>setNote(event.target.value)}/>
            </label>
            <div className="reflect-mindspace-editor-actions">
              <button type="submit" className="reflect-mindspace-primary" disabled={busy}>
                <Check size={17} aria-hidden="true"/>
                {busy?'Сохраняется…':editLinkId?'Сохранить изменение':'Подтвердить связь'}
              </button>
              {editLinkId&&(
                <button type="button" className="reflect-mindspace-danger"
                  disabled={busy} onClick={()=>setConfirmRemoval(true)}>
                  <Trash2 size={16}/> Удалить связь
                </button>
              )}
            </div>
          </form>
          {confirmRemoval&&(
            <div className="reflect-mindspace-remove-confirm" role="group"
              aria-label="Подтвердить удаление связи">
              Удалить только эту связь? Исходные темы и цели останутся.
              <button type="button" disabled={busy} onClick={onRemove}>Да, удалить связь</button>
              <button type="button" disabled={busy} onClick={()=>setConfirmRemoval(false)}>Отмена</button>
            </div>
          )}
        </section>
      )}
      {notice&&<p className="reflect-mindspace-notice" role="status"><Check size={17}/>{notice}</p>}
      {error&&<p className="reflect-mindspace-warning" role="alert">{error}</p>}
      <footer className="reflect-mindspace-footer">
        <span><CircleHelp size={14} aria-hidden="true"/> Содержимое хранится в вашем аккаунте. История не отправляется Grok с этой страницы.</span>
        {onOpenJourney&&<button type="button" onClick={onOpenJourney}>
          <GitBranch size={15}/> Посмотреть развитие по времени
        </button>}
      </footer>
    </section>
  );
}
