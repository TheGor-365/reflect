"use strict";

/**
 * Stage04D: xAI Responses API contract. NO network, provider SDK, API secret,
 * Firebase deployment or browser integration. The only execution path is a
 * caller-supplied synthetic response fixture. Never import the global fetch.
 *
 * Consumer code must first pass the existing Auth, App Check, explicit-consent
 * and transaction-reservation gates. This module is NOT a production adapter.
 */
const { PolicyError, LIMITS, validateAssistantReply } = require("./policy.cjs");

const MODEL = "grok-4.3";
const ENDPOINT = "https://api.x.ai/v1/responses";
const INPUT_USD_PER_MILLION = 1.25; // xAI published 2026-11-07; recheck live
const OUTPUT_USD_PER_MILLION = 2.50;
const SYSTEM_INSTRUCTION =
  "Ты помощник для самостоятельной рефлексии. Отвечай по-русски, " +
  "сдержанно и кратко. Помогай уточнять мысли вопросами; не ставь " +
  "медицинские диагнозы, не обещай терапию, не выдавай себя за врача. " +
  "Не запрашивай личные документы, адреса, пароли или историю дневника. " +
  "Не предлагай выполнять внешние действия или вызывать инструменты.";

const failure = code => { throw new PolicyError(code); };
const plain = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const noControls = value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const bytes = value => Buffer.byteLength(value, "utf8");

function createSyntheticXaiRequest(message) {
  if (typeof message !== "string" || !message.trim() ||
      message.length > LIMITS.maxMessageChars ||
      bytes(message) > LIMITS.maxMessageBytes ||
      !noControls(message)) failure("invalid-argument");
  // Explicit max_output_tokens: xAI otherwise permits very long output.
  // store:false disables *stateful response retrieval* but does NOT imply
  // that the provider has zero audit retention; ZDR is a separate setting.
  const body = Object.freeze({
    model: MODEL,
    input: Object.freeze([
      Object.freeze({ role: "system", content: SYSTEM_INSTRUCTION }),
      Object.freeze({ role: "user", content: message.trim() })
    ]),
    store: false,
    max_output_tokens: LIMITS.maxOutputTokens,
    tools: Object.freeze([]),
    tool_choice: "none",
    stream: false,
    truncation: "disabled"
  });
  return Object.freeze({
    endpoint: ENDPOINT,
    method: "POST",
    contentType: "application/json",
    body
  });
}

function extractXaiText(reply) {
  if (!plain(reply) || reply.status !== "completed" ||
      reply.model !== MODEL || !Array.isArray(reply.output) ||
      reply.output.length === 0 || reply.output.length > 20 ||
      !plain(reply.usage) ||
      !Number.isSafeInteger(reply.usage.input_tokens) ||
      !Number.isSafeInteger(reply.usage.output_tokens) ||
      reply.usage.input_tokens < 0 || reply.usage.output_tokens < 0 ||
      reply.usage.output_tokens > LIMITS.maxOutputTokens) {
    failure("invalid-provider-response");
  }
  let text = "";
  let countMessages = 0;
  for (const item of reply.output) {
    if (!plain(item)) failure("invalid-provider-response");
    // Reasoning may be present but must never be exposed, stored or
    // passed back into a session by this MVP.
    if (item.type === "reasoning") continue;
    if (item.type !== "message" || item.role !== "assistant" ||
        !Array.isArray(item.content) || ++countMessages > 1) {
      failure("invalid-provider-response");
    }
    for (const chunk of item.content) {
      if (!plain(chunk) || chunk.type !== "output_text" ||
          typeof chunk.text !== "string") failure("invalid-provider-response");
      text += chunk.text;
    }
  }
  if (countMessages !== 1) failure("invalid-provider-response");
  const response = validateAssistantReply({ text });
  return Object.freeze({
    text: response.text,
    usage: Object.freeze({
      inputTokens: reply.usage.input_tokens,
      outputTokens: reply.usage.output_tokens
    })
  });
}
function estimatePublishedUsd(inputTokens, outputTokens) {
  if (![inputTokens, outputTokens].every(x =>
      Number.isSafeInteger(x) && x >= 0 && x <= 200000)) {
    failure("invalid-usage");
  }
  return (inputTokens * INPUT_USD_PER_MILLION +
    outputTokens * OUTPUT_USD_PER_MILLION) / 1000000;
}
/**
 * Executes a supplied **fixture** function, NOT an actual network request.
 * No key is accepted in the argument list and no global fetch is accessed.
 */
async function simulateXai({ message, fixture }) {
  if (process.env.REFLECT_XAI_FIXTURES_ONLY !== "yes" ||
      typeof fixture !== "function") failure("unsafe-environment");
  const request = createSyntheticXaiRequest(message);
  let reply;
  try {
    reply = await fixture(request);
  } catch {
    // Never propagate error containing a full message or authorization.
    failure("unavailable");
  }
  const parsed = extractXaiText(reply);
  return Object.freeze({
    text: parsed.text,
    estimatedUsdFromPublishedRates: estimatePublishedUsd(
      parsed.usage.inputTokens, parsed.usage.outputTokens
    ),
    mode: "synthetic-fixture"
  });
}

module.exports = {
  MODEL, ENDPOINT, INPUT_USD_PER_MILLION, OUTPUT_USD_PER_MILLION,
  createSyntheticXaiRequest, extractXaiText,
  estimatePublishedUsd, simulateXai
};
