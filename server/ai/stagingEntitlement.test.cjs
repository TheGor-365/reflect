"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createStagingEntitlementVerifier } = require("./stagingEntitlement.cjs");

const UID = "sampleStagingUid_23456789";
const NOW = Date.UTC(2026, 10, 9);
const user = { uid: UID, email: "test.invalid@example.org", emailVerified: true,
  disabled: false, providerData: [{ providerId: "password" }] };
const doc = { enabled: true, role: "staging_tester", model: "grok-4.3",
  expiresAt: { toMillis: () => NOW + 86400000 } };
function setup({ account = user, entitlement = doc, throwOnRead = false } = {}) {
  let read = 0, lookup = 0;
  const db = {
    projectId: "reflect-ai-staging",
    collection: root => {
      assert.equal(root, "_reflectAiPrivate");
      return { doc: name => {
        assert.equal(name, "reflect-8fdc8");
        return { collection: name2 => {
          assert.equal(name2, "entitlements");
          return { doc: uid => {
            lookup++;
            assert.equal(uid, UID);
            return { get: async () => {
              read++;
              if (throwOnRead) throw Error("internal-data-must-not-leak");
              return { exists: entitlement !== null, data: () => entitlement };
            } };
          } };
        } };
      } };
    }
  };
  return {
    authorize: createStagingEntitlementVerifier({
      db, projectId: "reflect-ai-staging",
      getUser: async uid => { assert.equal(uid, UID); return account; },
      clock: () => NOW
    }),
    counts: () => ({ read, lookup })
  };
}
test("fail-closed without required isolated staging project", () => {
  assert.throws(() => createStagingEntitlementVerifier({
    db: { projectId: "reflect-8fdc8" }, projectId: "reflect-8fdc8",
    getUser: async () => user
  }), /isolated staging/);
});
test("verified registered user with private, short-lived approval passes", async () => {
  const x = setup();
  assert.equal(await x.authorize({ uid: UID }), true);
  assert.deepEqual(x.counts(), { read: 1, lookup: 1 });
});
test("missing, malformed, expired, disabled or unscoped entitlement denies", async () => {
  const cases = [null, {}, { ...doc, enabled: false }, { ...doc, model: "grok-4" },
    { ...doc, role: "client" },
    { ...doc, expiresAt: { toMillis: () => NOW - 1 } },
    { ...doc, expiresAt: { toMillis: () => NOW + 40 * 86400000 } },
    { ...doc, expiresAt: "tomorrow" }];
  for (const entitlement of cases) {
    assert.equal(await setup({ entitlement }).authorize({ uid: UID }), false);
  }
});
test("anonymous, unverified, disabled and different Firebase account denied", async () => {
  const cases = [
    { ...user, emailVerified: false }, { ...user, disabled: true },
    { ...user, uid: "anotherUid" }, { ...user, email: null }, null
  ];
  for (const account of cases) {
    const x = setup({ account });
    assert.equal(await x.authorize({ uid: UID }), false);
    assert.equal(x.counts().read, 0);
  }
  assert.equal(await setup().authorize({ uid: "short" }), false);
  assert.equal(await setup().authorize({ uid: UID, firebase: { sign_in_provider: "anonymous" } }), false);
});
test("database failure denies without exposing internal error", async () => {
  assert.equal(await setup({ throwOnRead: true }).authorize({ uid: UID }), false);
});
