"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadOwnerSelectedEvidence, EvidenceReadError, MAX_DOCUMENT_READS } =
  require("./ownerEvidenceReader.cjs");
const { DEFAULTS } = require("./aiSettingsPolicy.cjs");
const { VERSION } = require("./contextGrantPolicy.cjs");

const UID = "syntheticOwner";
const NOW = 1794340000000;
const stamp = ms => ({ toMillis: () => ms });
const grant = (scope, sourceIds, change = {}) => ({
  version: VERSION, ownerUid: UID, scope, sourceIds,
  consent: true, approvedAt: NOW - 9000, expiresAt: NOW + 9000,
  revokedAt: null, ...change
});
const goal = (text, at = NOW - 1000) => ({ text, createdAt: stamp(at) });
const diary = (text, extra = {}) => ({
  source: "manual", createdAt: stamp(NOW - 2000),
  entries: [{ text, createdAt: stamp(NOW - 2000) }], ...extra
});

function fixture({ preferences = DEFAULTS, grants = [],
  records = {}, failPaths = [] } = {}) {
  const paths = [];
  const db = {
    collection: name => ref(name)
  };
  function ref(path) {
    return {
      collection: name => ref(path + "/" + name),
      doc: id => ref(path + "/" + id),
      limit: size => { paths.push("limit:" + path + ":" + size); return ref(path); },
      get: async () => {
        paths.push(path);
        if (failPaths.includes(path)) throw new Error("synthetic storage error");
        if (path.endsWith("/aiSettings/preferences")) {
          return { exists: preferences != null, data: () => preferences };
        }
        if (path.endsWith("/aiContextGrants")) {
          return { docs: grants.map(data => ({ data: () => data })) };
        }
        if (Object.hasOwn(records, path)) {
          return { exists: true, data: () => records[path] };
        }
        return { exists: false };
      }
    };
  }
  const path = (kind, id) => `artifacts/reflect-8fdc8/users/${UID}/${kind}/${id}`;
  return { db, paths, path };
}
const call = (db, options = {}) => loadOwnerSelectedEvidence({
  db, verifiedUid: UID, requestedUid: UID, nowMs: NOW, ...options
});

test("no grants means no diary or goal reads, no context, no model", async () => {
  const f = fixture({ records: {
    "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/private": diary("private")
  }});
  const result = await call(f.db);
  assert.equal(result.excerpts.length, 0);
  assert.equal(result.documentReads, 0);
  assert.equal(f.paths.filter(p => p.includes("/diaryNotes/")).length, 0);
  assert.deepEqual(result.unsupportedKinds, []);
});

test("only explicitly authorized exact documents are read, not entire collections", async () => {
  const f = fixture({
    grants: [
      grant("selected-history", ["allowedDiary"]),
      grant("selected-goals", ["allowedGoal"])
    ],
    records: {
      "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/allowedDiary":
        diary("I learned something"),
      "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/unapprovedDiary":
        diary("Never include my other entry"),
      "artifacts/reflect-8fdc8/users/syntheticOwner/goals/allowedGoal":
        goal("Prepare a simple plan"),
      "artifacts/reflect-8fdc8/users/syntheticOwner/goals/otherGoal":
        goal("Private target")
    }
  });
  const result = await call(f.db);
  assert.deepEqual(result.excerpts.map(e => e.sourceId), ["allowedGoal", "allowedDiary"]);
  assert.equal(result.documentReads, 2);
  assert.equal(f.paths.includes(f.path("diaryNotes", "unapprovedDiary")), false);
  assert.equal(f.paths.includes(f.path("goals", "otherGoal")), false);
  assert.equal(f.paths.some(p => p.endsWith("/diaryNotes") || p.endsWith("/goals")), false);
  assert.equal(JSON.stringify(result).includes("Never include"), false);
  assert.equal(JSON.stringify(result).includes("Private target"), false);
  assert.equal(result.excerpts.every(e => e.untrustedEvidence === true), true);
});

test("wrong owner never triggers a single Firestore request", async () => {
  const f = fixture({ grants: [grant("selected-history", ["note1"])] });
  await assert.rejects(call(f.db, { requestedUid: "foreignOwner" }),
    error => error instanceof EvidenceReadError && error.code === "unauthenticated");
  assert.equal(f.paths.length, 0);
});

test("revoked or expired grants prevent every source document read", async () => {
  for (const changes of [
    { revokedAt: NOW - 1 }, { expiresAt: NOW - 1 },
    { approvedAt: NOW + 1 }
  ]) {
    const f = fixture({ grants: [grant("selected-history", ["note1"], changes)],
      records: {
        "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/note1": diary("secret")
      } });
    const result = await call(f.db);
    assert.equal(result.excerpts.length, 0);
    assert.equal(result.documentReads, 0);
    assert.equal(f.paths.some(p => p.endsWith("/diaryNotes/note1")), false);
  }
});

test("unsupported session turn and body check-in require separate safe storage protocol", async () => {
  const f = fixture({ grants: [
    grant("this-session", ["oldChatTurn"]),
    grant("selected-body-checkins", ["body1"]),
    grant("approved-memory", ["memory1"])
  ] });
  const result = await call(f.db);
  assert.deepEqual(result.unsupportedKinds,
    ["approvedMemory", "bodyCheckin", "sessionTurn"]);
  assert.equal(result.documentReads, 0);
  assert.equal(result.excerpts.length, 0);
  assert.equal(f.paths.some(p => p.includes("/sessions/")), false);
});

test("old AI-generated note and revision snapshot never enter user-authored context", async () => {
  const f = fixture({
    grants: [grant("selected-history", ["aiEntry", "revisions"])],
    records: {
      "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/aiEntry":
        diary("AI suggestion", { source: "assistant" }),
      "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/revisions":
        diary("Latest user text", {
          entries: [{ text: "Latest user text",
            versions: [{ text: "Old private snapshot" }] }]
        })
    }
  });
  const result = await call(f.db);
  assert.deepEqual(result.excerpts.map(e => e.sourceId), ["revisions"]);
  assert.equal(JSON.stringify(result).includes("AI suggestion"), false);
  assert.equal(JSON.stringify(result).includes("Old private snapshot"), false);
  assert.equal(result.excerpts[0].excerpt, "Latest user text");
});

test("missing/invalid/deleted/oversized evidence never yields a fabricated excerpt", async () => {
  const f = fixture({
    grants: [grant("selected-history", ["missing", "large", "future", "broken"])],
    records: {
      "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/large":
        diary("x".repeat(801)),
      "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/future":
        diary("future", { createdAt: stamp(NOW + 100000) }),
      "artifacts/reflect-8fdc8/users/syntheticOwner/diaryNotes/broken":
        diary("valid", { entries: [{ missing: "text" }] })
    }
  });
  const result = await call(f.db);
  assert.equal(result.excerpts.length, 0);
  assert.equal(result.documentReads, 4);
});

test("storage failures abort whole selection; no partial context is returned", async () => {
  const f = fixture({
    grants: [grant("selected-goals", ["ok", "broken"])],
    records: { "artifacts/reflect-8fdc8/users/syntheticOwner/goals/ok": goal("Allowed") },
    failPaths: ["artifacts/reflect-8fdc8/users/syntheticOwner/goals/broken"]
  });
  await assert.rejects(call(f.db),
    error => error.code === "source-unavailable" &&
      !error.message.includes("synthetic storage error"));
});

test("bounds total document reads and deduplicates permission source IDs", async () => {
  const ids = Array.from({ length: 14 }, (_, i) => "note" + i);
  const records = {};
  const f = fixture({
    grants: [grant("selected-history", [...ids, ...ids.slice(0, 3)])],
    records
  });
  const result = await call(f.db);
  assert.equal(result.documentReads, MAX_DOCUMENT_READS);
  const reads = f.paths.filter(p => p.includes("/diaryNotes/"));
  assert.equal(reads.length, MAX_DOCUMENT_READS);
  assert.equal(new Set(reads).size, MAX_DOCUMENT_READS);
  assert.equal(Object.isFrozen(result.excerpts), true);
  assert.equal(Object.isFrozen(result.unsupportedKinds), true);
});

test("malformed permission document cannot be bypassed with a valid record", async () => {
  const f = fixture({
    grants: [grant("selected-goals", ["valid"]),
      grant("selected-history", ["other"], { ownerUid: "foreignOwner" })],
    records: { "artifacts/reflect-8fdc8/users/syntheticOwner/goals/valid": goal("Private") }
  });
  await assert.rejects(call(f.db), e => e.code === "permissions-unavailable");
  assert.equal(f.paths.some(x => x.endsWith("/goals/valid")), false);
});
