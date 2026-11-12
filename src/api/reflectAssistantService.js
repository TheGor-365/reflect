/**
 * Owner-selected single-message server AI client. The Firebase Functions SDK
 * attaches signed Auth + App Check limited-use tokens automatically.
 * Never include profile, chat history, prior notes, UID or provider secrets.
 */
import { httpsCallable } from 'firebase/functions';
import { aiFunctions, hostedAiEnabled } from '../firebase/config';
import { railwayAiEnabled, getRailwayAnalysis } from './reflectRailwayService';

export const AI_SESSION_ENABLED = hostedAiEnabled || railwayAiEnabled;
export const CONSENT_VERSION = '2026-11-07';

export function createRequestBody(message, requestId) {
  if (typeof message !== 'string' || !message.trim() ||
      message.length > 1400 ||
      new TextEncoder().encode(message.trim()).length > 2000 ||
      typeof requestId !== 'string' ||
      !/^[A-Za-z0-9_-]{12,80}$/.test(requestId)) {
    throw new Error('invalid-argument');
  }
  return {
    requestId, message: message.trim(),
    consent: { granted: true, version: CONSENT_VERSION, scope: 'one-message' }
  };
}

export async function getAnalysisFromAI(message, requestId) {
  if (!AI_SESSION_ENABLED) throw new Error('ai-disabled');
  const payload = createRequestBody(message, requestId);
  // No automatic retries. The Railway path is isolated from Firebase Functions.
  let data;
  if (railwayAiEnabled) {
    data = await getRailwayAnalysis(payload);
  } else {
    if (!aiFunctions) throw new Error('ai-disabled');
    const callable = httpsCallable(aiFunctions, 'reflectAiReply', {
      timeout: 45000, limitedUseAppCheckTokens: true
    });
    const result = await callable(payload);
    data = result?.data;
  }
  if (!data || typeof data.text !== 'string' ||
      !data.text.trim() || data.text.length > 2400 ||
      data.model !== 'grok-4.3') {
    throw new Error('invalid-server-response');
  }
  return {
    response: data.text.trim(),
    // Validated by the server. Never interpreted as an authorized Firestore write.
    interaction: data.interaction?.version === 'reflect.interaction.v1'
      ? data.interaction : null,
    actualUsdTicks: Number.isSafeInteger(data.actualUsdTicks)
      ? data.actualUsdTicks : null
  };
}
