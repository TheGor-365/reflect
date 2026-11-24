"use strict";
// Isolated staging-only runtime. No AI entitlement or provider calls.
const {DELETION_FLAG}=require("./provenanceRetention.cjs");
const QUOTA_ROOT="_reflectAiPrivate/reflect-8fdc8/sessionDeletionQuotas";
const LIMIT=60,WINDOW_MS=3600000;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const fail=code=>{throw Object.assign(Error(code),{code});};
function createSessionDeletionRuntime({db,projectId,locallyEnabled=false,clock=Date.now}={}){
  if(projectId!=="reflect-ai-staging"||!db||typeof db.doc!=="function"||
    typeof db.runTransaction!=="function"||typeof locallyEnabled!=="boolean"||
    typeof clock!=="function") fail("unsafe-deletion-environment");
  async function rateLimit(uid){
    if(typeof uid!=="string"||!UID.test(uid)) fail("invalid-argument");
    if(!locallyEnabled) fail("unavailable");
    const ref=db.doc(QUOTA_ROOT+"/"+uid),flag=db.doc(DELETION_FLAG);
    return db.runTransaction(async tx=>{
      const [gate,snapshot]=await Promise.all([tx.get(flag),tx.get(ref)]);
      if(!gate.exists||gate.data()?.enabled!==true) fail("unavailable");
      const now=clock();
      if(!Number.isSafeInteger(now)||now<0||now>8640000000000000) fail("unavailable");
      const window=Math.floor(now/WINDOW_MS);
      const prior=snapshot.exists?snapshot.data():null;
      if(snapshot.exists&&(!prior||prior.schemaVersion!==1||
        !Number.isSafeInteger(prior.window)||prior.window<0||prior.window>window||
        !Number.isSafeInteger(prior.count)||prior.count<1||prior.count>LIMIT))
        fail("unavailable");
      const count=prior?.window===window?prior.count:0;
      if(count>=LIMIT) fail("resource-exhausted");
      tx.set(ref,{schemaVersion:1,window,count:count+1});
      return true;
    });
  }
  return Object.freeze({rateLimit});
}
module.exports={createSessionDeletionRuntime,QUOTA_ROOT,LIMIT,WINDOW_MS};
