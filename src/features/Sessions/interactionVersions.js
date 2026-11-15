/** Only released Reflect AI structured formats; never guess versions. */
export const INTERACTION_V1 = 'reflect.interaction.v1';
export const INTERACTION_V2 = 'reflect.interaction.v2';
export function isSupportedInteraction(value) {
  return value?.version === INTERACTION_V1 ||
    value?.version === INTERACTION_V2;
}
export const EVIDENCE_SLOT_LABELS = Object.freeze({
  situation: 'Ситуация',
  desiredResult: 'Желаемый результат',
  circumstances: 'Обстоятельства',
  constraints: 'Ограничения и условия'
});
