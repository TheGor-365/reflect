"use strict";

/**
 * Stage04F: server-only xAI Responses transport, NOT a callable or deployment.
 *
 * The authenticated Firebase callable MUST complete SDK Auth + signed App Check,
 * exact one-message consent, owner-scoped idempotency, atomic quota + global
 * budget reservation, and server kill-switch BEFORE calling invoke().
 * This adapter deliberately does not pretend to enforce those external gates.
 *
 * No default network transport or API credential is installed. The future
 * staging runtime must inject an explicit fetch-compatible transport and
 * a Firebase Secret Manager-bound credential reader. No automatic retries.
 * NEVER import this module from src/ or expose it as a public route.
 */
const { PolicyError } = require("./policy.cjs");
const { readProviderCharge } = require("./xaiCost.cjs");
const { buildRequest, parseInteraction } = require("./interactionContract.cjs");
const {
  MODEL, ENDPOINT, createSyntheticXaiRequest, extractXaiText,
  estimatePublishedUsd
} = require("./xaiContract.cjs");

const MAX_RESPONSE_BYTES = 96 * 1024;
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_TIMEOUT_MS = 30000;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/i;

function fail(code, upstreamHttpStatus) {
  const error = new PolicyError(code);
  // Internal, non-enumerable diagnostic metadata. A callable MUST NOT
  // serialize this error into a user-visible response or a content log.
  if (Number.isInteger(upstreamHttpStatus) &&
      upstreamHttpStatus >= 100 && upstreamHttpStatus <= 599) {
    Object.defineProperty(error, "upstreamHttpStatus", {
      value: upstreamHttpStatus, enumerable: false
    });
  }
  throw error;
}

async function readLimitedJson(response) {
  const contentType = response.headers?.get?.("content-type");
  if (typeof contentType !== "string" ||
      !JSON_CONTENT_TYPE.test(contentType)) {
    fail("invalid-provider-response");
  }
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null) {
    if (!/^\d+$/.test(lengthHeader) ||
        Number(lengthHeader) > MAX_RESPONSE_BYTES) {
      fail("invalid-provider-response");
    }
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    fail("invalid-provider-response");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let finished = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        finished = true;
        break;
      }
      if (!(chunk.value instanceof Uint8Array)) {
        fail("invalid-provider-response");
      }
      received += chunk.value.byteLength;
      if (received > MAX_RESPONSE_BYTES) {
        fail("invalid-provider-response");
      }
      chunks.push(Buffer.from(chunk.value));
    }
  } finally {
    if (!finished) {
      try { await reader.cancel(); } catch { /* never expose transport errors */ }
    }
    try { reader.releaseLock(); } catch { /* already closed */ }
  }
  if (received === 0) fail("invalid-provider-response");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail("invalid-provider-response");
  }
}

function createXaiProviderAdapter({
  transport, readSecret, timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  // Fail closed. No global fetch, no env fallback, no test fixture in prod.
  if (typeof transport !== "function" ||
      typeof readSecret !== "function" ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    fail("unsafe-environment");
  }

  async function invoke(message, interactionConfig = null) {
    // Keep legacy preflight strict; only the server chooses V1 interaction mode.
    const checked = createSyntheticXaiRequest(message);
    const request = interactionConfig
      ? buildRequest(checked.body.input[1].content, interactionConfig) : checked;
    let secret;
    try {
      secret = await readSecret();
    } catch {
      fail("unavailable");
    }
    if (typeof secret !== "string" ||
        !/^xai-[A-Za-z0-9_-]{20,250}$/.test(secret)) {
      secret = undefined;
      fail("unavailable");
    }

    let response;
    try {
      response = await transport(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + secret,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...request.body,
          reasoning: { effort: "none" }
        }),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      fail("unavailable");
    } finally {
      // Best-effort: reduce lifetime of the credential variable.
      secret = undefined;
    }

    if (!response || !Number.isInteger(response.status) ||
        typeof response.ok !== "boolean" ||
        response.redirected !== false) {
      fail("invalid-provider-response");
    }
    if (!response.ok || response.status !== 200) {
      // Intentionally never read, return or log provider error body.
      try { await response.body?.cancel?.(); } catch { /* ignored */ }
      fail("unavailable", response.status);
    }

    let payload;
    try {
      payload = await readLimitedJson(response);
    } catch (error) {
      if (error instanceof PolicyError) throw error;
      fail("invalid-provider-response");
    }
    const parsed = extractXaiText(payload);
    // Invalid structured output is not rendered or retried. One paid call only.
    const interaction = interactionConfig
      ? parseInteraction(parsed.text, request.settings, request.classification) : null;
    // Provider-reported receipt is authoritative when available; the
    // published token-rate projection is informational, never a charge.
    // A missing receipt remains null, never $0 or an estimated debit.
    const charge = readProviderCharge(payload.usage);
    return Object.freeze({
      model: MODEL,
      ...charge,
      text: interaction ? interaction.answer : parsed.text,
      ...(interaction ? { interaction } : {}),
      usage: parsed.usage,
      estimatedUsdFromPublishedRates: estimatePublishedUsd(
        parsed.usage.inputTokens, parsed.usage.outputTokens
      )
    });
  }

  return Object.freeze({ invoke });
}

module.exports = {
  createXaiProviderAdapter, MAX_RESPONSE_BYTES,
  DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS
};
