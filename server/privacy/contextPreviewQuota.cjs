"use strict";

/**
 * AI-01K: server-private, durable per-owner preview rate limiter.
 * Metadata only. Uses Firestore Admin transactions across Railway replicas.
 */
const { PolicyError } = require("../ai/policy.cjs");
const { PROJECT_ID, NAMESPACE } = require("./contextConsent.cjs");

const MAX_PREVIEWS_PER_UTC_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const fail = code => { throw new PolicyError(code); };
const plain = x => x && typeof x === "object" && !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;

function createPreviewQuota({ db, projectId, clock = Date.now }) {
  if (!db || typeof db.doc !== "function" ||
      typeof db.runTransaction !== "function" ||
      projectId !== PROJECT_ID || typeof clock !== "function") {
    fail("unsafe-environment");
  }

  return Object.freeze({
    async consume(uid) {
      if (typeof uid !== "string" || !UID.test(uid)) fail("unauthenticated");
      const now = clock();
      if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) {
        fail("invalid-server-time");
      }
      const hour = Math.floor(now / HOUR_MS);
      const ref = db.doc(
        `_reflectAiPrivate/${NAMESPACE}/contextPreviewQuotas/${uid}`
      );
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const prev = snap.exists ? snap.data() : null;
        if (snap.exists &&
            (!plain(prev) || prev.uid !== uid ||
             !Number.isSafeInteger(prev.hour) || prev.hour < 0 ||
             !Number.isSafeInteger(prev.count) || prev.count < 0 ||
             prev.count > MAX_PREVIEWS_PER_UTC_HOUR)) {
          fail("invalid-preview-quota");
        }
        const count = prev?.hour === hour ? prev.count : 0;
        if (count >= MAX_PREVIEWS_PER_UTC_HOUR) fail("resource-exhausted");
        const value = Object.freeze({ uid, hour, count: count + 1 });
        if (snap.exists) tx.update(ref, value);
        else tx.create(ref, value);
        return true;
      });
    }
  });
}

module.exports = {
  MAX_PREVIEWS_PER_UTC_HOUR, HOUR_MS, createPreviewQuota
};
