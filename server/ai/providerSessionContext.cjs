"use strict";

/**
 * M3b provider boundary — intentionally NOT connected to an HTTP endpoint.
 * A caller must first obtain one freshly verified authorize() result from
 * sessionMemory.cjs after the owner has inspected and accepted the exact
 * preview digest. This shape validator is not a replacement for that proof.
 *
 * Never accept any of these fields from request.data / browser input.
 * Current one-message transport remains the only live path until separate
 * signed runtime/feature flag/cost QA review.
 */
const { PolicyError } = require("./policy.cjs");
// Constant bounds mirrored from the private sessionMemory adapter. They are
// asserted equal in isolated tests; the separately packaged Functions runtime
// must not import the Admin consent store or owner-session reader.
const MAX_PRIOR_TURNS = 4;
const MAX_TURN_BYTES = 300;
const MAX_TOTAL_BYTES = 1200;

const SOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST = /^[A-Za-z0-9_-]{12,80}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BAD_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = v => !!v && typeof v === "object" && !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const deny = () => { throw new PolicyError("permission-denied"); };

function approvedProviderHistory(spec) {
  if (!plain(spec) || !plain(spec.authorizedContext) ||
      !SOURCE.test(spec.sourceId || "") ||
      !REQUEST.test(spec.requestId || "")) deny();
  const ctx = spec.authorizedContext;
  if (ctx.sourceId !== spec.sourceId ||
      ctx.requestId !== spec.requestId ||
      ctx.authorizedAt !== "pre-egress" ||
      ctx.store !== false ||
      typeof ctx.approvalDigest !== "string" ||
      !SHA256.test(ctx.approvalDigest) ||
      !Array.isArray(ctx.turns) ||
      ctx.turns.length < 1 || ctx.turns.length > MAX_PRIOR_TURNS ||
      !Number.isSafeInteger(ctx.totalBytes) ||
      ctx.totalBytes < 1 || ctx.totalBytes > MAX_TOTAL_BYTES) deny();

  const seen = new Set();
  let sum = 0;
  const turns = ctx.turns.map((t, i) => {
    if (!plain(t) || !SOURCE.test(t.sourceTurnId || "") ||
        seen.has(t.sourceTurnId) || !["user", "assistant"].includes(t.role) ||
        t.untrustedSource !== true ||
        typeof t.content !== "string" || !t.content.trim() ||
        BAD_CONTROLS.test(t.content) ||
        (t.truncated !== true && t.truncated !== false)) deny();
    seen.add(t.sourceTurnId);
    const bytes = Buffer.byteLength(t.content, "utf8");
    if (bytes < 1 || bytes > MAX_TURN_BYTES) deny();
    sum += bytes;
    // Stable source ordinal only. Do not leak internal Firestore record ids,
    // grant ids, digest or account identifiers to the model.
    return { excerpt: i + 1, priorRole: t.role, quote: t.content,
      truncated: t.truncated };
  });
  if (sum !== ctx.totalBytes || sum > MAX_TOTAL_BYTES) deny();

  // This payload is a USER-role data quotation, not SYSTEM/ASSISTANT role
  // turns. The surrounding server system prompt prevents instruction lift.
  return Object.freeze({
    role: "user",
    content: JSON.stringify({
      kind: "reflect.untrusted-consented-excerpts.v1",
      purpose: "Avoid asking again about facts the owner already supplied; revisit rejected explanations.",
      excerptCount: turns.length,
      excerpts: turns
    })
  });
}
module.exports = { approvedProviderHistory };
