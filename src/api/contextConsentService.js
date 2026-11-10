/**
 * AI-01G: isolated, consent-only Railway transport.
 * Does NOT read history or call the provider. OFF without both staging gates.
 */
import { getLimitedUseToken } from "firebase/app-check";
import {
  auth, appCheckClient, hostedAiEnabled, stagingAppCheckEnabled
} from "../firebase/config";

const requested = import.meta.env.VITE_ENABLE_REFLECT_CONTEXT_CONSENT === "true";
const origin = (import.meta.env.VITE_REFLECT_RAILWAY_AI_ORIGIN || "").trim();
const approved = origin === "https://reflect-ai-api-staging.up.railway.app" &&
  stagingAppCheckEnabled && !hostedAiEnabled &&
  import.meta.env.VITE_AI_STAGING_PROJECT_ID === "reflect-ai-staging";
export const contextConsentUiEnabled = requested && approved;

if (requested && !approved) {
  throw new Error("Context consent requires isolated signed staging.");
}

const allowlistedErrors = Object.freeze([
  "unauthenticated", "reauthentication-required", "permission-denied",
  "invalid-argument", "not-found", "already-exists",
  "resource-exhausted", "unavailable"
]);
export const CONTEXT_CONSENT_VERSION = "2026-11-10-01";
export const CONTEXT_SCOPE = "session-turns";

export async function requestContextConsent(command) {
  if (!contextConsentUiEnabled || !appCheckClient || !auth.currentUser) {
    throw new Error("consent-disabled");
  }
  if (!command || typeof command !== "object" || Array.isArray(command) ||
      !["grant", "revoke", "list"].includes(command.action)) {
    throw new Error("invalid-argument");
  }
  // Never attach UID or sensitive session content. The server assigns UID
  // from its verified Firebase Auth token and accepts only exact fields.
  const [idToken, attestation] = await Promise.all([
    auth.currentUser.getIdToken(),
    getLimitedUseToken(appCheckClient)
  ]);
  if (!idToken || !attestation?.token) throw new Error("unauthenticated");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(origin + "/v1/privacy/context-consent", {
      method: "POST", mode: "cors", credentials: "omit", cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken,
        "X-Firebase-AppCheck": attestation.token
      },
      body: JSON.stringify(command),
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    if (response.status !== 200) {
      throw new Error(allowlistedErrors.includes(body?.error)
        ? body.error : "consent-unavailable");
    }
    if (!body || typeof body !== "object") throw new Error("consent-unavailable");
    if (command.action === "list") {
      if (!Array.isArray(body.grants) || body.grants.length > 100 ||
          body.grants.some(g => !g || typeof g.grantId !== "string" ||
            typeof g.sourceId !== "string" || g.scope !== CONTEXT_SCOPE ||
            !Number.isSafeInteger(g.expiresAtMs))) {
        throw new Error("consent-unavailable");
      }
    } else if (!["active", "revoked"].includes(body.status) ||
      (command.action === "grant" && (
        body.status !== "active" || !Number.isSafeInteger(body.expiresAtMs)
      ))) throw new Error("consent-unavailable");
    return body;
  } catch (error) {
    if (allowlistedErrors.includes(error?.message) || error?.message === "consent-unavailable") {
      throw error;
    }
    throw new Error("consent-unavailable");
  } finally {
    clearTimeout(timer);
  }
}
