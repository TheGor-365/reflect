/**
 * Stage04H — separate Railway transport for the existing Sessions flow.
 * Only one consented message crosses the wire; no history, profile or diary.
 * The browser NEVER sees the xAI key or Firebase Admin credential.
 */
import { getLimitedUseToken } from "firebase/app-check";
import { auth, appCheckClient, stagingAppCheckEnabled, hostedAiEnabled } from "../firebase/config";

const requested = import.meta.env.VITE_ENABLE_REFLECT_RAILWAY_AI === "true";
const origin = (import.meta.env.VITE_REFLECT_RAILWAY_AI_ORIGIN || "").trim();
const safeOrigin = /^https:\/\/reflect-ai-[a-z0-9-]+\.up\.railway\.app$/.test(origin);
export const railwayAiEnabled = requested && safeOrigin &&
  stagingAppCheckEnabled && !hostedAiEnabled;

if (requested && !railwayAiEnabled) {
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
