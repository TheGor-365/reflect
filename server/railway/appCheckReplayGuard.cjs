"use strict";

/**
 * Staging-only fail-closed defense in depth for verified Firebase App Check
 * limited-use tokens. Firebase's consume:true remains mandatory; this private
 * Firestore ledger additionally rejects a repeated token across all Railway
 * replicas AND routes, even if the upstream consumed marker is inconsistent.
 *
 * No raw tokens, UID, token payloads or request bodies are persisted or logged.
 * Spark-compatible cleanup: a bounded, opportunistic Firestore batch prunes
 * records well after JWT expiry. No paid Firestore TTL policy is required.
 * A cleanup failure never turns a replay rejection into acceptance.
 */
const { createHash } = require("node:crypto");
const { PolicyError } = require("../ai/policy.cjs");

const PROJECT_ID = "reflect-ai-staging";
const NAMESPACE = "reflect-8fdc8";
const MAX_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000;
const CLEANUP_GRACE_MS = 10 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 64;
const CLEANUP_FRACTION = 16;

function createAppCheckReplayGuard({ db, projectId, clock = Date.now }) {
  if (!db || typeof db.doc !== "function" ||
      typeof db.collection !== "function" ||
      typeof db.batch !== "function" ||
      typeof db.runTransaction !== "function" ||
      projectId !== PROJECT_ID || typeof clock !== "function") {
    throw new PolicyError("unsafe-environment");
  }

  async function pruneExpired() {
    const nowMs = clock();
    if (!Number.isSafeInteger(nowMs) || nowMs < CLEANUP_GRACE_MS) {
      throw new PolicyError("unavailable");
    }
    // One collection only; never touch consent grants, owner sessions or
    // any other private data. All replay records are immutable.
    const expired = await db.collection(
      "_reflectAiPrivate/" + NAMESPACE + "/appCheckReplayTokens"
    ).where("expiresAt", "<=", new Date(nowMs - CLEANUP_GRACE_MS))
      .limit(CLEANUP_BATCH_SIZE).get();
    if (expired.empty) return 0;
    const batch = db.batch();
    for (const item of expired.docs) batch.delete(item.ref);
    await batch.commit();
    return expired.size;
  }

  return Object.freeze({
    pruneExpired,
    async consume(rawToken, verified) {
      const nowMs = clock();
      const exp = verified?.token?.exp;
      const expiresAtMs = exp * 1000;
      if (typeof rawToken !== "string" || rawToken.length < 20 ||
          rawToken.length > 8192 || verified?.alreadyConsumed !== false ||
          !Number.isSafeInteger(nowMs) || nowMs < 0 ||
          !Number.isSafeInteger(exp) ||
          !Number.isSafeInteger(expiresAtMs) ||
          expiresAtMs <= nowMs ||
          expiresAtMs - nowMs > MAX_TOKEN_LIFETIME_MS) {
        throw new PolicyError("unauthenticated");
      }

      // Signed Firebase tokens are high-entropy; the digest is only a private
      // deduplication key, not an identifier ever returned to the browser.
      const fingerprint = createHash("sha256")
        .update(rawToken, "utf8").digest("hex");
      const record = db.doc(
        "_reflectAiPrivate/" + NAMESPACE + "/appCheckReplayTokens/" + fingerprint
      );
      try {
        const firstUse = await db.runTransaction(async tx => {
          const previous = await tx.get(record);
          if (previous.exists) return false;
          tx.create(record, {
            schemaVersion: 1,
            createdAt: new Date(nowMs),
            expiresAt: new Date(expiresAtMs)
          });
          return true;
        });
        // Roughly 1/16 of verified new tokens trigger up to 64 expired
        // deletions. Deterministic sampling needs no process-local counters,
        // works after restarts and amortizes Firestore Spark free-tier usage.
        if (firstUse && parseInt(fingerprint.slice(0, 2), 16) % CLEANUP_FRACTION === 0) {
          try { await pruneExpired(); } catch { /* cleanup only; fail closed auth unaffected */ }
        }
        return firstUse;
      } catch {
        // A transaction outage or collision must never allow the request.
        throw new PolicyError("unavailable");
      }
    }
  });
}

module.exports = { createAppCheckReplayGuard, PROJECT_ID, NAMESPACE };
