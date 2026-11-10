"use strict";

/**
 * AI-01B.4: exact-document, read-only evidence loader (NOT LIVE).
 *
 * READS: only explicitly consented owner documents in goals/{id} and
 * diaryNotes/{id}. There is NO collection scan and no provider/AI call.
 * Legacy sessions store multiple chat turns in one chatHistory array, so
 * session-turn retrieval stays OFF until exact-turn consent is designed.
 *
 * verifiedUid must come from verified Firebase Auth + App Check, never body.
 */
const { loadOwnerContextAccess } = require("./ownerContextAccess.cjs");
const { hasSourceGrant } = require("./contextGrantPolicy.cjs");
const { selectContext } = require("./contextSelector.cjs");

const APP = "reflect-8fdc8";
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_DOCUMENT_READS = 6;
const MAX_ENTRY_COUNT = 10;
const KIND_COLLECTION = Object.freeze({
  diaryEntry: "diaryNotes",
  goal: "goals"
});
const validUid = x => typeof x === "string" && UID.test(x);
const validTime = x => Number.isSafeInteger(x) && x >= 0 &&
  x <= 8640000000000000;
const validText = x => typeof x === "string" && x.trim().length > 0 &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
const millis = input => {
  try {
    const number = input instanceof Date ? input.getTime()
      : typeof input?.toMillis === "function" ? input.toMillis()
      : typeof input?.toDate === "function" ? input.toDate().getTime() : NaN;
    return validTime(number) ? number : null;
  } catch { return null; }
};

class EvidenceReadError extends Error {
  constructor(code) { super(code); this.name = "EvidenceReadError"; this.code = code; }
}
const fail = code => { throw new EvidenceReadError(code); };

function materializeRecord(kind, uid, sourceId, data, nowMs) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !validUid(sourceId)) return null;
  const authoredAt = millis(data.createdAt);
  if (authoredAt === null || authoredAt > nowMs) return null;
  if (kind === "goal") {
    if (!validText(data.text)) return null;
    return { ownerUid: uid, sourceKind: kind, sourceId,
      text: data.text.trim(), authoredAt, authoredBy: "user" };
  }
  if (kind === "diaryEntry") {
    // Only a user-authored note, not AI-generated session or synthetic proxy.
    if (data.source != null && data.source !== "user" && data.source !== "manual")
      return null;
    if (!Array.isArray(data.entries) || data.entries.length < 1 ||
        data.entries.length > MAX_ENTRY_COUNT ||
        !data.entries.every(e => e && typeof e === "object" &&
          !Array.isArray(e) && validText(e.text))) return null;
    // A grant to one diary note authorizes its currently visible entries,
    // never its saved version snapshots or other related documents.
    const text = data.entries.map(e => e.text.trim()).join("\n");
    return { ownerUid: uid, sourceKind: kind, sourceId,
      text, authoredAt, authoredBy: "user" };
  }
  return null;
}

/**
 * Source grants are always read fresh from server store; no browser-submitted
 * history, grant, owner ID or "scope all" controls can override that store.
 * MAX_DOCUMENT_READS upper-bounds firestore accesses regardless of grant count.
 * A failure rejects the entire result rather than returning partial context.
 */
async function loadOwnerSelectedEvidence({
  db, verifiedUid, requestedUid, nowMs, maxDocuments = MAX_DOCUMENT_READS
} = {}) {
  if (!validUid(verifiedUid) || verifiedUid !== requestedUid ||
      !validTime(nowMs)) fail("unauthenticated");
  if (!db || typeof db.collection !== "function" ||
      !Number.isSafeInteger(maxDocuments) || maxDocuments < 0 ||
      maxDocuments > MAX_DOCUMENT_READS) fail("invalid-input");

  let access;
  try {
    access = await loadOwnerContextAccess({ db, verifiedUid, requestedUid });
  } catch {
    fail("permissions-unavailable");
  }

  if (access.settings.status === "invalid" || !access.grants.length ||
      maxDocuments === 0) {
    return Object.freeze({
      excerpts: Object.freeze([]), totalBytes: 0,
      documentReads: 0, unsupportedKinds: Object.freeze([])
    });
  }

  const allowedKinds = Object.keys(KIND_COLLECTION);
  const refs = new Set();
  const unsupported = new Set();
  for (const grant of access.grants) {
    for (const kind of ["sessionTurn", "diaryEntry", "goal", "approvedMemory", "bodyCheckin"]) {
      if (!Array.isArray(grant.sourceIds)) continue;
      for (const sourceId of grant.sourceIds) {
        if (!hasSourceGrant({ uid: verifiedUid, grants: [grant],
          sourceKind: kind, sourceId, nowMs })) continue;
        if (!allowedKinds.includes(kind)) {
          unsupported.add(kind);
          continue;
        }
        refs.add(kind + ":" + sourceId);
      }
    }
  }

  const permitted = [...refs].sort().slice(0, maxDocuments);
  if (!permitted.length) {
    return Object.freeze({
      excerpts: Object.freeze([]), totalBytes: 0,
      documentReads: 0, unsupportedKinds: Object.freeze([...unsupported].sort())
    });
  }
  const owner = db.collection("artifacts").doc(APP)
    .collection("users").doc(verifiedUid);
  let docs;
  try {
    docs = await Promise.all(permitted.map(async ref => {
      const boundary = ref.indexOf(":");
      const kind = ref.slice(0, boundary);
      const sourceId = ref.slice(boundary + 1);
      const snapshot = await owner.collection(KIND_COLLECTION[kind]).doc(sourceId).get();
      if (!snapshot || typeof snapshot.exists !== "boolean") fail("malformed-source");
      if (!snapshot.exists) return null;
      return materializeRecord(kind, verifiedUid, sourceId,
        snapshot.data?.(), nowMs);
    }));
  } catch {
    fail("source-unavailable");
  }
  const selected = selectContext({
    uid: verifiedUid, grants: access.grants,
    records: docs.filter(Boolean), nowMs
  });
  return Object.freeze({
    excerpts: selected.excerpts, totalBytes: selected.totalBytes,
    documentReads: permitted.length,
    unsupportedKinds: Object.freeze([...unsupported].sort())
  });
}
module.exports = {
  loadOwnerSelectedEvidence, EvidenceReadError,
  MAX_DOCUMENT_READS, materializeRecord
};
