/**
 * Stage04H — separate Railway transport for the existing Sessions flow.
 * Only one consented message crosses the wire; no history, profile or diary.
 * The browser NEVER sees the xAI key or Firebase Admin credential.
 */
import { getLimitedUseToken } from "firebase/app-check";
import { auth, appCheckClient, stagingAppCheckEnabled, hostedAiEnabled } from "../firebase/config";

const requested = import.meta.env.VITE_ENABLE_REFLECT_RAILWAY_AI === "true";
const precheckRequested = import.meta.env.VITE_ENABLE_REFLECT_RAILWAY_PRECHECK === "true";
const origin = (import.meta.env.VITE_REFLECT_RAILWAY_AI_ORIGIN || "").trim();
// Exact domain: do not accept unrelated *.up.railway.app staging targets.
const safeOrigin = origin === "https://reflect-ai-api-staging.up.railway.app";
const safeClient = safeOrigin && stagingAppCheckEnabled && !hostedAiEnabled;
export const railwayAiEnabled = requested && safeClient;
export const railwayPrecheckEnabled = precheckRequested && safeClient && !requested;

if ((requested && !railwayAiEnabled) ||
    (precheckRequested && !railwayPrecheckEnabled)) {
  throw new Error("Railway AI requires the isolated signed staging configuration.");
}

export async function getRailwayAnalysis(payload) {
  if (!railwayAiEnabled || !appCheckClient || !auth.currentUser) {
    throw new Error("ai-disabled");
  }
  const [idToken, appCheck] = await Promise.all([
    auth.currentUser.getIdToken(),
    getLimitedUseToken(appCheckClient)
  ]);
  if (!idToken || !appCheck?.token) throw new Error("attestation-unavailable");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 44000);
  try {
    const response = await fetch(origin + "/v1/ai/reply", {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken,
        "X-Firebase-AppCheck": appCheck.token
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    // Never surface raw upstream bodies or tokens in UI/debug output.
    if (response.status !== 200) throw new Error("ai-request-not-completed");
    const data = await response.json();
    if (!data || typeof data.text !== "string" ||
        !data.text.trim() || data.text.length > 2400 ||
        data.model !== "grok-4.3") {
      throw new Error("invalid-server-response");
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stage04H nonbillable signed browser QA. No text, profile, history, diary
 * or provider instructions are transmitted. The server verifies genuine
 * Firebase Auth and *consumes* a limited-use App Check token before its
 * independent REFLECT_XAI_OUTBOUND_ENABLED=no gate returns 503.
 *
 * Never treat a generic 503 or 401 as success: only provider-disabled
 * from the exact isolated Railway origin proves that token gates passed.
 */
export async function checkRailwayAttestation() {
  if (!railwayPrecheckEnabled || !appCheckClient || !auth.currentUser) {
    throw new Error("attestation-unavailable");
  }
  const [idToken, appCheck] = await Promise.all([
    auth.currentUser.getIdToken(),
    getLimitedUseToken(appCheckClient)
  ]);
  if (!idToken || !appCheck?.token) throw new Error("attestation-unavailable");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(origin + "/v1/ai/reply", {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken,
        "X-Firebase-AppCheck": appCheck.token
      },
      // Strictly empty diagnostic body. No user text and no paid request.
      body: "{}",
      signal: controller.signal
    });
    if (response.status !== 503) throw new Error("attestation-failed");
    const result = await response.json();
    if (result?.error !== "provider-disabled") {
      throw new Error("attestation-failed");
    }
    return true;
  } catch {
    throw new Error("attestation-failed");
  } finally {
    clearTimeout(timer);
  }
}
