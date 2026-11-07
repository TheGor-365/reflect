"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const admin = require("firebase-admin");
const { createHostedHandler } = require("./hostedHandler.cjs");
const { PolicyError, CONSENT_VERSION } = require("./policy.cjs");
const { ROOT, NAMESPACE, LIMITS_TICKS } = require("./hostedBudget.cjs");

const PROJECT = "reflect-ai-stage-fixture01";
const APP_ID = "1:12345:web:stagingfixture";
const UID = "fixture-owner-a";
const MESSAGE = "Это вымышленная ситуация. Как выбрать первый шаг?";
const KEY = "xai-" + "X".repeat(40); // never a real secret
const NOW = Date.parse("2026-11-07T12:00:00Z");
const denied = code => error =>
  error instanceof PolicyError &&
  error.code === code &&
  error.message === "AI request rejected by server policy.";
const body = (requestId, overrides = {}) => ({
  requestId, message: MESSAGE,
  consent: { granted: true, scope: "one-message", version: CONSENT_VERSION },
  ...overrides
});
const ctx = (requestId, overrides = {}) => ({
  auth: { uid: UID },
  app: { appId: APP_ID },
  data: body(requestId), ...overrides
});
const hash = str => createHash("sha256").update(str).digest("hex");

const expected = project => project === PROJECT;
if (!expected(process.env.GCLOUD_PROJECT) ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:19084") {
  throw Error("Stage04G tests require isolated Firestore emulator");
}

if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
let counter = 0;
function unique() {
  return "hostedfixture" + String(++counter).padStart(12, "0");
}
const root = db.collection(ROOT).doc(NAMESPACE);
const flag = root.collection("runtimeFlags").doc("ai");
const validReply = () => new Response(JSON.stringify({
  model: "grok-4.3", status: "completed",
  output: [{
    type: "message", role: "assistant",
    content: [{ type: "output_text", text: "Начните с малого шага." }]
  }],
  usage: { input_tokens: 120, output_tokens: 28, cost_in_usd_ticks: 195000 }
}), {
  status: 200, headers: { "content-type": "application/json" }
});
const create = ({
  clock = () => NOW, transport = async () => validReply(),
  secret = () => KEY
} = {}) => createHostedHandler({
  db, projectId: PROJECT, appId: APP_ID,
  readSecret: secret, transport, clock
});

test.before(async () => {
  await db.recursiveDelete(root);
  await flag.set({ enabled: true });
});
test.after(async () => {
  await db.recursiveDelete(root);
  await Promise.all(admin.apps.map(x => x.delete()));
});

test("cannot execute with missing Auth, unverified App Check or wrong app", async () => {
  let calls = 0;
  const handler = create({ transport: async () => {
    calls++; return validReply();
  }});
  const id = unique();
  for (const request of [
    ctx(id, { auth: null }),
    ctx(id, { app: null }),
    ctx(id, { app: { appId: "other" } }),
    ctx(id, { app: { appId: APP_ID, alreadyConsumed: true } })
  ]) {
    await assert.rejects(handler(request), denied("unauthenticated"));
  }
  assert.equal(calls, 0);
});

test("only explicit one-message consent, no history/model/profile accepted", async () => {
  let calls = 0;
  const handler = create({ transport: async () => {
    calls++; return validReply();
  }});
  for (const overrides of [
    { consent: { granted: false, scope: "one-message", version: CONSENT_VERSION } },
    { history: [MESSAGE] }, { model: "other" }, { uid: UID },
    { message: "A".repeat(1400) },
    { message: "😀".repeat(1000) }
  ]) {
    const id = unique();
    await assert.rejects(handler(ctx(id, { data: body(id, overrides) })),
      error => denied("permission-denied")(error) ||
        denied("invalid-argument")(error));
  }
  assert.equal(calls, 0);
});

test("staging kill switch blocks calls before secret read or provider", async () => {
  let calls = 0, keyReads = 0;
  const handler = create({
    transport: async () => { calls++; return validReply(); },
    secret: () => { keyReads++; return KEY; }
  });
  await flag.set({ enabled: false });
  await assert.rejects(handler(ctx(unique())), denied("unavailable"));
  assert.equal(keyReads, 0);
  assert.equal(calls, 0);
  await flag.set({ enabled: true });
});

test("one approved request produces signed-context provider call and a receipt", async () => {
  let calls = 0;
  const id = unique();
  const handler = create({
    transport: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.x.ai/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer " + KEY);
      assert.equal(JSON.parse(options.body).input[1].content, MESSAGE);
      assert.equal(JSON.parse(options.body).store, false);
      return validReply();
    }
  });
  const output = await handler(ctx(id));
  assert.equal(calls, 1);
  assert.equal(output.model, "grok-4.3");
  assert.equal(output.text, "Начните с малого шага.");
  assert.equal(output.actualUsdTicks, 195000);
  assert.equal(JSON.stringify(output).includes(MESSAGE), false);
  const document = await root.collection("requestLedger").doc(
    hash("request\0" + UID + "\0" + id)
  ).get();
  assert.equal(document.data().status, "completed");
  assert.equal(document.data().actualUsdTicks, 195000);
  assert.equal(document.data().reservedUsdTicks, LIMITS_TICKS.maxPerRequestTicks);
  assert.equal(JSON.stringify(document.data()).includes(MESSAGE), false);
  assert.equal(JSON.stringify(document.data()).includes(UID), false);
  await assert.rejects(handler(ctx(id)), denied("already-exists"));
  assert.equal(calls, 1);
});

test("provider failure retains budget reservation and immutable ID", async () => {
  let calls = 0;
  const id = unique();
  const handler = create({ transport: async () => {
    calls++;
    return new Response('{"message":"SENSITIVE_PROVIDER_BODY"}', { status: 429 });
  }});
  await assert.rejects(handler(ctx(id)), denied("unavailable"));
  await assert.rejects(handler(ctx(id)), denied("already-exists"));
  assert.equal(calls, 1);
  const doc = await root.collection("requestLedger").doc(
    hash("request\0" + UID + "\0" + id)
  ).get();
  assert.equal(doc.data().status, "failed");
  assert.equal(doc.data().reservedUsdTicks, LIMITS_TICKS.maxPerRequestTicks);
  assert.equal(doc.data().actualUsdTicks, null);
  assert.equal(JSON.stringify(doc.data()).includes("SENSITIVE_"), false);
});

test("same request ID remains blocked on following UTC day", async () => {
  let time = NOW + 3600000;
  const handler = create({ clock: () => time });
  const id = unique();
  await handler(ctx(id));
  time += 86400000;
  await assert.rejects(handler(ctx(id)), denied("already-exists"));
});

test("financial overspend receipt disables further new reservations", async () => {
  const handler = create({
    clock: () => NOW + 2 * 86400000,
    transport: async () => new Response(JSON.stringify({
      model: "grok-4.3", status: "completed",
      output: [{ type: "message", role: "assistant",
        content: [{ type: "output_text", text: "Тест." }] }],
      usage: {
        input_tokens: 100, output_tokens: 15,
        cost_in_usd_ticks: LIMITS_TICKS.maxPerRequestTicks + 1
      }
    }), { status: 200, headers: { "content-type": "application/json" } })
  });
  const result = await handler(ctx(unique()));
  assert.equal(result.model, "grok-4.3");
  assert.equal((await flag.get()).data().enabled, false);
  await assert.rejects(handler(ctx(unique())), denied("unavailable"));
});

test("wrong project fails closed before contacting Firestore", () => {
  assert.throws(() => createHostedHandler({
    db, projectId: "unrelated-production-project",
    appId: APP_ID, readSecret: () => KEY,
    transport: async () => validReply()
  }), denied("unsafe-environment"));
});
