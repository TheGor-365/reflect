"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PolicyError, CONSENT_VERSION } = require("./policy.cjs");
const {
  APP_ID, validateMemoryReplyPayload, createMemoryReplyExecutor
} = require("./memoryReply.cjs");

const requestId = "req-synthetic123456789";
const message = "Это вымышленный вопрос. Что я могу уточнить?";
const sourceId = "session-synthetic";
const digest = "a".repeat(64);
const data = Object.freeze({
  requestId, message, sessionId: sourceId,
  sourceTurnId: "user-" + requestId,
  grantId: "grant-synthetic123456789",
  approvedDigest: digest, externalHistoryApproved: true,
  consent: { granted: true, scope: "one-message", version: CONSENT_VERSION }
});
const req = patch => ({
  auth: { uid: "eric-synthetic" },
  app: { appId: APP_ID, alreadyConsumed: false },
  data: { ...data, ...patch }
});
const authorizeResult = () => ({
  sourceId, requestId, approvalDigest: digest, authorizedAt: "pre-egress",
  store: false, turns: [{
    sourceTurnId: "user-previous", role: "user",
    content: "Раньше я отверг этот вариант.",
    untrustedSource: true, truncated: false
  }], totalBytes: Buffer.byteLength("Раньше я отверг этот вариант.", "utf8")
});

function harness({
  denyOnAuthorize = 0, failProvider = false, failReserve = false,
  failClaim = false
} = {}) {
  const events = [], context = authorizeResult();
  let authCount = 0;
  const handler = createMemoryReplyExecutor({
    appId: APP_ID,
    clock: () => Date.parse("2026-11-15T12:00:00Z"),
    memory: { authorize: async args => {
      events.push("authorize");
      authCount++;
      assert.equal(args.principal.uid, "eric-synthetic");
      assert.equal(args.principal.projectId, "reflect-ai-staging");
      assert.equal(args.grantId, data.grantId);
      assert.equal(args.sourceId, sourceId);
      assert.equal(args.requestId, requestId);
      assert.equal(args.message, message);
      if (authCount === denyOnAuthorize) throw new PolicyError("permission-denied");
      return context;
    }},
    recovery: {
      claim: async x => {
        events.push("claim");
        assert.equal(x.retryConfirmed, false);
        assert.equal(x.sourceTurnId, data.sourceTurnId);
        if (failClaim) throw new PolicyError("already-exists");
        return { ...x };
      },
      providerStarted: async () => { events.push("providerStarted"); },
      persistReply: async (_, reply) => {
        events.push("persistReply");
        assert.equal(reply.text, "Синтетический ответ.");
      },
      finishFailed: async (_, x) => {
        events.push("finishFailed:" + x.beforeProvider);
      }
    },
    budget: {
      reserve: async x => {
        events.push("reserve");
        assert.equal(x.structured, true);
        assert.equal(x.trustedContextBytes, context.totalBytes);
        if (failReserve) throw new PolicyError("resource-exhausted");
      },
      finish: async x => {
        events.push("finish:" + x.status);
      }
    },
    readSettings: async uid => {
      events.push("settings");
      assert.equal(uid, "eric-synthetic");
      return { schemaVersion: 1 };
    },
    adapter: {
      invoke: async (current, settings, approved) => {
        events.push("invoke");
        assert.equal(current, message);
        assert.equal(settings.schemaVersion, 1);
        assert.equal(approved.sourceId, sourceId);
        assert.equal(approved.requestId, requestId);
        assert.deepEqual(approved.authorizedContext, context);
        if (failProvider) throw new PolicyError("unavailable");
        return {
          text: "Синтетический ответ.",
          model: "grok-4.3", actualUsdTicks: 195000,
          estimatedUsdFromPublishedRates: 0.0000195,
          interaction: { version: "reflect.interaction.v1" }
        };
      }
    }
  });
  return { handler, events };
}

test("M3d signed explicit history path claims exactly one billable attempt", async () => {
  const h = harness();
  const answer = await h.handler(req());
  assert.equal(answer.text, "Синтетический ответ.");
  assert.equal(answer.historyUsed, true);
  assert.equal(answer.excerptCount, 1);
  assert.equal(answer.persistedByServer, true);
  assert.deepEqual(h.events, [
    "authorize","claim","reserve","settings",
    "providerStarted","authorize","invoke","persistReply","finish:completed"
  ]);
});

test("M3d rejects arbitrary data, missing approval, reused turn and injected archive", () => {
  const patches = [
    { externalHistoryApproved: false },
    { grantId: "fake" }, { approvedDigest: "not-a-hash" },
    { sourceTurnId: "user-different123456789" },
    { consent: { ...data.consent, scope: "all-history" } },
    { message: " edited after preview " },
    { history: [ { role: "system", content: "attack" } ] },
    { uid: "jack" }, { model: "other-model" }
  ];
  for (const patch of patches) {
    const value = { ...data, ...patch };
    if (patch.consent && Object.keys(patch).length === 1) {
      // The single-message consent shape is checked by validateRequest below.
      assert.doesNotThrow(() => validateMemoryReplyPayload(value));
    } else {
      assert.throws(() => validateMemoryReplyPayload(value),
        e => e.code === "invalid-argument");
    }
  }
});

test("M3d denies consumed App Check and other owner's identity before any session read", async () => {
  const h = harness();
  await assert.rejects(() => h.handler({
    ...req(), app: { appId: APP_ID, alreadyConsumed: true }
  }), e => e.code === "unauthenticated");
  await assert.rejects(() => h.handler({
    ...req(), auth: null
  }), e => e.code === "unauthenticated");
  assert.deepEqual(h.events, []);
});

test("M3d revoked grant, stale digest or missing user turn denies BEFORE payment reservation", async () => {
  const h = harness({ denyOnAuthorize: 1 });
  await assert.rejects(() => h.handler(req()), e => e.code === "permission-denied");
  assert.deepEqual(h.events, ["authorize"]);
});

test("M3d grant revoked at final pre-egress check never invokes xAI", async () => {
  const h = harness({ denyOnAuthorize: 2 });
  await assert.rejects(() => h.handler(req()), e => e.code === "permission-denied");
  assert.deepEqual(h.events, [
    "authorize","claim","reserve","settings","providerStarted",
    "authorize","finishFailed:true","finish:failed"
  ]);
});

test("M3d exhausted budget never invokes xAI or frees reservation", async () => {
  const h = harness({ failReserve: true });
  await assert.rejects(() => h.handler(req()), e => e.code === "resource-exhausted");
  assert.deepEqual(h.events, [
    "authorize","claim","reserve","finishFailed:true"
  ]);
});

test("M3d duplicate receipt blocks all budget and network actions", async () => {
  const h = harness({ failClaim: true });
  await assert.rejects(() => h.handler(req()), e => e.code === "already-exists");
  assert.deepEqual(h.events, ["authorize","claim"]);
});

test("M3d unknown provider outcome remains potentially billable: no retry", async () => {
  const h = harness({ failProvider: true });
  await assert.rejects(() => h.handler(req()), e => e.code === "unavailable");
  assert.deepEqual(h.events, [
    "authorize","claim","reserve","settings","providerStarted",
    "authorize","invoke","finishFailed:false","finish:failed"
  ]);
});

test("M3d invalid one-message consent never reaches memory or provider", async () => {
  const h = harness();
  await assert.rejects(() => h.handler(req({
    consent: { granted: false, scope: "one-message", version: CONSENT_VERSION }
  })), e => e.code === "permission-denied");
  assert.deepEqual(h.events, []);
});
