"use strict";

/**
 * AI-01F / P1: server-side-only, intentionally unconnected context consent.
 *
 * This module has NO HTTP route, browser entrypoint, automatic provider call,
 * grant issuance on import, or historical-content reader. It must only be
 * invoked AFTER verified Firebase Auth + consumable App Check, and a separate
 * server-side account entitlement and source-access policy.
 *
 * An untrusted browser must never be able to create these private records via
 * Firestore SDK; the active _reflectAiPrivate rules deny all client access.
 */
const { PolicyError } = require("../ai/policy.cjs");

const PROJECT_ID = "reflect-ai-staging";
const NAMESPACE = "reflect-8fdc8";
const CONSENT_VERSION = "2026-11-10-01";
const SCHEMA_VERSION = 1;
const TTL_MS = 15 * 60 * 1000;
const SCOPE = "session-turns";
const ID = /^[A-Za-z0-9_-]{16,80}$/;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const UID = /^[A-Za-z0-9_-]{1,128}$/;

const fail = code => { throw new PolicyError(code); };
const isPlain = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactly = (value, keys) => isPlain(value) &&
  Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const safeTime = time => Number.isSafeInteger(time) && time >= 0 &&
  time <= 8640000000000000;

function assertPrincipal(principal) {
  if (!isPlain(principal) ||
      principal.projectId !== PROJECT_ID ||
      principal.appCheckVerified !== true ||
      typeof principal.uid !== "string" || !UID.test(principal.uid)) {
    fail("unauthenticated");
  }
  return principal.uid;
}

function parseContextConsentCommand(body, principal) {
  const uid = assertPrincipal(principal);
  if (!isPlain(body) || (body.action !== "grant" && body.action !== "revoke") ||
      typeof body.grantId !== "string" || !ID.test(body.grantId)) {
    fail("invalid-argument");
  }
  if (body.action === "revoke") {
    if (!exactly(body, ["action", "grantId"])) fail("invalid-argument");
    return Object.freeze({ uid, action: "revoke", grantId: body.grantId });
  }
  if (!exactly(body, ["action", "grantId", "scope", "sourceId", "consentVersion"]) ||
      body.scope !== SCOPE ||
      body.consentVersion !== CONSENT_VERSION ||
      typeof body.sourceId !== "string" || !SOURCE_ID.test(body.sourceId)) {
    fail("invalid-argument");
  }
  // Only a single explicitly chosen session, not "all history", profile,
  // diary, goals, summaries, a time range, or arbitrary Firestore paths.
  return Object.freeze({
    uid, action: "grant", grantId: body.grantId,
    scope: SCOPE, sourceId: body.sourceId
  });
}

function isActiveContextGrant(record, expected) {
  if (!isPlain(record) || !isPlain(expected) ||
      !safeTime(expected.nowMs) ||
      record.schemaVersion !== SCHEMA_VERSION ||
      record.consentVersion !== CONSENT_VERSION ||
      record.status !== "active" ||
      record.revokedAtMs !== null ||
      record.uid !== expected.uid ||
      record.grantId !== expected.grantId ||
      record.scope !== SCOPE || expected.scope !== SCOPE ||
      record.sourceId !== expected.sourceId ||
      !safeTime(record.grantedAtMs) ||
      !safeTime(record.expiresAtMs) ||
      record.expiresAtMs - record.grantedAtMs !== TTL_MS ||
      expected.nowMs < record.grantedAtMs ||
      expected.nowMs >= record.expiresAtMs) return false;
  return true;
}

function createContextConsentStore({ db, projectId, clock = Date.now }) {
  if (!db || typeof db.doc !== "function" ||
      typeof db.runTransaction !== "function" ||
      projectId !== PROJECT_ID ||
      typeof clock !== "function") fail("unsafe-environment");

  function privateGrantRef(uid, grantId) {
    return db.doc(`_reflectAiPrivate/${NAMESPACE}/contextGrants/${uid}/grants/${grantId}`);
  }

  async function execute(body, principal) {
    const cmd = parseContextConsentCommand(body, principal);
    const nowMs = clock();
    if (!safeTime(nowMs) || nowMs > 8640000000000000 - TTL_MS) {
      fail("invalid-server-time");
    }

    const recordRef = privateGrantRef(cmd.uid, cmd.grantId);
    // Immutable grantId makes old grant requests unable to reactivate an
    // individually revoked record; keep the tombstone, do not delete it.
    return db.runTransaction(async tx => {
      const currentSnapshot = await tx.get(recordRef);
      const existing = currentSnapshot.exists ? currentSnapshot.data() : null;

      if (cmd.action === "revoke") {
        if (!existing) return Object.freeze({ status: "revoked" });
        if (!isPlain(existing) || existing.uid !== cmd.uid ||
            existing.grantId !== cmd.grantId) fail("invalid-consent-state");
        if (existing.status !== "revoked") {
          tx.update(recordRef, { status: "revoked", revokedAtMs: nowMs });
        }
        return Object.freeze({ status: "revoked" });
      }

      if (existing) {
        if (isActiveContextGrant(existing, {
          uid: cmd.uid, grantId: cmd.grantId, sourceId: cmd.sourceId,
          scope: cmd.scope, nowMs
        })) return Object.freeze({ status: "active", expiresAtMs: existing.expiresAtMs });
        // Never replay an expired, revoked, malformed or collided grant ID.
        fail("already-exists");
      }

      // Session ownership must be checked with an Admin Firestore server read.
      // No collection query and no transcript extraction occurs here.
      const sessionRef = db.doc(
        `artifacts/${NAMESPACE}/users/${cmd.uid}/sessions/${cmd.sourceId}`
      );
      const sessionSnapshot = await tx.get(sessionRef);
      if (!sessionSnapshot.exists) fail("not-found");

      const record = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        consentVersion: CONSENT_VERSION,
        uid: cmd.uid,
        grantId: cmd.grantId,
        scope: cmd.scope,
        sourceId: cmd.sourceId,
        status: "active",
        grantedAtMs: nowMs,
        expiresAtMs: nowMs + TTL_MS,
        revokedAtMs: null
      });
      tx.create(recordRef, record);
      // No session content, personal data, UID or paths in the response.
      return Object.freeze({ status: "active", expiresAtMs: record.expiresAtMs });
    });
  }

  async function check({ uid, grantId, sourceId, scope }) {
    if (typeof uid !== "string" || !UID.test(uid) ||
        typeof grantId !== "string" || !ID.test(grantId) ||
        typeof sourceId !== "string" || !SOURCE_ID.test(sourceId) ||
        scope !== SCOPE) return false;
    const nowMs = clock();
    if (!safeTime(nowMs)) return false;
    // Read from private Admin Firestore on every check: no client cache.
    try {
      const doc = await privateGrantRef(uid, grantId).get();
      return doc.exists && isActiveContextGrant(doc.data(), {
        uid, grantId, sourceId, scope, nowMs
      });
    } catch {
      return false; // server outage must never become permission
    }
  }
  return Object.freeze({ execute, check });
}

module.exports = {
  PROJECT_ID, NAMESPACE, CONSENT_VERSION, SCHEMA_VERSION, TTL_MS, SCOPE,
  parseContextConsentCommand, isActiveContextGrant, createContextConsentStore
};
