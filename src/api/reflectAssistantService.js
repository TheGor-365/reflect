/**
 * Owner-selected single-message server AI client. The Firebase Functions SDK
 * attaches signed Auth + App Check limited-use tokens automatically.
 * Never include profile, chat history, prior notes, UID or provider secrets.
 */
import { httpsCallable } from 'firebase/functions';
import { aiFunctions, hostedAiEnabled } from '../firebase/config';
import { railwayAiEnabled, railwayAiRecoveryEnabled, getRailwayAnalysis } from './reflectRailwayService';

export const AI_SESSION_ENABLED = hostedAiEnabled || railwayAiEnabled;
export const CONSENT_VERSION = '2026-11-07';

export function createRequestBody(message, requestId, turnRecovery = null) {
  if (typeof message !== 'string' || !message.trim() ||
      message.length > 1400 ||
      new TextEncoder().encode(message.trim()).length > 2000 ||
      typeof requestId !== 'string' ||
      !/^[A-Za-z0-9_-]{12,80}$/.test(requestId)) {
    throw new Error('invalid-argument');
  }
  const body = {
    requestId, message: message.trim(),
    consent: { granted: true, version: CONSENT_VERSION, scope: 'one-message' }
  };
  if (railwayAiRecoveryEnabled) {
    if (!turnRecovery || typeof turnRecovery.sessionId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(turnRecovery.sessionId) ||
        typeof turnRecovery.sourceTurnId !== 'string' ||
        !/^user-[A-Za-z0-9_-]{12,80}$/.test(turnRecovery.sourceTurnId) ||
        (turnRecovery.retryConfirmed !== undefined &&
          turnRecovery.retryConfirmed !== true)) {
      throw new Error('invalid-argument');
    }
    body.sessionId = turnRecovery.sessionId;
    body.sourceTurnId = turnRecovery.sourceTurnId;
    if (turnRecovery.retryConfirmed === true) body.retryConfirmed = true;
  }
  return body;
}

export async function getAnalysisFromAI(message, requestId, turnRecovery = null) {
  if (!AI_SESSION_ENABLED) throw new Error('ai-disabled');
  const payload = createRequestBody(message, requestId, turnRecovery);
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
  if (railwayAiRecoveryEnabled &&
      (data.persistedByServer !== true ||
        data.sourceTurnId !== turnRecovery.sourceTurnId)) {
    throw new Error('invalid-server-response');
  }
  return {
    persistedByServer: railwayAiRecoveryEnabled,
    response: data.text.trim(),
    // Validated by the server. Never interpreted as an authorized Firestore write.
    interaction: data.interaction?.version === 'reflect.interaction.v1'
      ? data.interaction : null,
    actualUsdTicks: Number.isSafeInteger(data.actualUsdTicks)
      ? data.actualUsdTicks : null
  };
}
