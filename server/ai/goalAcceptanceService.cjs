"use strict";
const {createAccountRevocationFence}=require("../privacy/accountRevocationFence.cjs");

// R139 C3c.3b. Isolated server service; not exposed as an HTTP endpoint.
// Principal must come from verified Auth, not from the request body.
// Private acceptance records prove the historical acceptance event only,
// not the current content of a mutable owner goal.
const { createHash } = require("node:crypto");
const { createProvenanceKeyring } = require("./recommendationProvenanceKeyring.cjs");
const { validateGoalAcceptanceSource } = require("./goalAcceptanceSource.cjs");
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const valid = x => typeof x === "string" && ID.test(x);
const plain = x => x !== null && typeof x === "object" &&
  Object.getPrototypeOf(x) === Object.prototype;
const textOk = (x, max, optional = false) => typeof x === "string" &&
  x.length <= max && (optional || x.trim().length > 0) &&
  !/[\u0000-\u001f\u007f]/.test(x);
const fail = code => { const e = Error(code); e.code = code; throw e; };
const hash = value => createHash("sha256").update(value).digest("hex");

function createGoalAcceptanceService({ db, projectId, provenance, clock = Date.now, accountFenceEnabled = false }) {
  if (projectId !== "reflect-ai-staging" || !db ||
      typeof db.doc !== "function" || typeof db.runTransaction !== "function" ||
      typeof clock !== "function") fail("unsafe-environment");
  const accountFence=createAccountRevocationFence({db,projectId,locallyEnabled:accountFenceEnabled});
  const keyring = createProvenanceKeyring(provenance);
  async function accept(body, principal) {
    if (!valid(principal?.uid) || !plain(body) ||
        Object.keys(body).sort().join(",") !==
          "assistantTurnId,candidateIndex,confirmed,goalCriteria,goalPurpose,goalStep,goalTitle,sessionId,sourceTurnId" ||
        body.confirmed !== true || body.candidateIndex !== 0 ||
        !valid(body.sessionId) || !valid(body.assistantTurnId) ||
        typeof body.sourceTurnId !== "string" ||
        !/^user-[A-Za-z0-9_-]{12,80}$/.test(body.sourceTurnId) ||
        !textOk(body.goalTitle, 240) || !textOk(body.goalPurpose, 1000, true) ||
        !textOk(body.goalStep, 240) || !textOk(body.goalCriteria, 500)) fail("invalid-argument");
    const uid = principal.uid;
    const { sessionId, assistantTurnId, sourceTurnId, candidateIndex } = body;
    const goalId = "verified-" + hash(JSON.stringify([sessionId, assistantTurnId, candidateIndex]));
    const recommendationKey = "r-" + assistantTurnId + "-0";
    const ownerRoot = `artifacts/reflect-8fdc8/users/${uid}`;
    const privateRoot = `_reflectAiPrivate/reflect-8fdc8/attemptOwners/${uid}/sessions/${sessionId}`;
    const sessionRef = db.doc(ownerRoot + "/sessions/" + sessionId);
    const goalRef = db.doc(ownerRoot + "/goals/" + goalId);
    const guardRef = db.doc(privateRoot);
    const receiptRef = db.doc(privateRoot + "/turns/" + sourceTurnId);
    const acceptanceRef = db.doc(privateRoot + "/acceptances/" + goalId);
    const now = clock();
    if (!Number.isSafeInteger(now) || now <= 0) fail("unsafe-environment");
    return db.runTransaction(async tx => {
      if(accountFence) await accountFence.requireActive(tx,uid);
      const flag = await tx.get(db.doc("_reflectAiPrivate/reflect-8fdc8/runtimeFlags/goalAcceptance"));
      if (!flag.exists || flag.data()?.enabled !== true) fail("unavailable");
      const [session, goal, guard, receipt, acceptance] = await Promise.all([
        tx.get(sessionRef), tx.get(goalRef), tx.get(guardRef),
        tx.get(receiptRef), tx.get(acceptanceRef)
      ]);
      if (!session.exists || !receipt.exists) fail("invalid-source");
      const data = session.data();
      const checked = validateGoalAcceptanceSource({
        projectId, uid, sessionId, assistantTurnId, sourceTurnId, candidateIndex,
        session: data, receipt: receipt.data(),
        guard: guard.exists ? guard.data() : null, keyring
      });
      if (!checked.allowed) fail(checked.code);
      const decisions = data.recommendationDecisions === undefined
        ? {} : data.recommendationDecisions;
      if (!plain(decisions)) fail("invalid-source");
      if (acceptance.exists) {
        const prior = acceptance.data();
        if (prior.uid !== uid || prior.sessionId !== sessionId ||
            prior.sourceTurnId !== sourceTurnId || prior.assistantTurnId !== assistantTurnId ||
            prior.candidateIndex !== candidateIndex || prior.goalId !== goalId ||
            prior.status !== "accepted") fail("acceptance-conflict");
        // Never recreate a deleted goal or overwrite a user's edited goal.
        if (!goal.exists) fail("goal-no-longer-exists");
        return { goalId, status: "accepted", alreadyAccepted: true };
      }
      if (goal.exists || decisions[recommendationKey]?.status === "accepted") {
        fail("acceptance-conflict");
      }
      const createdAt = new Date(now);
      tx.set(goalRef, {
        text: body.goalTitle.trim(), purpose: body.goalPurpose.trim(),
        successCriteria: body.goalCriteria.trim(), type: "checklist",
        subItems: [{ id: goalId + "-step-0", text: body.goalStep.trim(), completed: false }],
        reflections: [], postponeCount: 0, completed: false, status: "active",
        sessionId, sourceRecommendationKey: recommendationKey,
        sourceMessageId: sourceTurnId, sourceAssistantMessageId: assistantTurnId,
        sourceType: "user-accepted-ai-recommendation", createdAt
      });
      tx.update(sessionRef, { recommendationDecisions: { ...decisions,
        [recommendationKey]: { status: "accepted", title: checked.title,
          assistantMessageId: assistantTurnId, sourceMessageId: sourceTurnId,
          candidateIndex, promptVersion: checked.promptVersion, goalId, decidedAt: createdAt }
      } });
      // No raw goal text, transcript or second copy of the source MAC.
      tx.set(acceptanceRef, { schemaVersion: 1, uid, sessionId, sourceTurnId,
        assistantTurnId, candidateIndex, goalId, status: "accepted", createdAt });
      return { goalId, status: "accepted", alreadyAccepted: false };
    });
  }
  return Object.freeze({ accept });
}
module.exports = { createGoalAcceptanceService };
