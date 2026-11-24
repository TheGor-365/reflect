"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvenanceRetention } = require("./provenanceRetention.cjs");
const DELETE = Symbol("delete-field");
const root = "_reflectAiPrivate/reflect-8fdc8/attemptOwners/alice/sessions/s1";
const live = "artifacts/reflect-8fdc8/users/alice/sessions/s1";

function fixture(count = 2) {
  const docs = new Map();
  for (let i = 0; i < count; i++) {
    docs.set(root + "/turns/u" + String(i).padStart(3, "0"),
      { status: "persisted_reply", billedPossible: true, provenance: { mac: "synthetic" } });
  }
  const foreign = root.replace("/alice/", "/bob/") + "/turns/u000";
  docs.set(foreign, { provenance: { mac: "foreign" } });
  const ref = path => ({ path });
  const db = {
    doc: ref,
    collection(path) {
      const q = { path, cursor: null, size: 100,
        orderBy(field) { assert.equal(field, "__name__"); return this; },
        limit(size) { this.size = size; return this; },
        startAfter(cursor) { this.cursor = cursor; return this; } };
      return q;
    },
    async runTransaction(work) {
      const writes = [];
      const result = await work({
        async get(r) {
          if (!("size" in r)) return { exists: docs.has(r.path), data: () => docs.get(r.path) };
          return { docs: [...docs.keys()].filter(p => p.startsWith(r.path + "/"))
            .sort().filter(p => r.cursor === null || p.split("/").pop() > r.cursor)
            .slice(0, r.size).map(p => ({ id: p.split("/").pop(), ref: ref(p),
              data: () => docs.get(p) })) };
        },
        set(r, data, options) { assert.equal(options.merge, true);
          writes.push(() => docs.set(r.path, { ...docs.get(r.path), ...data })); },
        update(r, data) { writes.push(() => {
          assert.equal(data.provenance, DELETE);
          const next = { ...docs.get(r.path) }; delete next.provenance; docs.set(r.path, next);
        }); }
      });
      writes.forEach(write => write());
      return result;
    }
  };
  return { docs, foreign, service: createProvenanceRetention({
    db, projectId: "reflect-ai-staging", deleteField: () => DELETE }) };
}

test("deleted session cleanup strips only provenance and preserves other owner and accounting", async () => {
  const { docs, foreign, service } = fixture();
  docs.set(root, { provenanceRevoked: true });
  assert.deepEqual(await service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" }),
    { scrubbed: 2, done: true });
  assert.deepEqual(docs.get(root + "/turns/u000"), { status: "persisted_reply", billedPossible: true });
  assert.equal(docs.get(foreign).provenance.mac, "foreign");
  assert.equal(docs.get(root).provenanceRevoked, true);
  assert.equal((await service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" })).scrubbed, 0);
});

test("existing session including archived session cannot be scrubbed", async () => {
  const { docs, service } = fixture();
  docs.set(live, { archivedAt: 1 });
  await assert.rejects(service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" }), /session-still-exists/);
  assert.equal(docs.has(root), false);
  assert.ok(docs.get(root + "/turns/u000").provenance);
});

test("bounded cleanup resumes with private cursor and preserves unrelated metadata", async () => {
  const { docs, service } = fixture(101);
  docs.set(root, { provenanceRevoked: true });
  const first = await service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" });
  assert.deepEqual(first, { scrubbed: 100, done: false });
  assert.deepEqual(docs.get(root).turnCleanup, { done: false, cursor: "u099" });
  docs.set(live, { chatHistory: [] }); // recreated session cannot cancel revoked cleanup
  assert.deepEqual(await service.scrubDeletedSession({ sessionId: "s1" }, { uid: "alice" }),
    { scrubbed: 1, done: true });
  assert.equal(docs.get(root + "/turns/u100").provenance, undefined);
});

test("reject malformed identity, path and environment", async () => {
  const { service } = fixture();
  for (const [body, principal] of [
    [{ sessionId: "s1" }, null], [{ sessionId: "../s1" }, { uid: "alice" }],
    [{ sessionId: "s1", cursor: "../u" }, { uid: "alice" }],
    [{ sessionId: "s1" }, { uid: "../bob" }]
  ]) await assert.rejects(service.scrubDeletedSession(body, principal), /invalid-retention-target/);
  assert.throws(() => createProvenanceRetention({ projectId: "production" }), /unsafe-retention-environment/);
});

test("cleanup cannot create arbitrary tombstones or accept caller cursor", async () => {
  const { docs, service } = fixture();
  await assert.rejects(service.scrubDeletedSession({sessionId:"s1"}, {uid:"alice"}), /revocation-required/);
  assert.equal(docs.has(root),false);
  docs.set(root,{provenanceRevoked:true});
  await assert.rejects(service.scrubDeletedSession({sessionId:"s1",cursor:"u999"}, {uid:"alice"}), /invalid-retention-target/);
  assert.ok(docs.get(root+"/turns/u000").provenance);
});
test("malformed private progress fails closed", async () => {
  const {docs,service}=fixture();
  docs.set(root,{provenanceRevoked:true,turnCleanup:{done:false,cursor:null}});
  await assert.rejects(service.scrubDeletedSession({sessionId:"s1"},{uid:"alice"}),/invalid-retention-progress/);
  assert.ok(docs.get(root+"/turns/u000").provenance);
});
