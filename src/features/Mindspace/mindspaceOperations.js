import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, appId } from '../../firebase/config';
import { RELATIONS } from './mindspaceModel';

const idOk = v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const validNote = v=>typeof v==='string' && v.length<=400 &&
  !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v);
const root = uid=>`artifacts/${appId}/users/${uid}`;
const linkId=(kind,id)=>`ml-${kind}-${id}`;

/**
 * An explicit user-authored semantic edge, anchored to an existing session.
 * A link never sends session history to Grok or introduces an unscoped
 * Firestore collection. Owner rules for sessions/goals remain applicable.
 */
export async function saveMindLink({
  userId,sourceSessionId,targetKind,targetId,relation,note=''
}){
  if(!db||!idOk(userId)||!idOk(sourceSessionId)||
    !['session','goal'].includes(targetKind)||!idOk(targetId)||
    !Object.hasOwn(RELATIONS,relation)||!validNote(note)||
    (targetKind==='session'&&targetId===sourceSessionId)){
    throw new Error('Некорректные данные связи. Изменения не сохранены.');
  }
  const sourceRef=doc(db,root(userId),'sessions',sourceSessionId);
  const targetRef=doc(db,root(userId),targetKind==='session'?'sessions':'goals',targetId);
  const id=linkId(targetKind,targetId);
  return runTransaction(db,async tx=>{
    const source=await tx.get(sourceRef);
    const target=await tx.get(targetRef);
    if(!source.exists()||!target.exists()){
      throw new Error('Исходная тема или цель не найдена в вашем аккаунте.');
    }
    const existing=Array.isArray(source.data()?.mindLinks)?
      source.data().mindLinks:[];
    const previous=existing.find(item=>item?.id===id);
    if(previous&&previous.author==='user'&&previous.status==='confirmed'&&
      previous.relation===relation&&previous.note===(note.trim())){
      return previous; // safe explicit retry after ambiguous network acknowledgment
    }
    if(!previous&&existing.length>=64){
      throw new Error('Для этой темы достигнут лимит смысловых связей.');
    }
    const now=Timestamp.now();
    const value={
      id,targetKind,targetId,relation,note:note.trim(),
      author:'user',status:'confirmed',
      createdAt:previous?.createdAt||now,updatedAt:now
    };
    tx.update(sourceRef,{
      mindLinks:previous?
        existing.map(item=>item?.id===id?value:item):[...existing,value],
      mindspaceChangedAt:serverTimestamp()
    });
    return value;
  });
}

/** No AI-side deletion, no cascading deletes of linked sessions or goals. */
export async function removeMindLink({
  userId,sourceSessionId,targetKind,targetId
}){
  if(!db||!idOk(userId)||!idOk(sourceSessionId)||
    !['session','goal'].includes(targetKind)||!idOk(targetId)){
    throw new Error('Некорректный источник связи.');
  }
  const sourceRef=doc(db,root(userId),'sessions',sourceSessionId);
  const id=linkId(targetKind,targetId);
  return runTransaction(db,async tx=>{
    const snapshot=await tx.get(sourceRef);
    if(!snapshot.exists()){
      throw new Error('Исходная тема больше не существует.');
    }
    const links=Array.isArray(snapshot.data()?.mindLinks)?
      snapshot.data().mindLinks:[];
    if(!links.some(item=>item?.id===id))return false;
    tx.update(sourceRef,{
      mindLinks:links.filter(item=>item?.id!==id),
      mindspaceChangedAt:serverTimestamp()
    });
    return true;
  });
}

/**
 * Display-only alias for this theme on the semantic map. The original
 * title and full transcript are immutable by this operation.
 */
export async function renameMindTopic({ userId, sourceSessionId, title }) {
  if (!db || !idOk(userId) || !idOk(sourceSessionId) ||
      typeof title !== 'string' || !title.trim() ||
      title.trim().length > 90 ||
      /[\u0000-\u001f\u007f]/.test(title)) {
    throw new Error('Название должно содержать от 1 до 90 символов.');
  }
  const ref=doc(db,root(userId),'sessions',sourceSessionId);
  const next=title.trim();
  return runTransaction(db,async tx=>{
    const snapshot=await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Тема больше не существует.');
    if (snapshot.data()?.mindTitle===next) return next;
    tx.update(ref,{
      mindTitle:next,
      mindspaceChangedAt:serverTimestamp()
    });
    return next;
  });
}
