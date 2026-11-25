"use strict";

// Isolated server-only keyring. No environment loading or runtime activation.
// A key ID must never be reused with different key bytes across rotations.
const { attest, verify } = require("./recommendationProvenance.cjs");
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const validId = x => typeof x === "string" && ID.test(x);

function createProvenanceKeyring({ activeKeyId, keys } = {}) {
  if (!validId(activeKeyId) || !Array.isArray(keys) ||
      keys.length < 1 || keys.length > 8) throw Error("invalid-keyring");
  const material = new Map();
  for (const entry of keys) {
    if (!entry || !validId(entry.keyId) || material.has(entry.keyId) ||
        !Buffer.isBuffer(entry.key) || entry.key.length !== 32 ||
        [...material.values()].some(key => key.equals(entry.key))) {
      throw Error("invalid-keyring");
    }
    material.set(entry.keyId, Buffer.from(entry.key));
  }
  if (!material.has(activeKeyId)) throw Error("invalid-keyring");

  function sign(input) {
    return Object.freeze({ ...attest(input, material.get(activeKeyId)), keyId: activeKeyId });
  }
  function check(input, receipt) {
    if (!receipt || !validId(receipt.keyId) || !material.has(receipt.keyId)) return false;
    return verify(input, receipt, material.get(receipt.keyId));
  }
  return Object.freeze({ sign, verify: check });
}
module.exports = { createProvenanceKeyring };
