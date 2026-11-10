"use strict";

/**
 * AI-01A server-only, deterministic and cost-free *proposal*.
 * NOT a substitute for Auth, App Check, the existing validateRequest(),
 * durable Firestore quotas, entitlement or clinical safety policy.
 * No provider calls, no persistence and no automatic retries.
 */
const ID = /^[A-Za-z0-9_-]{12,80}$/;
const MAX_BYTES = 2000;
const MAX_CHARS = 1400;
const validText = x => typeof x === "string" && x.trim() !== "" &&
  x.length <= MAX_CHARS && Buffer.byteLength(x, "utf8") <= MAX_BYTES &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
const result = (action, reason) => Object.freeze({ action, reason, paidCallAllowed: action === "model_reply" });

/**
 * `serverGate` must be sourced from verified server logic, not browser claims.
 * A local clarification is a UI suggestion, NOT a fabricated AI response.
 * This router doesn't analyze personal beliefs or psychiatric diagnoses.
 */
function planPreflight({
  message, requestId, authVerified = false, appCheckVerified = false,
  entitlementAllowed = false, moneyReservationAllowed = false,
  providerReady = false, priorRequestIds = [], activeSessionHasHistory = false
} = {}) {
  if (!authVerified || !appCheckVerified) return result("reject", "unauthenticated");
  if (typeof requestId !== "string" || !ID.test(requestId) || !validText(message)) {
    return result("reject", "invalid-request");
  }
  if (!Array.isArray(priorRequestIds) || priorRequestIds.length > 200 ||
      priorRequestIds.some(x => typeof x !== "string" || !ID.test(x))) {
    return result("reject", "invalid-idempotency-state");
  }
  if (priorRequestIds.includes(requestId)) return result("reject", "duplicate-request-id");
  if (!entitlementAllowed) return result("reject", "entitlement-denied");

  const normalized = message.trim().toLocaleLowerCase("ru");
  // Only obvious repeated ASCII machine-noise is rejected locally; NEVER
  // deny emotional expressions, dialect, profanity, unusual beliefs or distress.
  if (/^([a-z0-9])\1{63,}$/i.test(normalized)) {
    return result("reject", "machine-noise");
  }
  if (!activeSessionHasHistory && /^(?:да|нет|ок|окей|ага|угу|хм|\.\.\.|\?)$/iu.test(normalized)) {
    return result("clarify_without_history", "missing-referent");
  }
  // Local clarification must not consume a paid budget reservation.
  if (!moneyReservationAllowed) return result("defer_provider_unavailable", "budget-unavailable");
  if (!providerReady) return result("defer_provider_unavailable", "provider-unavailable");
  return result("model_reply", "eligible");
}

module.exports = { planPreflight };
