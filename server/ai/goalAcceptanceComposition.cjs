"use strict";
// No Railway registration, secret loading or provider dependency.
// The caller must reuse verified Auth, consumed App Check + replay guard,
// and staging entitlement from the existing trusted runtime.
const { createGoalAcceptanceRuntime } = require("./goalAcceptanceRuntime.cjs");
const { createGoalAcceptanceService } = require("./goalAcceptanceService.cjs");
const { createGoalAcceptanceHttpListener } = require("./goalAcceptanceHttp.cjs");
function createGoalAcceptanceComposition({ db, projectId, locallyEnabled = false,
  provenance, verifyAuth, verifyAppCheck, authorizeAccount, clock = Date.now } = {}) {
  if (projectId !== "reflect-ai-staging" || typeof locallyEnabled !== "boolean") {
    throw Error("unsafe-environment");
  }
  if (!locallyEnabled) return null;
  const runtime = createGoalAcceptanceRuntime({ db, projectId, locallyEnabled, clock });
  const service = createGoalAcceptanceService({ db, projectId, provenance, clock });
  return createGoalAcceptanceHttpListener({ verifyAuth, verifyAppCheck, authorizeAccount,
    checkEnabled: runtime.checkEnabled, rateLimit: runtime.rateLimit, accept: service.accept });
}
module.exports = { createGoalAcceptanceComposition };
