"use strict";

/**
 * M3 server-only, unconnected and OFF by default.
 * Only one explicitly selected authenticated owner's session, not a profile,
 * diary, another session or a collection query.
 *
 * Two separate gates:
 *   preview -> inspect EXACT clipped prior turns + stable digest (NO provider)
 *   authorize -> only after owner confirms digest, the user turn is durably
 *                written, and private grant is revalidated just before egress
 *
 * This adapter NEVER calls a model or returns session text to a public route.
 * Wiring the signed preview/approval UI and provider transport requires its
 * own reviewed, default-OFF release gate.
 */
const { createHash, timingSafeEqual } = require("node:crypto");
const { PolicyError } = require("./policy.cjs");
const { PROJECT_ID, NAMESPACE, SCOPE } = require("../privacy/contextConsent.cjs");
const { clipUtf8 } = require("../privacy/sessionContextPreview.cjs");

const MAX_PRIOR_TURNS = 4;
const MAX_TURN_BYTES = 300;
const MAX_TOTAL_BYTES = 1200;
const MAX_SOURCE_TURNS = 1000;
const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{12,80}$/;
const GRANT_ID = /^[A-Za-z0-9_-]{16,80}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const BAD_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const fail = code => { throw new PolicyError(code); };
const plain = x => x !== null && typeof x === "object" &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

function safeSourcePrincipal(principal, grantId, sourceId, requestId, message) {
  if (!plain(principal) || principal.projectId !== PROJECT_ID ||
      principal.appCheckVerified !== true ||
      typeof principal.uid !== "string" || !VALID_ID.test(principal.uid) ||
      typeof grantId !== "string" || !GRANT_ID.test(grantId) ||
      typeof sourceId !== "string" || !VALID_ID.test(sourceId) ||
      typeof requestId !== "string" || !REQUEST_ID.test(requestId) ||
      typeof message !== "string" || !message.trim() ||
      Buffer.byteLength(message, "utf8") > 2000) {
    fail("permission-denied");
  }
  return Object.freeze({ uid: principal.uid, grantId, sourceId, scope: SCOPE });
}

/**
 * Only actual persisted user/assistant turns with immutable source ids.
 * If the new user turn already exists it MUST be the final source turn and
 * match the explicit message. For pre-send preview it may be absent.
 */
function boundedPreviousTurns(history, { requestId, message, requireCommitted = false }) {
  if (!Array.isArray(history) || history.length > MAX_SOURCE_TURNS) {
    fail("invalid-session-history");
  }
  const currentId = "user-" + requestId;
  const matches = history.map((t, i) => t?.id === currentId ? i : -1)
    .filter(i => i >= 0);
  if (matches.length > 1) fail("invalid-session-history");
  const committed = matches.length === 1;
  if (requireCommitted && !committed) fail("permission-denied");
  if (committed) {
    const current = history[matches[0]];
    if (matches[0] !== history.length - 1 ||
        current?.role !== "user" ||
        current?.content !== message) fail("permission-denied");
  }
  const previous = committed ? history.slice(0, -1) : history;
  const selected = previous.slice(-MAX_PRIOR_TURNS);
  const output = [];
  const ids = new Set();
  let remaining = MAX_TOTAL_BYTES;
  for (let i = selected.length - 1; i >= 0; i--) {
    const turn = selected[i];
    if (!plain(turn) || !VALID_ID.test(turn.id || "") ||
        ids.has(turn.id) || !["user", "assistant"].includes(turn.role) ||
        typeof turn.content !== "string" ||
        !turn.content.trim() || BAD_CONTROLS.test(turn.content)) {
      fail("invalid-session-history");
    }
    ids.add(turn.id);
    const clipped = clipUtf8(turn.content.trim(), Math.min(remaining, MAX_TURN_BYTES));
    if (!clipped.text.trim()) fail("invalid-session-history");
    remaining -= clipped.bytes;
    // Content is untrusted *data*, never system or developer instructions.
    output.push(Object.freeze({
      sourceTurnId: turn.id, role: turn.role, content: clipped.text,
      untrustedSource: true, truncated: clipped.truncated
    }));
    if (remaining === 0) break;
  }
  output.reverse();
  return Object.freeze({
    turns: Object.freeze(output),
    totalBytes: MAX_TOTAL_BYTES - remaining,
    truncated: previous.length > selected.length ||
      output.some(x => x.truncated) || output.length < selected.length
  });
}

function digestFor({ uid, sourceId, requestId, turns }) {
  // Binds the approval to the exact owner, request, source and untrusted text.
  // A document change, newer turn or a different UID invalidates approval.
  const canonical = JSON.stringify({
    v: 1, uid, sourceId, requestId,
    turns: turns.map(x => [x.sourceTurnId, x.role, x.content])
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
function sameDigest(expected, actual) {
  if (typeof expected !== "string" || !SHA256_HEX.test(expected)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

function createSessionMemoryAdapter({ db, consentStore, projectId }) {
  if (projectId !== PROJECT_ID || !db || typeof db.doc !== "function" ||
      !consentStore || typeof consentStore.check !== "function") {
    fail("unsafe-environment");
  }
  async function load(args, { requireCommitted, approvedDigest } = {}) {
    const target = safeSourcePrincipal(
      args?.principal, args?.grantId, args?.sourceId,
      args?.requestId, args?.message
    );
    // No session read without an existing *server-private* scoped grant.
    if (await consentStore.check(target).catch(() => false) !== true) {
      fail("permission-denied");
    }
    const path = `artifacts/${NAMESPACE}/users/${target.uid}/sessions/${target.sourceId}`;
    const snapshot = await db.doc(path).get().catch(() => fail("unavailable"));
    if (!snapshot?.exists) fail("not-found");
    const session = snapshot.data();
    if (!plain(session) ||
        (session.ownerUid != null && session.ownerUid !== target.uid) ||
        (session.uid != null && session.uid !== target.uid)) {
      fail("permission-denied");
    }
    const selected = boundedPreviousTurns(session.chatHistory, {
      requestId: args.requestId, message: args.message, requireCommitted
    });
    const digest = digestFor({
      uid: target.uid, sourceId: target.sourceId,
      requestId: args.requestId, turns: selected.turns
    });
    if (approvedDigest !== undefined && !sameDigest(approvedDigest, digest)) {
      fail("permission-denied");
    }
    // Revoke/expiry during the read must not release even a preview.
    if (await consentStore.check(target).catch(() => false) !== true) {
      fail("permission-denied");
    }
    return { target, selected, digest };
  }

  async function preview(args) {
    const { selected, digest } = await load(args, { requireCommitted: false });
    return Object.freeze({
      sourceId: args.sourceId, scope: SCOPE, requestId: args.requestId,
      ...selected, approvalDigest: digest,
      providerDispatchAllowed: false
    });
  }

  async function authorize(args) {
    const { target, selected, digest } = await load(args, {
      requireCommitted: true, approvedDigest: args?.approvedDigest
    });
    if (!selected.turns.length) fail("permission-denied");
    // One final fresh permission check before the caller may enqueue egress.
    // The adapter itself never performs or authorizes background calls.
    if (await consentStore.check(target).catch(() => false) !== true) {
      fail("permission-denied");
    }
    return Object.freeze({
      sourceId: target.sourceId, requestId: args.requestId, approvalDigest: digest,
      turns: selected.turns, totalBytes: selected.totalBytes,
      authorizedAt: "pre-egress", store: false
    });
  }
  return Object.freeze({ preview, authorize });
}

module.exports = {
  MAX_PRIOR_TURNS, MAX_TURN_BYTES, MAX_TOTAL_BYTES,
  boundedPreviousTurns, digestFor, createSessionMemoryAdapter
};
