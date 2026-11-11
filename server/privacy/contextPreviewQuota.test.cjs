"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPreviewQuota, MAX_PREVIEWS_PER_UTC_HOUR, HOUR_MS } = require("./contextPreviewQuota.cjs");
const { PROJECT_ID, NAMESPACE } = require("./contextConsent.cjs");

const OWNER = "synthetic-owner";
const OTHER = "synthetic-other";
const NOW = 1794340000000;
const path = uid => `_reflectAiPrivate/${NAMESPACE}/contextPreviewQuotas/${uid}`;

function fakeDb() {
  const docs = new Map();
  const paths = [];
  const created = [];
  const tx = {
    async get(ref) {
      return {
        exists: docs.has(ref.path),
        data: () => docs.get(ref.path)
      };
    },
    create(ref, value) {
      assert.equal(docs.has(ref.path), false);
      docs.set(ref.path, value);
      created.push(ref.path);
    },
    update(ref, value) {
      assert.equal(docs.has(ref.path), true);
      docs.set(ref.path, value);
    }
  };
  const db = {
    doc(p) { paths.push(p); return { path: p }; },
    async runTransaction(callback) { return callback(tx); }
  };
  return { db, docs, paths, created };
}

test("requires private staging DB and strictly typed uid", async () => {
  const f = fakeDb();
  for (const opts of [
    { db: f.db, projectId: "not-staging" },
    { db: null, projectId: PROJECT_ID },
    { db: {}, projectId: PROJECT_ID }
  ]) assert.throws(() => createPreviewQuota(opts), { code: "unsafe-environment" });
  const quota = createPreviewQuota({ db: f.db, projectId: PROJECT_ID, clock: () => NOW });
  for (const bad of [null, undefined, 55, "", "../other"]) {
    await assert.rejects(() => quota.consume(bad), { code: "unauthenticated" });
  }
  assert.deepEqual(f.paths, []);
});

test("caps 20/hour per owner and other owner is independent", async () => {
  const f = fakeDb();
  const quota = createPreviewQuota({ db: f.db, projectId: PROJECT_ID, clock: () => NOW });
  for (let i = 0; i < MAX_PREVIEWS_PER_UTC_HOUR; i += 1) {
    assert.equal(await quota.consume(OWNER), true);
  }
  assert.equal(f.docs.get(path(OWNER)).count, MAX_PREVIEWS_PER_UTC_HOUR);
  await assert.rejects(() => quota.consume(OWNER), { code: "resource-exhausted" });
  assert.equal(await quota.consume(OTHER), true);
  assert.equal(f.docs.get(path(OTHER)).count, 1);
  assert.deepEqual(f.created, [path(OWNER), path(OTHER)]);
});

test("UTC hourly rollover resets count, rejects corrupt quota", async () => {
  const f = fakeDb();
  let now = NOW;
  const quota = createPreviewQuota({ db: f.db, projectId: PROJECT_ID, clock: () => now });
  assert.equal(await quota.consume(OWNER), true);
  now += HOUR_MS;
  assert.equal(await quota.consume(OWNER), true);
  assert.equal(f.docs.get(path(OWNER)).count, 1);
  f.docs.set(path(OWNER), {
    uid: OTHER, hour: Math.floor(now / HOUR_MS), count: -1
  });
  await assert.rejects(() => quota.consume(OWNER), { code: "invalid-preview-quota" });
});

test("untrusted or invalid clock fails closed", async () => {
  const f = fakeDb();
  for (const wrong of [NaN, Infinity, -1, "today"]) {
    const q = createPreviewQuota({
      db: f.db, projectId: PROJECT_ID, clock: () => wrong
    });
    await assert.rejects(() => q.consume(OWNER), { code: "invalid-server-time" });
  }
  assert.deepEqual(f.paths, []);
});
