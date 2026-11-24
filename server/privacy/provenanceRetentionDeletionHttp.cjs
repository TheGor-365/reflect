"use strict";
// Isolated listener; not registered in any runtime.
const PATH="/v1/privacy/session-deletion";
const ORIGIN="https://reflect-ai-staging.web.app";
const APP_ID="1:599679789981:web:d4d8743dbff0fe40af1d74";
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const MAX_BYTES=1024;
const {createProvenanceRetention}=require("./provenanceRetention.cjs");
function respond(res,status,data,cors=false){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8",
    "cache-control":"no-store, private","x-content-type-options":"nosniff",vary:"Origin",
    ...(cors?{"access-control-allow-origin":ORIGIN,"access-control-allow-methods":"POST, OPTIONS",
      "access-control-allow-headers":"Authorization, X-Firebase-AppCheck, Content-Type"}:{})});
  res.end(status===204?"":JSON.stringify(data));
}
async function readBody(req){
  if(req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase()!=="application/json"||
    Number(req.headers["content-length"])>MAX_BYTES) throw Error("invalid-body");
  const chunks=[];let size=0;
  for await(const part of req){
    const chunk=Buffer.from(part);size+=chunk.length;
    if(size>MAX_BYTES) throw Error("invalid-body");
    chunks.push(chunk);
  }
  const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!body||Object.getPrototypeOf(body)!==Object.prototype||
    Object.keys(body).sort().join(",")!=="confirmed,sessionId"||
    body.confirmed!==true||typeof body.sessionId!=="string"||!ID.test(body.sessionId))
    throw Error("invalid-body");
  return body;
}
function createSessionDeletionListener({verifyAuth,verifyAppCheck,authorizeAccount,rateLimit,revoke}){
  if(![verifyAuth,verifyAppCheck,authorizeAccount,rateLimit,revoke].every(f=>typeof f==="function"))
    throw Error("unsafe-deletion-environment");
  return async(req,res)=>{
    if(req.headers.origin!==ORIGIN) return respond(res,403,{error:"forbidden"});
    if(req.url!==PATH||!["POST","OPTIONS"].includes(req.method)) return respond(res,404,{error:"not-found"},true);
    if(req.method==="OPTIONS") return respond(res,204,{},true);
    const token=req.headers.authorization, appToken=req.headers["x-firebase-appcheck"];
    if(typeof token!=="string"||!token.startsWith("Bearer ")||token.length<30||token.length>8192||
      typeof appToken!=="string"||appToken.length<20||appToken.length>8192)
      return respond(res,401,{error:"unauthenticated"},true);
    let body,principal,app;
    try{body=await readBody(req);}catch{return respond(res,400,{error:"invalid-argument"},true);}
    try{
      principal=await verifyAuth(token.slice(7));
      app=await verifyAppCheck(appToken);
    }catch{return respond(res,401,{error:"unauthenticated"},true);}
    if(typeof principal?.uid!=="string"||!ID.test(principal.uid)||app?.appId!==APP_ID||app?.alreadyConsumed!==false)
      return respond(res,401,{error:"unauthenticated"},true);
    try{
      if(await authorizeAccount(principal)!==true) return respond(res,403,{error:"permission-denied"},true);
      await rateLimit(principal.uid);
      const result=await revoke(body,{uid:principal.uid});
      if(result?.revoked!==true) throw Error("invalid-result");
      return respond(res,200,{status:"revoked"},true);
    }catch(error){
      if(error?.code==="resource-exhausted") return respond(res,429,{error:"resource-exhausted"},true);
      if(error?.message==="archived-session-deletion-blocked") return respond(res,409,{error:"archived-session"},true);
      if(error?.message==="session-not-found") return respond(res,404,{error:"session-not-found"},true);
      return respond(res,503,{error:"unavailable"},true);
    }
  };
}
// Auth must check revocation; App Check must consume tokens. Authorization is
// privacy-specific, not a paid AI entitlement. No route or secret loading.
function createSessionDeletionComposition({db,projectId,deleteField,locallyEnabled=false,
  verifyAuth,verifyAppCheck,authorizeAccount,rateLimit}={}){
  if(projectId!=="reflect-ai-staging"||typeof locallyEnabled!=="boolean") throw Error("unsafe-deletion-environment");
  if(!locallyEnabled) return null;
  const retention=createProvenanceRetention({db,projectId,deleteField,requireDeletionFlag:true});
  return createSessionDeletionListener({verifyAuth,verifyAppCheck,authorizeAccount,rateLimit,
    revoke:retention.revokeAndDeleteSession});
}
module.exports={PATH,ORIGIN,APP_ID,createSessionDeletionListener,createSessionDeletionComposition};
