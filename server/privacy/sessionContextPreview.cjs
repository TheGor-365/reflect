"use strict";

/**
 * AI-01J: in-process ONLY, server-owned historical session context preview.
 *
 * Not imported by Railway, any HTTP listener, a provider adapter, or React.
 * This function reads a single owner-scoped Firestore session only after a
 * fresh private grant check, and re-checks consent after the read.
 *
 * It DOES NOT send this preview to any AI provider or return it to a browser.
 * A separate future, independently reviewed, signed owner-preview endpoint
 * must obtain affirmative approval of the EXACT preview before any dispatch.
 */
const { PolicyError } = require("../ai/policy.cjs");
const {
  PROJECT_ID, NAMESPACE, SCOPE
} = require("./contextConsent.cjs");

const MAX_TURNS = 4;
const MAX_SOURCE_TURNS = 1000;
const MAX_TURN_BYTES = 700;
const MAX_CONTEXT_BYTES = 2400;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const GRANT_ID = /^[A-Za-z0-9_-]{16,80}$/;
const BAD_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const fail = code => { throw new PolicyError(code); };
const isPlain = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const validIdentity = value =>
  typeof value === "string" && IDENTIFIER.test(value);

/**
 * Use code points rather than Buffer slices, so the preview never contains
 * a broken UTF-8 sequence or a replacement character caused by truncation.
 */
function clipUtf8(text, limit) {
  if (typeof text !== "string" || !Number.isSafeInteger(limit) || limit < 1) {
    fail("invalid-session-history");
  }
  let bytes = 0;
  let result = "";
  for (const point of text) {
    const length = Buffer.byteLength(point, "utf8");
    if (bytes + length > limit) return Object.freeze({
      text: result, bytes, truncated: true
    });
    bytes += length;
    result += point;
  }
  return Object.freeze({ text: result, bytes, truncated: false });
}

function boundedSessionTurns(chatHistory) {
  if (!Array.isArray(chatHistory) || chatHistory.length === 0 ||
      chatHistory.length > MAX_SOURCE_TURNS) {
    fail("invalid-session-history");
  }
  const recent = chatHistory.slice(-MAX_TURNS);
  const output = [];
  let remaining = MAX_CONTEXT_BYTES;
  let truncated = chatHistory.length > recent.length;
  // Newest turns have priority if the shared byte cap is reached.
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const entry = recent[i];
    if (!isPlain(entry) ||
        (entry.role !== "user" && entry.role !== "assistant") ||
        typeof entry.content !== "string" ||
        entry.content.length === 0 || BAD_CONTROLS.test(entry.content)) {
      fail("invalid-session-history");
    }
    const normalized = entry.content.trim();
    if (!normalized) fail("invalid-session-history");
    if (remaining === 0) {
      truncated = true;
      continue;
    }
    const clipped = clipUtf8(normalized, Math.min(MAX_TURN_BYTES, remaining));
    if (!clipped.text.trim()) fail("invalid-session-history");
    remaining -= clipped.bytes;
    truncated = truncated || clipped.truncated;
    // Assistant output is untrusted historical DATA, not a new system prompt.
    output.push(Object.freeze({
      role: entry.role,
      content: clipped.text,
      truncated: clipped.truncated,
      untrustedSource: true
    }));
  }
  output.reverse();
  return Object.freeze({
    turns: Object.freeze(output),
    totalBytes: MAX_CONTEXT_BYTES - remaining,
    sourceTurnCount: chatHistory.length,
    truncated
  });
}

function createSessionContextPreview({ db, consentStore, projectId }) {
  if (!db || typeof db.doc !== "function" ||
      !consentStore || typeof consentStore.check !== "function" ||
      projectId !== PROJECT_ID) fail("unsafe-environment");

  async function preview({ principal, grantId, sourceId, scope }) {
    // 'principal' must have been created server-side ONLY after verification
    // of revoked Auth ID token + consumed, signed App Check and account rights.
    // No request-supplied uid, projectId or appCheckVerified may be trusted.
    if (!isPlain(principal) || principal.projectId !== PROJECT_ID ||
        principal.appCheckVerified !== true ||
        !validIdentity(principal.uid) || !GRANT_ID.test(grantId) ||
        !validIdentity(sourceId) || scope !== SCOPE) {
      fail("permission-denied");
    }

    const target = Object.freeze({
      uid: principal.uid, grantId, sourceId, scope
    });
    let checked;
    try { checked = await consentStore.check(target); }
    catch { fail("permission-denied"); }
    if (checked !== true) fail("permission-denied");

    // Never enumerate sessions or profiles; use exactly one verified owner UID
    // + one grant-bound source. Firestore Admin SDK bypasses client Rules.
    const ref = db.doc(
      `artifacts/${NAMESPACE}/users/${principal.uid}/sessions/${sourceId}`
    );
    let snap;
    try { snap = await ref.get(); }
    catch { fail("unavailable"); }
    if (!snap?.exists) fail("not-found");
    const session = snap.data();
    if (!isPlain(session) ||
        (session.ownerUid != null && session.ownerUid !== principal.uid) ||
        (session.uid != null && session.uid !== principal.uid)) {
      fail("permission-denied");
    }

    const value = boundedSessionTurns(session.chatHistory);

    // A grant may expire or be revoked during Firestore read or preview
    // shaping. Re-check the SAME grant after reading before returning even
    // an in-process preview. A future provider send must independently
    // check again just before dispatch, and must support cancellation.
    try { checked = await consentStore.check(target); }
    catch { fail("permission-denied"); }
    if (checked !== true) fail("permission-denied");

    return Object.freeze({
      sourceId,
      scope: SCOPE,
      ...value,
      disclosureRequired: true,
      providerDispatchAllowed: false
    });
  }

  return Object.freeze({ preview });
}

module.exports = {
  MAX_TURNS, MAX_SOURCE_TURNS, MAX_TURN_BYTES, MAX_CONTEXT_BYTES,
  clipUtf8, boundedSessionTurns, createSessionContextPreview
};
