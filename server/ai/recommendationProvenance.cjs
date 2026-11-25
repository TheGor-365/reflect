"use strict";

// R139 C3c prototype. Not wired to any handler or storage.
// The caller must authenticate the owner, supply the exact provider input
// and validated provider output, and keep the HMAC key server-only.
// Attestation authenticates bytes and coordinates, not factual truth or consent.
const { createHmac, timingSafeEqual } = require("node:crypto");
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const VERSION = "reflect.recommendation.provenance.v1";
const validId = value => typeof value === "string" && ID.test(value);
const plain = value => value !== null && typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;

function canonical(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 512 || depth > 12) throw Error("invalid-provenance");
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string" && value.length <= 8192) return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value) && value.length <= 64) {
    const items = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) throw Error("invalid-provenance");
      items.push(canonical(value[i], depth + 1, budget));
    }
    return "[" + items.join(",") + "]";
  }
  if (plain(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length > 64 || keys.some(key => key.length > 128)) throw Error("invalid-provenance");
    return "{" + keys.map(key => JSON.stringify(key) + ":" +
      canonical(value[key], depth + 1, budget)).join(",") + "}";
  }
  throw Error("invalid-provenance");
}

function payload({ projectId, uid, sessionId, sourceTurnId, assistantTurnId,
  sourceText, assistantText, interaction }) {
  if (![projectId, uid, sessionId, sourceTurnId, assistantTurnId].every(validId) ||
      sourceTurnId === assistantTurnId ||
      typeof sourceText !== "string" || !sourceText.trim() || sourceText.length > 2400 ||
      typeof assistantText !== "string" || !assistantText.trim() || assistantText.length > 2400 ||
      !plain(interaction) ||
      !["reflect.interaction.v1", "reflect.interaction.v2"].includes(interaction.version)) {
    throw Error("invalid-provenance");
  }
  const encoded = canonical({ version: VERSION, projectId, uid, sessionId,
    sourceTurnId, assistantTurnId, sourceText, assistantText, interaction });
  if (Buffer.byteLength(encoded, "utf8") > 32768) throw Error("invalid-provenance");
  return encoded;
}

function attest(input, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw Error("invalid-provenance-key");
  const mac = createHmac("sha256", key).update(payload(input), "utf8").digest("hex");
  return Object.freeze({ version: VERSION, mac });
}

function verify(input, receipt, key) {
  try {
    if (!plain(receipt) || receipt.version !== VERSION ||
        typeof receipt.mac !== "string" || !/^[a-f0-9]{64}$/.test(receipt.mac)) return false;
    const expected = attest(input, key);
    return timingSafeEqual(Buffer.from(expected.mac, "hex"), Buffer.from(receipt.mac, "hex"));
  } catch {
    return false;
  }
}

module.exports = { attest, verify };
