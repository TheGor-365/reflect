"use strict";

/**
 * AI-01A pure selection prototype (NOT imported by any live request handler).
 * The caller must fetch `records` and `grants` from server-controlled,
 * authenticated owner-scoped stores. NEVER pass client-supplied archive data.
 * Records are evidence, not system/model instructions.
 */
const { hasSourceGrant } = require("./contextGrantPolicy.cjs");
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TOTAL_BYTES = 1600;
const MAX_ITEMS = 6;
const MAX_PER_SOURCE_BYTES = 800;
const validId = x => typeof x === "string" && ID.test(x);
const validTime = x => Number.isSafeInteger(x) &&
  x >= 0 && x <= 8640000000000000;
const kindOrder = Object.freeze({
  sessionTurn: 0, approvedMemory: 1, goal: 2, diaryEntry: 3, bodyCheckin: 4
});
const validText = x => typeof x === "string" &&
  x.trim().length > 0 &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);

/**
 * Always source specific; zero excerpts on missing grants or malformed input.
 * Unconfirmed memory and records from another owner can NEVER be returned.
 * Byte budgets are conservative placeholders until provider token counting is
 * measured. A source too large is skipped (not silently truncated/requoted).
 */
function selectContext({ uid, grants, records, nowMs, maxBytes = MAX_TOTAL_BYTES,
  maxItems = MAX_ITEMS } = {}) {
  const empty = () => Object.freeze({ excerpts: Object.freeze([]), totalBytes: 0 });
  if (!validId(uid) || !validTime(nowMs) || !Array.isArray(records) ||
      !Array.isArray(grants) || records.length > 500 || grants.length > 100 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 0 ||
      maxBytes > MAX_TOTAL_BYTES || !Number.isSafeInteger(maxItems) ||
      maxItems < 0 || maxItems > MAX_ITEMS) return empty();

  const allowed = records
    .filter(r => r && Object.prototype.toString.call(r) === "[object Object]" &&
      r.ownerUid === uid && validId(r.sourceId) &&
      Object.prototype.hasOwnProperty.call(kindOrder, r.sourceKind) &&
      validText(r.text) && Buffer.byteLength(r.text.trim(), "utf8") <= MAX_PER_SOURCE_BYTES &&
      validTime(r.authoredAt) && r.authoredAt <= nowMs &&
      (r.sourceKind !== "approvedMemory" || r.confirmedByUser === true) &&
      hasSourceGrant({ uid, grants, sourceKind: r.sourceKind,
        sourceId: r.sourceId, nowMs }))
    // Follow session chronology first; don't let a large journal drown out
    // the active conversation. Stable ordering for reproducible fixtures.
    .sort((a, b) => kindOrder[a.sourceKind] - kindOrder[b.sourceKind] ||
      b.authoredAt - a.authoredAt ||
      a.sourceId.localeCompare(b.sourceId));

  let totalBytes = 0;
  const seen = new Set();
  const excerpts = [];
  for (const item of allowed) {
    if (excerpts.length >= maxItems) break;
    const key = item.sourceKind + "\u0000" + item.sourceId;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = item.text.trim();
    const bytes = Buffer.byteLength(text, "utf8");
    if (totalBytes + bytes > maxBytes) continue;
    totalBytes += bytes;
    excerpts.push(Object.freeze({
      sourceKind: item.sourceKind, sourceId: item.sourceId,
      authoredAt: item.authoredAt,
      authoredBy: item.sourceKind === "approvedMemory" ? "user-confirmed" :
        item.authoredBy === "assistant" ? "assistant" : "user",
      excerpt: text, untrustedEvidence: true
    }));
  }
  return Object.freeze({ excerpts: Object.freeze(excerpts), totalBytes });
}

module.exports = { selectContext, MAX_TOTAL_BYTES, MAX_ITEMS };
