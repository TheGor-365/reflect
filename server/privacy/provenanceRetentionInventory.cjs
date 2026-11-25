"use strict";
// Private isolated read-only diagnostic; no endpoint or automatic scheduling.
const {JOB_ROOT}=require("./provenanceRetention.cjs");
const INVENTORY_LIMIT=100;
function createProvenanceRetentionInventory({db,projectId}){
  if(projectId!=="reflect-ai-staging"||!db||typeof db.collection!=="function")
    throw Error("unsafe-retention-inventory-environment");
  async function readAttention(){
    try{
      const page=await db.collection(JOB_ROOT).where("status","==","attention")
        .orderBy("__name__").limit(INVENTORY_LIMIT).get();
      if(!Array.isArray(page?.docs)||page.docs.length>INVENTORY_LIMIT)
        throw Error("invalid-inventory-page");
      const count=page.docs.length;
      return {status:"ok",attentionAtLeast:count,exact:count<INVENTORY_LIMIT};
    }catch{
      return {status:"unavailable"};
    }
  }
  return Object.freeze({readAttention});
}
module.exports={createProvenanceRetentionInventory,INVENTORY_LIMIT};
