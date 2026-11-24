"use strict";
// Firestore document ID, not an authorized job identity. Server-private only.
function validCursor(value) {
  if(value===null) return true;
  if(typeof value!=="string" || value.length===0 || value.includes("/") ||
      value==="." || value===".." || /^__.*__$/.test(value) ||
      Buffer.byteLength(value,"utf8")>1500) return false;
  // Reject unpaired UTF-16 surrogates; Firestore IDs must be valid UTF-8.
  return Buffer.from(value,"utf8").toString("utf8")===value;
}
module.exports={validCursor};
