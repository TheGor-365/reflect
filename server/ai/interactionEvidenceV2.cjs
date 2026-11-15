"use strict";

/**
 * M5b independent, versioned structured AI policy.
 *
 * Facts are ONLY literal owner-stated quotations from the CURRENT message.
 * The model cannot claim that a statement is independently verified or
 * choose a sourceTurnId. The server maps the current sourceTurnId after the
 * existing receipt has matched the exact committed owner turn.
 *
 * The four-slot readiness summary comes from owner-confirmed Firestore
 * records already read by the trusted receipt, NEVER from xAI. No past quote
 * or owner status is injected into xAI outside the M3 consented transcript.
 */
const { PolicyError } = require("./policy.cjs");
const v1 = require("./interactionContract.cjs");
const { isEvidenceSnapshot, SLOTS } = require("./ownerEvidenceV2.cjs");

const VERSION = "reflect.interaction.v2";
const SOURCE = /^[A-Za-z0-9_-]{1,128}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const fail = () => { throw new PolicyError("invalid-provider-response"); };
const plain = x => !!x && typeof x === "object" &&
  !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

const quoteClaim = Object.freeze({
  type: "object", additionalProperties: false,
  properties: {
    quote: { type: "string", maxLength: 160 },
    sourceRef: { type: "string", enum: ["current-message"] }
  },
  required: ["quote", "sourceRef"]
});
const schema = Object.freeze({
  ...v1.schema,
  properties: Object.freeze({
    ...v1.schema.properties,
    version: { type: "string", const: VERSION },
    evidenceClaims: { type: "array", maxItems: 2, items: quoteClaim },
    clarificationSlot: { type: "string", enum: ["none", ...SLOTS] }
  }),
  required: Object.freeze([
    ...v1.schema.required, "evidenceClaims", "clarificationSlot"
  ])
});

const addedRules = [
  "Правила M5b: разделяй слова владельца, гипотезы и неизвестное.",
  "evidenceClaims — максимум две короткие ДОСЛОВНЫЕ выдержки из текущего",
  "сообщения владельца. sourceRef всегда current-message; не добавляй",
  "цитаты из старой истории, сообщений Reflect или внешних источников.",
  "Это записи слов владельца, а НЕ независимо подтверждённые факты.",
  "Никогда не выдумывай sourceTurnId, не предлагай диагноз и не выставляй",
  "процент уверенности или contextReadiness — сервер определяет полноту",
  "четырёх категорий только по явно подтверждённым записям владельца.",
  "clarificationSlot: none при отсутствии вопроса; если вопрос есть,",
  "укажи одну из situation, desiredResult, circumstances, constraints.",
  "Задавай только один значимый вопрос, когда без ответа важный выбор",
  "хуже обоснован. Не пересказывай уже данные факты как утверждения AI.",
  "Если человек хочет только выговориться — ни вопросов, ни советов.",
  "unknowns — то, чего нельзя надёжно узнать из текущего текста;",
  "не выдавай догадку за проверенную причину. Никогда не создавай цель."
].join("\n");

function buildRequest(message, rawSettings, consentedContext = null) {
  const base = v1.buildRequest(message, rawSettings, consentedContext);
  const original = base.body.input[0].content;
  return Object.freeze({
    endpoint: base.endpoint, settings: base.settings,
    classification: base.classification,
    body: {
      ...base.body,
      input: [
        { role: "system", content:
          original.replace(v1.VERSION, VERSION) + "\n" + addedRules },
        ...base.body.input.slice(1)
      ],
      text: { format: {
        type: "json_schema", name: "reflect_interaction_v2",
        strict: true, schema
      } }
    }
  });
}

function parseInteraction(text, settings, classification, {
  message, sourceTurnId, evidence
} = {}) {
  if (typeof message !== "string" || !message.trim() ||
      !SOURCE.test(sourceTurnId || "") || !isEvidenceSnapshot(evidence)) {
    fail();
  }
  let raw;
  try { raw = JSON.parse(text); } catch { fail(); }
  const keys = Object.keys(schema.properties);
  if (!plain(raw) || Object.keys(raw).length !== keys.length ||
      keys.some(key => !Object.hasOwn(raw, key)) ||
      raw.version !== VERSION ||
      !Array.isArray(raw.evidenceClaims) ||
      raw.evidenceClaims.length > 2 ||
      !SLOTS.concat("none").includes(raw.clarificationSlot)) fail();

  // Existing V1 policy is reused for intent, vent, recommendation and
  // goal suppression, including structured schema strictness.
  const inherited = {};
  for (const key of Object.keys(v1.schema.properties)) {
    inherited[key] = key === "version" ? v1.VERSION : raw[key];
  }
  const parsed = v1.parseInteraction(
    JSON.stringify(inherited), settings, classification
  );

  const claims = raw.evidenceClaims.map(claim => {
    if (!plain(claim) || Object.keys(claim).length !== 2 ||
        !Object.hasOwn(claim, "quote") ||
        !Object.hasOwn(claim, "sourceRef") ||
        claim.sourceRef !== "current-message" ||
        typeof claim.quote !== "string" ||
        claim.quote !== claim.quote.trim() ||
        claim.quote.length < 5 || claim.quote.length > 160 ||
        CONTROL.test(claim.quote) || !message.includes(claim.quote)) fail();
    return Object.freeze({
      quote: claim.quote, sourceRef: "current-message",
      sourceTurnId, provenance: "owner-stated-not-independently-verified"
    });
  });
  if (new Set(claims.map(x => x.quote)).size !== claims.length) fail();

  const asked = parsed.clarifyingQuestion;
  if (!asked && raw.clarificationSlot !== "none") fail();
  if (asked) {
    if (!evidence.missingSlots.includes(raw.clarificationSlot)) fail();
    const canonical = asked.replace(/\s+/g, " ").trim().toLowerCase();
    if (evidence.previousQuestions.includes(canonical)) fail();
  }

  return Object.freeze({
    ...parsed, version: VERSION,
    evidenceClaims: Object.freeze(claims),
    clarificationSlot: raw.clarificationSlot,
    // All three lists are from a validated, private owner session, NOT model.
    evidenceSummary: Object.freeze({
      confirmedSlots: Object.freeze([...evidence.confirmedSlots]),
      disputedSlots: Object.freeze([...evidence.disputedSlots]),
      missingSlots: Object.freeze([...evidence.missingSlots]),
      completeCount: evidence.confirmedSlots.length
    })
  });
}

module.exports = { VERSION, schema, buildRequest, parseInteraction };
