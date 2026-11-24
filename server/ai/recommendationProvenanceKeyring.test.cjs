"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProvenanceKeyring } = require("./recommendationProvenanceKeyring.cjs");
const key = (keyId, byte) => ({ keyId, key: Buffer.alloc(32, byte) });
const input = {
  projectId: "demo-reflect-r139", uid: "owner-a", sessionId: "session-a",
  sourceTurnId: "user-a", assistantTurnId: "assistant-a",
  sourceText: "Synthetic source", assistantText: "Synthetic reply",
  interaction: { version: "reflect.interaction.v1", stage: "synthesize" }
};
const ring = (activeKeyId, keys) => createProvenanceKeyring({ activeKeyId, keys });

test("keyring signs only with active key and verifies previous receipts after rotation", () => {
  const a = key("a", 1), b = key("b", 2);
  const old = ring("a", [a]).sign(input);
  const current = ring("b", [a, b]);
  const fresh = current.sign(input);
  assert.equal(fresh.keyId, "b");
  assert.equal(current.verify(input, old), true);
  assert.equal(current.verify(input, fresh), true);
  assert.equal(ring("b", [b]).verify(input, old), false);
});

test("keyring rejects unknown or substituted key IDs and changed input", () => {
  const current = ring("b", [key("a", 1), key("b", 2)]);
  const receipt = current.sign(input);
  for (const keyId of ["a", "missing", "../b", undefined]) {
    assert.equal(current.verify(input, { ...receipt, keyId }), false);
  }
  assert.equal(current.verify({ ...input, uid: "other-owner" }, receipt), false);
  assert.equal(current.verify(input, null), false);
});

test("keyring rejects invalid, duplicate and oversized configurations", () => {
  for (const keys of [[], [key("a", 1), key("a", 2)],
    [key("a", 1), key("b", 1)], [key("bad/id", 1)],
    [{ keyId: "a", key: Buffer.alloc(31) }],
    Array.from({ length: 9 }, (_, i) => key(String(i), i + 1))]) {
    assert.throws(() => ring("a", keys), /invalid-keyring/);
  }
  assert.throws(() => ring("missing", [key("a", 1)]), /invalid-keyring/);
});

test("keyring copies caller buffers and exposes no key bytes", () => {
  const a = key("a", 1), current = ring("a", [a]);
  const receipt = current.sign(input);
  a.key.fill(9);
  assert.deepEqual(current.sign(input), receipt);
  assert.deepEqual(Object.keys(current).sort(), ["sign", "verify"]);
  assert.deepEqual(Object.keys(receipt).sort(), ["keyId", "mac", "version"]);
});
