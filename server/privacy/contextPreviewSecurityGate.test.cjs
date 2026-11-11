"use strict";

/**
 * AI-01K Gate 5: synthetic-only HTTP security contract, no Firebase tokens,
 * no provider or live Railway calls, no personal Firestore records.
 *
 * Simulates a Firebase consumed marker that is incorrectly always false:
 * the additional shared transactional ledger must still reject replays
 * across the consent and context-preview routes.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createAppCheckReplayGuard, PROJECT_ID } =
  require("../railway/appCheckReplayGuard.cjs");
const { createPreviewHttpListener, PATH: PREVIEW_PATH, ORIGIN } =
  require("./contextPreviewHttp.cjs");
const { createConsentHttpListener, PATH: CONSENT_PATH } =
  require("./contextConsentHttp.cjs");
const { PolicyError } = require("../ai/policy.cjs");
const { SCOPE } = require("./contextConsent.cjs");

const NOW = 1794410000000;
const APP_ID = "1:599679789981:web:d4d8743dbff0fe40af1d74";
const OWNER = "syntheticOwner";
const GRANT = "synthetic_gate5_grant_0001";
const SESSION = "synthetic_gate5_session";
const AUTH = "synthetic-authentication-bearer-token-0000000000000000";
const history = [
  "AI01K_TURN_01_EXCLUDE",
  "AI01K_TURN_02_INCLUDE",
  "AI01K_TURN_03_INCLUDE",
  "AI01K_TURN_04_INCLUDE",
  "AI01K_TURN_05_INCLUDE"
];

function fakeFirestore() {
  const docs = new Map();
  let tail = Promise.resolve();
  return {
    docs,
    db: {
      doc(path) { return { path }; },
      collection() {
        return { where() {
          return { limit() {
            return { async get() { return { empty: true, size: 0, docs: [] }; } };
          } };
        } };
      },
      batch() {
        return { delete() {}, async commit() {} };
      },
      runTransaction(callback) {
        const pending = tail.then(() => callback({
          get: async ref => ({ exists: docs.has(ref.path) }),
          create(ref, data) {
            if (docs.has(ref.path)) throw Error("duplicate");
            docs.set(ref.path, data);
          }
        }));
        tail = pending.catch(() => {});
        return pending;
      }
    }
  };
}

function setup() {
  const { db, docs } = fakeFirestore();
  const replay = createAppCheckReplayGuard({
    db, projectId: PROJECT_ID, clock: () => NOW
  });
  let active = true;
  let previewReads = 0;
  let consentRevoke = 0;
  const verifyAuth = async () => ({ uid: OWNER });
  const verifyAppCheck = async token => {
    const attestation = {
      appId: APP_ID, alreadyConsumed: false,
      token: { exp: Math.floor(NOW / 1000) + 300 }
    };
    const first = await replay.consume(token, attestation);
    return first ? attestation : { ...attestation, alreadyConsumed: true };
  };
  const consent = createConsentHttpListener({
    verifyAuth, verifyAppCheck,
    authorizeAccount: async () => true,
    list: async () => ({
      grants: active ? [{
        grantId: GRANT, sourceId: SESSION, scope: SCOPE,
        expiresAtMs: NOW + 900000
      }] : []
    }),
    execute: async command => {
      assert.equal(command.action, "revoke");
      assert.equal(command.grantId, GRANT);
      consentRevoke++;
      active = false;
      return { status: "revoked" };
    }
  });
  const preview = createPreviewHttpListener({
    verifyAuth, verifyAppCheck,
    authorizeAccount: async () => true,
    rateLimit: async uid => assert.equal(uid, OWNER),
    preview: async input => {
      previewReads++;
      assert.equal(input.principal.uid, OWNER);
      assert.equal(input.grantId, GRANT);
      assert.equal(input.sourceId, SESSION);
      if (!active) throw new PolicyError("permission-denied");
      const contents = history.slice(-4);
      return {
        sourceId: SESSION, scope: SCOPE,
        turns: contents.map((content, i) => ({
          role: i % 2 === 0 ? "assistant" : "user",
          content, truncated: false, untrustedSource: true
        })),
        totalBytes: contents.reduce((sum, text) =>
          sum + Buffer.byteLength(text, "utf8"), 0),
        sourceTurnCount: history.length, truncated: true,
        disclosureRequired: true, providerDispatchAllowed: false
      };
    }
  });
  return {
    handler: (req, res) => req.url === CONSENT_PATH
      ? consent(req, res) : preview(req, res),
    docs,
    getStats: () => ({ active, previewReads, consentRevoke })
  };
}

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await fn("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function send(url, path, appToken, command, origin = ORIGIN) {
  return fetch(url + path, {
    method: "POST",
    headers: {
      origin, authorization: "Bearer " + AUTH,
      "x-firebase-appcheck": appToken,
      "content-type": "application/json"
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(7000)
  });
}
const previewCmd = { grantId: GRANT, sourceId: SESSION, scope: SCOPE };

test("direct Preview uses only recent synthetic turns; cross-route replays always deny", async () => {
  const qa = setup();
  await withServer(qa.handler, async url => {
    const t1 = "synthetic-appcheck-preview-token-000001";
    const first = await send(url, PREVIEW_PATH, t1, previewCmd);
    assert.equal(first.status, 200);
    const shown = await first.json();
    assert.deepEqual(shown.turns.map(x => x.content), history.slice(1));
    assert.equal(shown.sourceTurnCount, 5);
    assert.equal(shown.providerDispatchAllowed, false);
    assert.equal(JSON.stringify(shown).includes(history[0]), false);

    const consentReplay = await send(url, CONSENT_PATH, t1, { action: "list" });
    assert.equal(consentReplay.status, 401);

    const t2 = "synthetic-appcheck-consent-token-000002";
    assert.equal((await send(url, CONSENT_PATH, t2, { action: "list" })).status, 200);
    const previewReplay = await send(url, PREVIEW_PATH, t2, previewCmd);
    assert.equal(previewReplay.status, 401);

    const t3 = "synthetic-appcheck-parallel-token-000003";
    const pair = await Promise.all([
      send(url, PREVIEW_PATH, t3, previewCmd),
      send(url, CONSENT_PATH, t3, { action: "list" })
    ]);
    assert.deepEqual(pair.map(x => x.status).sort(), [200, 401]);

    // One fresh token revokes, another attempts a DIRECT preview after revoke.
    const t4 = "synthetic-appcheck-revoke-token-000004";
    assert.equal((await send(url, CONSENT_PATH, t4, {
      action: "revoke", grantId: GRANT
    })).status, 200);
    assert.equal(qa.getStats().active, false);
    const t5 = "synthetic-appcheck-post-revoke-token-000005";
    const denied = await send(url, PREVIEW_PATH, t5, previewCmd);
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: "permission-denied" });
    const t6 = "synthetic-appcheck-post-revoke-list-token-000006";
    const list = await send(url, CONSENT_PATH, t6, { action: "list" });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), { grants: [] });
  });
  assert.equal(qa.getStats().consentRevoke, 1);
  assert.ok(qa.getStats().previewReads >= 2);
  assert.equal(qa.docs.size, 6);
  assert.ok([...qa.docs.keys()].every(key =>
    /^_reflectAiPrivate\/reflect-8fdc8\/appCheckReplayTokens\/[a-f0-9]{64}$/.test(key)));
});

test("untrusted Origin is denied before token consumption or history read", async () => {
  const qa = setup();
  await withServer(qa.handler, async url => {
    const reply = await send(url, PREVIEW_PATH,
      "synthetic-appcheck-foreign-origin-token", previewCmd,
      "https://reflect-three.vercel.app");
    assert.equal(reply.status, 403);
  });
  assert.equal(qa.docs.size, 0);
  assert.equal(qa.getStats().previewReads, 0);
});
