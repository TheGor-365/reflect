"use strict";
// Isolated runtime dependencies. No environment flag or route registration.
// One fixed-window counter per owner; no goal text or provider usage.
const PROJECT = "reflect-ai-staging";
const ROOT = "_reflectAiPrivate/reflect-8fdc8";
const LIMIT = 10;
const HOUR_MS = 3600000;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const fail = code => { throw Object.assign(Error(code), { code }); };

function createGoalAcceptanceRuntime({ db, projectId, locallyEnabled = false, clock = Date.now }) {
  if (projectId !== PROJECT || !db || typeof db.doc !== "function" ||
      typeof db.runTransaction !== "function" || typeof locallyEnabled !== "boolean" ||
      typeof clock !== "function") fail("unsafe-environment");
  const flag = db.doc(ROOT + "/runtimeFlags/goalAcceptance");
  async function checkEnabled() {
    if (!locallyEnabled) return false;
    const snapshot = await flag.get();
    return snapshot.exists && snapshot.data()?.enabled === true;
  }
  async function rateLimit(uid) {
    if (typeof uid !== "string" || !UID.test(uid)) fail("invalid-argument");
    if (!locallyEnabled) fail("unavailable");
    const now = clock();
    if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) fail("unavailable");
    const hour = Math.floor(now / HOUR_MS);
    const ref = db.doc(ROOT + "/goalAcceptanceQuotas/" + uid);
    return db.runTransaction(async tx => {
      const [enabled, snapshot] = await Promise.all([tx.get(flag), tx.get(ref)]);
      if (!enabled.exists || enabled.data()?.enabled !== true) fail("unavailable");
      const prior = snapshot.exists ? snapshot.data() : null;
      if (snapshot.exists && (!prior || prior.uid !== uid ||
          !Number.isSafeInteger(prior.hour) || prior.hour < 0 || prior.hour > hour ||
          !Number.isSafeInteger(prior.count) || prior.count < 1 || prior.count > LIMIT)) {
        fail("unavailable");
      }
      const count = prior?.hour === hour ? prior.count : 0;
      if (count >= LIMIT) fail("resource-exhausted");
      tx.set(ref, { uid, hour, count: count + 1 });
      return true;
    });
  }
  return Object.freeze({ checkEnabled, rateLimit });
}
module.exports = { createGoalAcceptanceRuntime, LIMIT, HOUR_MS };
