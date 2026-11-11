"use strict";

/**
 * Staging-only fail-closed defense in depth for verified Firebase App Check
 * limited-use tokens. Firebase's consume:true remains mandatory; this private
 * Firestore ledger additionally rejects a repeated token across all Railway
 * replicas AND routes, even if the upstream consumed marker is inconsistent.
 *
 * No raw tokens, UID, token payloads or request bodies are persisted or logged.
 * Requires a separately reviewed Firestore TTL policy on "expiresAt" prior to
 * any staging rollout. Expired rows may otherwise accumulate indefinitely.
 */
const { createHash } = require("node:crypto");
const { PolicyError } = require("../ai/policy.cjs");

const PROJECT_ID = "reflect-ai-staging";
const NAMESPACE = "reflect-8fdc8";
const MAX_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000;

function createAppCheckReplayGuard({ db, projectId, clock = Date.now }) {
  if (!db || typeof db.doc !== "function" ||
      typeof db.runTransaction !== "function" ||
      projectId !== PROJECT_ID || typeof clock !== "function") {
    throw new PolicyError("unsafe-environment");
  }

  return Object.freeze({
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
        return await db.runTransaction(async tx => {
          const previous = await tx.get(record);
          if (previous.exists) return false;
          tx.create(record, {
            schemaVersion: 1,
            createdAt: new Date(nowMs),
            expiresAt: new Date(expiresAtMs)
          });
          return true;
        });
      } catch {
        // A transaction outage or collision must never allow the request.
        throw new PolicyError("unavailable");
      }
    }
  });
}

module.exports = { createAppCheckReplayGuard, PROJECT_ID, NAMESPACE };
