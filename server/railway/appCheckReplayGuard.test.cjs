"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAppCheckReplayGuard, PROJECT_ID } = require("./appCheckReplayGuard.cjs");
const NOW = 1794410000000;
const VERIFIED = { appId: "staging-app", alreadyConsumed: false,
  token: { exp: Math.floor(NOW / 1000) + 300 } };
const TOKEN = "synthetic-signed-firebase-app-check-token-for-tests-only-111";

function fixture() {
  const docs = new Map();
  const writes = [];
  let outage = false;
  // Serial transaction fixture; Firestore runTransaction handles actual
  // concurrent cross-replica isolation, to be acceptance-tested in emulator.
  let tail = Promise.resolve();
  const db = {
    doc(path) { return { path }; },
    runTransaction(callback) {
      const pending = tail.then(() => {
        if (outage) throw Error("synthetic-Firestore-down");
        return callback({
          get: async ref => ({ exists: docs.has(ref.path) }),
          create(ref, data) {
            if (docs.has(ref.path)) throw Error("duplicate-record");
            docs.set(ref.path, data);
            writes.push({ path: ref.path, data });
          }
        });
      });
      tail = pending.catch(() => {});
      return pending;
    }
  };
  return { db, docs, writes,
    guard: createAppCheckReplayGuard({ db, projectId: PROJECT_ID, clock: () => NOW }),
    setOutage: value => { outage = value; } };
}

test("first verified use accepted, sequential replay denied; raw token never persisted", async () => {
  const fx = fixture();
  assert.equal(await fx.guard.consume(TOKEN, VERIFIED), true);
  assert.equal(await fx.guard.consume(TOKEN, VERIFIED), false);
  assert.equal(fx.writes.length, 1);
  assert.match(fx.writes[0].path,
    /^_reflectAiPrivate\/reflect-8fdc8\/appCheckReplayTokens\/[a-f0-9]{64}$/);
  assert.equal(fx.writes[0].path.includes(TOKEN), false);
  assert.deepEqual(Object.keys(fx.writes[0].data).sort(),
    ["createdAt", "expiresAt", "schemaVersion"]);
  assert.equal(fx.writes[0].data.expiresAt.getTime(), VERIFIED.token.exp * 1000);
});

test("two guards sharing the same store cannot accept concurrent duplicate", async () => {
  const fx = fixture();
  const otherGuard = createAppCheckReplayGuard({
    db: fx.db, projectId: PROJECT_ID, clock: () => NOW
  });
  const results = await Promise.all([
    fx.guard.consume(TOKEN, VERIFIED), otherGuard.consume(TOKEN, VERIFIED)
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(fx.writes.length, 1);
});

test("different valid tokens are independent", async () => {
  const fx = fixture();
  assert.equal(await fx.guard.consume(TOKEN, VERIFIED), true);
  assert.equal(await fx.guard.consume(TOKEN + "-new", VERIFIED), true);
  assert.equal(fx.writes.length, 2);
});

test("consumed, missing, malformed, expired and long-lived claims fail closed", async () => {
  const fx = fixture();
  for (const claims of [
    { ...VERIFIED, alreadyConsumed: true },
    { ...VERIFIED, alreadyConsumed: undefined },
    { ...VERIFIED, token: {} },
    { ...VERIFIED, token: { exp: Math.floor(NOW / 1000) - 1 } },
    { ...VERIFIED, token: { exp: Math.floor(NOW / 1000) + 9 * 24 * 3600 } }
  ]) {
    await assert.rejects(fx.guard.consume(TOKEN, claims), { code: "unauthenticated" });
  }
  await assert.rejects(fx.guard.consume("short", VERIFIED), { code: "unauthenticated" });
  assert.equal(fx.writes.length, 0);
});

test("private Firestore outage fails closed", async () => {
  const fx = fixture();
  fx.setOutage(true);
  await assert.rejects(fx.guard.consume(TOKEN, VERIFIED), { code: "unavailable" });
  assert.equal(fx.writes.length, 0);
});

test("non-staging projects cannot instantiate this guard", () => {
  assert.throws(() => createAppCheckReplayGuard({
    db: { doc() {}, runTransaction() {} }, projectId: "production"
  }), { code: "unsafe-environment" });
});
