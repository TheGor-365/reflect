"use strict";

/**
 * AI-01B.2: READ-ONLY server adapter for user-scoped settings and grants.
 * It is intentionally unused by the current paid Grok handler.
 *
 * VERIFIED UID MUST COME FROM SERVER-CHECKED AUTH / APP CHECK.
 * Never pass an unchecked owner UID from request data into this reader.
 * No user-generated text, history, profile, goals or body data is loaded.
 */
const { settingsSnapshot } = require("./aiSettingsPolicy.cjs");
const { VERSION, KINDS } = require("./contextGrantPolicy.cjs");

const NAMESPACE = "reflect-8fdc8";
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_GRANTS = 100;
const validUid = v => typeof v === "string" && UID.test(v);
const validTime = v => Number.isSafeInteger(v) && v >= 0 &&
  v <= 8640000000000000;
const plain = v => v !== null && typeof v === "object" &&
  Object.getPrototypeOf(v) === Object.prototype;

class OwnerContextAccessError extends Error {
  constructor(code) {
    super(code);
    this.name = "OwnerContextAccessError";
    this.code = code;
  }
}
const fail = code => { throw new OwnerContextAccessError(code); };

function validatedGrant(raw, uid) {
  if (!plain(raw) || raw.ownerUid !== uid || raw.version !== VERSION ||
      !Object.hasOwn(KINDS, raw.scope) || raw.consent !== true ||
      !Array.isArray(raw.sourceIds) ||
      raw.sourceIds.length < 1 || raw.sourceIds.length > 100 ||
      !raw.sourceIds.every(id => typeof id === "string" && VALID_ID.test(id)) ||
      !validTime(raw.approvedAt) || !validTime(raw.expiresAt) ||
      (raw.revokedAt != null && !validTime(raw.revokedAt))) return null;

  return Object.freeze({
    ownerUid: uid, version: VERSION, scope: raw.scope, consent: true,
    sourceIds: Object.freeze([...new Set(raw.sourceIds)]),
    approvedAt: raw.approvedAt, expiresAt: raw.expiresAt,
    revokedAt: raw.revokedAt == null ? null : raw.revokedAt
  });
}

/**
 * This method does not check source validity, source ownership or relevance:
 * that still belongs to the verified fetch + ContextSelector + grantAllows.
 * A missing/invalid grant snapshot yields NO grants; a failed read throws.
 */
async function loadOwnerContextAccess({ db, verifiedUid, requestedUid } = {}) {
  if (!validUid(verifiedUid) || !validUid(requestedUid) ||
      verifiedUid !== requestedUid) fail("unauthenticated");
  if (!db || typeof db.collection !== "function") fail("unsafe-environment");

  const ownerRef = db.collection("artifacts").doc(NAMESPACE)
    .collection("users").doc(verifiedUid);
  const settingsRef = ownerRef.collection("aiSettings").doc("preferences");
  const grantRef = ownerRef.collection("aiContextGrants");
  try {
    const [settingsDoc, grantDocs] = await Promise.all([
      settingsRef.get(),
      grantRef.limit(MAX_GRANTS + 1).get()
    ]);
    if (!settingsDoc || typeof settingsDoc.exists !== "boolean" ||
        !grantDocs || !Array.isArray(grantDocs.docs) ||
        grantDocs.docs.length > MAX_GRANTS) fail("invalid-permission-state");
    const settings = settingsSnapshot(
      settingsDoc.exists ? settingsDoc.data() : null
    );
    if (settings.status === "invalid") {
      // Completely fail closed; malformed preference docs do not authorize
      // use of otherwise stored grant records.
      return Object.freeze({ settings, grants: Object.freeze([]) });
    }
    const grants = [];
    for (const item of grantDocs.docs) {
      const entry = item?.data?.();
      const checked = validatedGrant(entry, verifiedUid);
      if (!checked) fail("invalid-permission-state");
      grants.push(checked);
    }
    return Object.freeze({ settings, grants: Object.freeze(grants) });
  } catch (err) {
    if (err instanceof OwnerContextAccessError) throw err;
    // Never return permissive defaults after network or database failure:
    // that could hide a previously revoked consent record.
    fail("permissions-unavailable");
  }
}

module.exports = {
  loadOwnerContextAccess, validatedGrant, OwnerContextAccessError
};
