"use strict";

/**
 * Stage05B: server-side paid-AI entitlement for isolated Firebase staging.
 * Not imported by browser code. Neither the request body nor the browser can
 * grant access. This reader has NO provisioning/writing capability.
 */
const STAGE_PROJECT = "reflect-ai-staging";
const PRIVATE_ROOT = "_reflectAiPrivate";
const PRIVATE_NAMESPACE = "reflect-8fdc8"; // existing Firestore namespace, not production connection
const ENTITLEMENT_ROLE = "staging_tester";
const MODEL = "grok-4.3";
const MAX_VALIDITY_MS = 31 * 24 * 60 * 60 * 1000;
const UID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;

function createStagingEntitlementVerifier({ db, projectId, getUser, clock = Date.now }) {
  if (projectId !== STAGE_PROJECT || !db || db.projectId !== STAGE_PROJECT ||
      typeof db.collection !== "function" || typeof getUser !== "function" ||
      typeof clock !== "function") {
    throw new Error("Stage05B requires isolated staging Auth and Firestore");
  }
  const collection = db.collection(PRIVATE_ROOT).doc(PRIVATE_NAMESPACE)
    .collection("entitlements");
  return async function authorizeAccount(auth) {
    const uid = auth?.uid;
    if (typeof uid !== "string" || !UID_PATTERN.test(uid)) return false;
    try {
      // Read the *current* Firebase user, not a cached email_verified claim.
      // Changing or revoking an account takes effect without a browser redeploy.
      const user = await getUser(uid);
      if (user?.uid !== uid || user.disabled === true ||
          user.emailVerified !== true || !user.email ||
          auth?.firebase?.sign_in_provider === "anonymous") {
        return false;
      }
      const snapshot = await collection.doc(uid).get();
      const entitlement = snapshot.exists ? snapshot.data() : null;
      const expiresAt = entitlement?.expiresAt?.toMillis?.();
      const now = clock();
      return entitlement?.enabled === true &&
        entitlement?.role === ENTITLEMENT_ROLE &&
        entitlement?.model === MODEL &&
        Number.isSafeInteger(now) && now >= 0 &&
        Number.isSafeInteger(expiresAt) &&
        expiresAt > now && expiresAt <= now + MAX_VALIDITY_MS;
    } catch {
      // Transient Firebase/Auth/Firestore failures must never become access.
      // Do not leak account, Firestore path, UID, or provider errors.
      return false;
    }
  };
}

module.exports = { createStagingEntitlementVerifier };
