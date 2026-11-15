"use strict";

/**
 * M8b offline-only private memory foundation. Pure transformation of
 * previously owner-authorized server snapshots, not an HTTP endpoint.
 * No DB access, persistence, embeddings, provider traffic, or AI inference.
 * UID argument alone is NOT authorization; future caller MUST validate
 * Auth, App Check, server-owned Firestore paths and purpose grants.
 */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const own = x => x !== null && typeof x === "object" && !Array.isArray(x);
const validId = x => typeof x === "string" && ID.test(x);
const deny = () => { throw new Error("invalid-owner-memory-source"); };
const textOf = x => typeof x === "string" && !CONTROL.test(x) ? x.trim().slice(0,1200) : "";
const atOf = x => {
  try {
    const d = x instanceof Date ? x : x?.toDate?.();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch { return null; }
};
function checkCollection(uid, rows) {
  if (!Array.isArray(rows) || rows.length > 1000) deny();
  const seen = new Set();
  for (const row of rows) {
    if (!own(row) || !validId(row.id) || seen.has(row.id) ||
        (row.uid !== undefined && row.uid !== uid) ||
        (row.ownerUid !== undefined && row.ownerUid !== uid)) deny();
    seen.add(row.id);
  }
  return rows;
}
function buildOwnerMemoryCatalog({uid, sessions=[], goals=[], diaryNotes=[], moods=[]}={}) {
  if (!validId(uid)) deny();
  const collections=[
    ["sessions",checkCollection(uid,sessions)],
    ["goals",checkCollection(uid,goals)],
    ["diaryNotes",checkCollection(uid,diaryNotes)],
    ["moods",checkCollection(uid,moods)]
  ];
  const output=[];
  const emit=(collection,documentId,subId,kind,raw,at)=>{
    const text=textOf(raw);
    if (!text) return;
    if (output.length>=4000) deny();
    output.push(Object.freeze({
      key:collection+":"+documentId+(subId ? ":"+subId : ""),
      source:Object.freeze({collection,documentId,subId}),
      kind,author:"user",provenance:"owner-authored-unverified",
      text,occurredAt:atOf(at),inference:false
    }));
  };
  for (const [kind,records] of collections) for (const record of records) {
    if (kind==="sessions") {
      const turns=Array.isArray(record.chatHistory)?record.chatHistory:[];
      if (turns.length>1000) deny();
      const seenTurns=new Set();
      for (const t of turns) {
        if (!own(t)||t.role!=="user"||!validId(t.id)||seenTurns.has(t.id)) continue;
        seenTurns.add(t.id);
        emit(kind,record.id,"turn:"+t.id,"owner-session-turn",t.content,t.createdAt);
      }
      const visits=Array.isArray(record.returnCheckIns)?record.returnCheckIns:[];
      if (visits.length>80) deny();
      const seenVisits=new Set();
      for(const v of visits) {
        if(!own(v)||v.type!=="return-check-in"||v.author!=="user"||
           !validId(v.id)||seenVisits.has(v.id))continue;
        seenVisits.add(v.id);
        emit(kind,record.id,"return:"+v.id,"owner-observed-outcome",
          v.text,v.recordedAtClient);
        emit(kind,record.id,"next:"+v.id,"owner-next-step",
          v.nextStep,v.recordedAtClient);
      }
    } else if (kind==="goals") {
      emit(kind,record.id,null,"owner-goal",record.text,record.createdAt);
      const steps=Array.isArray(record.subItems)?record.subItems:[];
      if(steps.length>100)deny();
      const seenSteps=new Set();
      for(const s of steps) {
        if(!own(s)||!validId(s.id)||seenSteps.has(s.id))continue;
        seenSteps.add(s.id);
        emit(kind,record.id,"step:"+s.id,"owner-goal-step",s.text,record.createdAt);
      }
    } else if (kind==="diaryNotes") {
      const notes=Array.isArray(record.entries)?record.entries:[];
      if(notes.length>200)deny();
      for(let i=0;i<notes.length;i++) if(own(notes[i])) {
        // Legacy index is stable only inside this snapshot; future indexed
        // storage must version parent and invalidate/rebuild on edits.
        emit(kind,record.id,"entry:"+i,"owner-diary-entry",
          notes[i].text,notes[i].createdAt);
      }
    } else {
      emit(kind,record.id,null,"owner-mood-comment",record.comment,record.createdAt);
    }
  }
  output.sort((a,b)=>{
    if(a.occurredAt && b.occurredAt && a.occurredAt!==b.occurredAt)
      return b.occurredAt.localeCompare(a.occurredAt);
    if(a.occurredAt && !b.occurredAt)return -1;
    if(!a.occurredAt && b.occurredAt)return 1;
    return a.key.localeCompare(b.key);
  });
  return Object.freeze(output);
}
/** Deterministic lexical baseline. NOT semantic understanding or AI consent. */
function searchOwnerMemoryCatalog(events,query,{limit=8}={}) {
  if(!Array.isArray(events)||typeof query!=="string"||query.trim().length<2||
     query.length>200||CONTROL.test(query)||!Number.isSafeInteger(limit)||
     limit<1||limit>20)deny();
  const words=[...new Set(query.toLocaleLowerCase("ru-RU")
    .split(/\s+/).filter(w=>w.length>=2))];
  if(!words.length)return Object.freeze([]);
  const found=events.map(event=>{
    if(!own(event)||event.author!=="user"||
       event.provenance!=="owner-authored-unverified"||
       !own(event.source)||!validId(event.source.documentId)||
       !["sessions","goals","diaryNotes","moods"].includes(event.source.collection)||
       typeof event.text!=="string")deny();
    const value=event.text.toLocaleLowerCase("ru-RU");
    const score=words.filter(word=>value.includes(word)).length;
    return {event,score};
  }).filter(x=>x.score>0);
  found.sort((a,b)=>b.score-a.score||
    (b.event.occurredAt||"").localeCompare(a.event.occurredAt||"")||
    a.event.key.localeCompare(b.event.key));
  return Object.freeze(found.slice(0,limit).map(x=>x.event));
}
module.exports={buildOwnerMemoryCatalog,searchOwnerMemoryCatalog};
