"use strict";

/**
 * AI-01A research/prototype: PURE consent policy, deliberately unused by the
 * live one-message Railway/Firebase endpoint. Grants must be fetched from the
 * authenticated owner's server-side storage, never accepted from request JSON.
 * No DB reads, provider calls, logging, credential access, or persistence here.
 */
const VERSION = "reflect-context-v1";
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const KINDS = Object.freeze({
  "this-session": Object.freeze(["sessionTurn"]),
  "selected-history": Object.freeze(["sessionTurn", "diaryEntry"]),
  "approved-memory": Object.freeze(["approvedMemory"]),
  "selected-goals": Object.freeze(["goal"]),
  "selected-body-checkins": Object.freeze(["bodyCheckin"])
});
const isPlain = x => x !== null && typeof x === "object" &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const validTime = n => Number.isSafeInteger(n) && n >= 0 &&
  n <= 8640000000000000;
const validId = x => typeof x === "string" && ID.test(x);

/**
 * Require explicit, unexpired, source-specific server-loaded opt-in for every
 * excerpt. No wildcard, entire-archive scope, unconfirmed grant or empty ID.
 * Returning false instead of throwing prevents using a malformed grant.
 */
function grantAllows({ uid, grant, sourceKind, sourceId, nowMs }) {
  if (!validId(uid) || !validTime(nowMs) || !isPlain(grant) ||
      grant.version !== VERSION || grant.consent !== true ||
      grant.ownerUid !== uid || !Array.isArray(grant.sourceIds) ||
      !validId(sourceId) || !Array.isArray(KINDS[grant.scope]) ||
      !KINDS[grant.scope].includes(sourceKind) ||
      !validTime(grant.approvedAt) || grant.approvedAt > nowMs ||
      !validTime(grant.expiresAt) || grant.expiresAt <= nowMs ||
      (grant.revokedAt != null && validTime(grant.revokedAt) &&
        grant.revokedAt <= nowMs) ||
      (grant.revokedAt != null && !validTime(grant.revokedAt)) ||
      grant.sourceIds.length < 1 || grant.sourceIds.length > 100 ||
      !grant.sourceIds.every(validId)) return false;
  return grant.sourceIds.includes(sourceId);
}

/** True only for an allowlisted *specific* source and an active grant. */
function hasSourceGrant({ uid, grants, sourceKind, sourceId, nowMs }) {
  return Array.isArray(grants) && grants.length <= 100 &&
    grants.some(grant => grantAllows({ uid, grant, sourceKind, sourceId, nowMs }));
}

module.exports = {
  VERSION, KINDS, grantAllows, hasSourceGrant
};
