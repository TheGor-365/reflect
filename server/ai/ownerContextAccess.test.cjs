"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadOwnerContextAccess, validatedGrant, OwnerContextAccessError } =
  require("./ownerContextAccess.cjs");
const { settingsSnapshot, DEFAULTS, parseOwnerAiPreferences } =
  require("./aiSettingsPolicy.cjs");
const { VERSION, grantAllows } = require("./contextGrantPolicy.cjs");

const OWNER = "syntheticOwner";
const NOW = 1794340000000;
const approval = (changes = {}) => ({
  ownerUid: OWNER, version: VERSION, scope: "selected-history",
  consent: true, sourceIds: ["note1"], approvedAt: NOW - 2000,
  expiresAt: NOW + 60000, revokedAt: null, ...changes
});
const preferences = (changes = {}) => ({
  ...DEFAULTS, ...changes
});
function fakeDb({ settings = null, grants = [], failSettings = false,
  failGrants = false } = {}) {
  const reads = [];
  const createRef = path => ({
    collection: name => createRef(path + "/" + name),
    doc: name => createRef(path + "/" + name),
    limit: number => {
      reads.push("limit:" + path + ":" + number);
      return createRef(path);
    },
    get: async () => {
      reads.push("read:" + path);
      if (path.endsWith("/aiSettings/preferences")) {
        if (failSettings) throw new Error("synthetic network failure");
        return { exists: settings != null, data: () => settings };
      }
      if (path.endsWith("/aiContextGrants")) {
        if (failGrants) throw new Error("synthetic grants failure");
        return { docs: grants.map(g => ({ data: () => g })) };
      }
      throw new Error("Unexpected read: " + path);
    }
  });
  return { db: { collection: name => createRef(name) }, reads };
}

test("missing settings and grants return strict disabled defaults and no archive", async () => {
  const { db, reads } = fakeDb();
  const data = await loadOwnerContextAccess({
    db, verifiedUid: OWNER, requestedUid: OWNER
  });
  assert.equal(data.settings.status, "missing");
  assert.equal(data.settings.preferences.recommendationsEnabled, false);
  assert.equal(data.settings.canReadArchive, false);
  assert.equal(data.settings.canGenerateBackgroundRecommendations, false);
  assert.deepEqual(data.grants, []);
  assert.equal(reads.length, 3);
  assert(reads.every(path => !path.includes("/diaryNotes/")));
  assert(reads.includes("limit:artifacts/reflect-8fdc8/users/" + OWNER +
    "/aiContextGrants:101"));
});

test("trusted UID mismatch and injected paths are rejected BEFORE a Firestore read", async () => {
  const { db, reads } = fakeDb();
  for (const requestedUid of ["otherOwner", "../foreign", "", undefined]) {
    await assert.rejects(
      loadOwnerContextAccess({ db, verifiedUid: OWNER, requestedUid }),
      e => e instanceof OwnerContextAccessError && e.code === "unauthenticated"
    );
  }
  assert.equal(reads.length, 0);
});

test("valid preferences remain preferences only; grants remain source specific", async () => {
  const { db } = fakeDb({ settings: preferences({
    recommendationsEnabled: true, recommendationFrequency: "balanced"
  }), grants: [approval()] });
  const data = await loadOwnerContextAccess({
    db, verifiedUid: OWNER, requestedUid: OWNER
  });
  assert.equal(data.settings.status, "valid");
  assert.equal(data.settings.preferences.recommendationsEnabled, true);
  assert.equal(data.settings.canReadArchive, false);
  assert.equal(data.settings.canGenerateBackgroundRecommendations, false);
  assert.equal(data.grants.length, 1);
  const grant = data.grants[0];
  assert.equal(grantAllows({ uid: OWNER, grant, sourceId: "note1",
    sourceKind: "diaryEntry", nowMs: NOW }), true);
  assert.equal(grantAllows({ uid: OWNER, grant, sourceId: "note2",
    sourceKind: "diaryEntry", nowMs: NOW }), false);
  assert.equal(Object.isFrozen(grant.sourceIds), true);
});

test("revoked consent snapshot remains unable to authorize any source", async () => {
  const { db } = fakeDb({
    settings: preferences(),
    grants: [approval({ revokedAt: NOW - 1 })]
  });
  const access = await loadOwnerContextAccess({
    db, verifiedUid: OWNER, requestedUid: OWNER
  });
  assert.equal(grantAllows({ uid: OWNER, grant: access.grants[0],
    sourceKind: "diaryEntry", sourceId: "note1", nowMs: NOW }), false);
});

test("unknown schema, extra fields and contradictory opt-ins fail closed", async () => {
  for (const data of [
    preferences({ schemaVersion: 55 }),
    preferences({ autoSaveRecommendations: true }),
    preferences({ readAllDiary: true }),
    preferences({ responseTone: "omnipotent" })
  ]) {
    assert.equal(parseOwnerAiPreferences(data), null);
    const { db } = fakeDb({ settings: data, grants: [approval()] });
    const access = await loadOwnerContextAccess({
      db, verifiedUid: OWNER, requestedUid: OWNER
    });
    assert.equal(access.settings.status, "invalid");
    assert.equal(access.settings.preferences.recommendationsEnabled, false);
    assert.deepEqual(access.grants, []);
  }
});

test("corrupt or cross-owner grant rejects the whole snapshot", async () => {
  for (const invalid of [
    approval({ ownerUid: "otherOwner" }),
    approval({ scope: "entire-archive" }),
    approval({ sourceIds: ["*"] }),
    approval({ consent: false }),
    approval({ sourceIds: Array(101).fill("note1") })
  ]) {
    const { db } = fakeDb({ settings: preferences(), grants: [approval(), invalid] });
    await assert.rejects(loadOwnerContextAccess({
      db, verifiedUid: OWNER, requestedUid: OWNER
    }), error => error instanceof OwnerContextAccessError &&
      error.code === "invalid-permission-state");
  }
});

test("DB read failures cannot masquerade as missing or revoked settings", async () => {
  for (const args of [{ failSettings: true }, { failGrants: true }]) {
    const { db } = fakeDb(args);
    await assert.rejects(loadOwnerContextAccess({
      db, verifiedUid: OWNER, requestedUid: OWNER
    }), err => err.code === "permissions-unavailable" &&
      !err.message.includes("synthetic network failure"));
  }
});

test("grants query is capped, rejecting 101 records even when individually valid", async () => {
  const { db } = fakeDb({ settings: preferences(),
    grants: Array(101).fill(0).map(() => approval()) });
  await assert.rejects(loadOwnerContextAccess({
    db, verifiedUid: OWNER, requestedUid: OWNER
  }), err => err.code === "invalid-permission-state");
});

test("server parser strips Firestore update metadata and exposes no raw excerpts", () => {
  const raw = preferences({ updatedAt: { toDate: () => new Date(NOW) } });
  const result = settingsSnapshot(raw);
  assert.equal(result.status, "valid");
  assert.equal(result.preferences.updatedAt, undefined);
  assert.equal(JSON.stringify(result).includes("sessionTurn"), false);
  assert.equal(Object.isFrozen(result.preferences), true);
});
