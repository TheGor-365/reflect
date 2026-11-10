"use strict";
/**
 * Stage05B: authenticated, NON-GENERATIVE xAI key/model-access diagnostic.
 * Read-only GET to official /v1/models/grok-4.3. No POST /responses,
 * no model inference, no prompt or diary sent, no logging of keys/body.
 * Invoked ONLY after Firebase Auth, App Check, private entitlement and
 * private Firestore runtime flag have been checked by the Railway bridge.
 */
const MODEL_URL = "https://api.x.ai/v1/models/grok-4.3";
const TIMEOUT_MS = 8000;
const KEY_PATTERN = /^xai-[A-Za-z0-9_-]{20,250}$/;

function classify(status) {
  if (status === 200) return "model-accessible";
  if (status === 400 || status === 401) return "credentials-rejected";
  if (status === 403) return "access-denied";
  if (status === 404) return "model-unavailable";
  if (status === 429) return "provider-rate-limited";
  return "provider-unavailable";
}
function createXaiProviderProbe({ readSecret, transport } = {}) {
  if (typeof readSecret !== "function" || typeof transport !== "function") {
    throw new Error("Stage05B diagnostic requires injected credential and transport");
  }
  // One network probe per process instance; repeated clicks reuse the promise.
  // No secret string, UID or provider response is cached or serialized.
  let checked = null;
  return async function checkProvider() {
    if (checked) return checked;
    checked = (async () => {
      let key;
      try {
        key = await readSecret();
      } catch { return "credentials-unavailable"; }
      if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
        key = undefined;
        return "credentials-unavailable";
      }
      let response;
      try {
        response = await transport(MODEL_URL, {
          method: "GET",
          headers: { Authorization: "Bearer " + key },
          redirect: "error",
          signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch {
        return "provider-unavailable";
      } finally {
        key = undefined;
      }
      if (!response || response.redirected !== false ||
          !Number.isInteger(response.status)) return "provider-unavailable";
      try { await response.body?.cancel?.(); } catch { /* ignore response content */ }
      return classify(response.status);
    })();
    return checked;
  };
}
module.exports = { createXaiProviderProbe };
