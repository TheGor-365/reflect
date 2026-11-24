"use strict";

// C3c.2c prototype. No runtime route, scheduler or live activation.
// Caller must provide an authenticated server principal and an explicit
// Firestore FieldValue.delete() factory. Never delete accounting receipts.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const valid = x => typeof x === "string" && ID.test(x);
const MAX_BATCH = 100;

function createProvenanceRetention({ db, projectId, deleteField }) {
  if (projectId !== "reflect-ai-staging" || !db ||
      typeof db.doc !== "function" || typeof db.collection !== "function" ||
      typeof db.runTransaction !== "function" || typeof deleteField !== "function") {
    throw Error("unsafe-retention-environment");
  }
  async function scrubDeletedSession({ sessionId, cursor = null }, principal) {
    if (!valid(principal?.uid) || !valid(sessionId) ||
        (cursor !== null && !valid(cursor))) throw Error("invalid-retention-target");
    const uid = principal.uid;
    const session = db.doc(`artifacts/reflect-8fdc8/users/${uid}/sessions/${sessionId}`);
    const privateRoot = `_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`;
    const guard = db.doc(privateRoot);
    let query = db.collection(privateRoot + "/turns").orderBy("__name__").limit(MAX_BATCH);
    if (cursor !== null) query = query.startAfter(cursor);
    return db.runTransaction(async tx => {
      const [live, page] = await Promise.all([tx.get(session), tx.get(query)]);
      if (live.exists) throw Error("session-still-exists");
      // A durable private marker is required for future signing/acceptance
      // integration. Until those consumers check it, activation stays blocked.
      tx.set(guard, { provenanceRevoked: true }, { merge: true });
      let scrubbed = 0;
      for (const snapshot of page.docs) {
        if (Object.hasOwn(snapshot.data(), "provenance")) {
          tx.update(snapshot.ref, { provenance: deleteField() });
          scrubbed++;
        }
      }
      return { scrubbed, nextCursor: page.docs.length === MAX_BATCH
        ? page.docs[page.docs.length - 1].id : null };
    });
  }
  // Prototype server deletion entry: the revocation marker and removal
  // of the session must share one transaction. No public route yet.
  async function revokeAndDeleteSession({ sessionId, confirmed }, principal) {
    if (!valid(principal?.uid) || !valid(sessionId) || confirmed !== true) {
      throw Error("invalid-retention-target");
    }
    const uid = principal.uid;
    const session = db.doc(`artifacts/reflect-8fdc8/users/${uid}/sessions/${sessionId}`);
    const guard = db.doc(`_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`);
    return db.runTransaction(async tx => {
      const [live, marker] = await Promise.all([tx.get(session), tx.get(guard)]);
      if (!live.exists) {
        if (marker.exists && marker.data()?.provenanceRevoked === true) return { revoked: true };
        throw Error("session-not-found");
      }
      if (live.data()?.archivedAt != null) throw Error("archived-session-deletion-blocked");
      tx.set(guard, { provenanceRevoked: true }, { merge: true });
      tx.delete(session);
      return { revoked: true };
    });
  }
  return Object.freeze({ scrubDeletedSession, revokeAndDeleteSession });
}
module.exports = { createProvenanceRetention };
