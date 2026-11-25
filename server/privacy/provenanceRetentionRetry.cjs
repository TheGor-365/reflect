"use strict";
// Isolated retry policy; no storage, timer or runtime activation.
const MAX_FAILURES = 5;
const BASE_DELAY_MS = 60000;
const MAX_DELAY_MS = 480000;
const validTime = value => Number.isSafeInteger(value) && value >= 0;
function readRetry(row) {
  if (!Object.hasOwn(row,"retry")) return {failures:0,notBeforeMs:0};
  const state = row.retry;
  if (!state || !Number.isInteger(state.failures) || state.failures < 0 ||
      state.failures > MAX_FAILURES || !validTime(state.notBeforeMs) ||
      (state.failures === 0 && state.notBeforeMs !== 0) ||
      (state.failures === MAX_FAILURES && state.notBeforeMs !== 0) ||
      (state.failures > 0 && state.failures < MAX_FAILURES && state.notBeforeMs === 0)) {
    throw Error("invalid-retention-retry");
  }
  return {failures:state.failures,notBeforeMs:state.notBeforeMs};
}
function eligible(row, now) {
  if (!validTime(now)) throw Error("invalid-retention-clock");
  const retry = readRetry(row);
  return retry.failures < MAX_FAILURES && retry.notBeforeMs <= now;
}
function afterFailure(row, now) {
  if (!eligible(row,now)) throw Error("retention-retry-not-eligible");
  const failures = readRetry(row).failures + 1;
  const delay = Math.min(MAX_DELAY_MS,BASE_DELAY_MS * 2 ** (failures - 1));
  if (failures === MAX_FAILURES) return {status:"attention",retry:{failures,notBeforeMs:0}};
  if (!validTime(now + delay)) throw Error("invalid-retention-clock");
  return {status:"pending",retry:{failures,notBeforeMs:now + delay}};
}
const afterSuccess = () => ({failures:0,notBeforeMs:0});
module.exports = {MAX_FAILURES,BASE_DELAY_MS,MAX_DELAY_MS,readRetry,eligible,afterFailure,afterSuccess};
