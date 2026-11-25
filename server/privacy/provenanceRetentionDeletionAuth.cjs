"use strict";
// No initialization, credentials, route registration or AI entitlement.
const {APP_ID,createSessionDeletionComposition}=require("./provenanceRetentionDeletionHttp.cjs");
const {createAppCheckReplayGuard}=require("../railway/appCheckReplayGuard.cjs");
const UID=/^[A-Za-z0-9_-]{1,128}$/;
function createPrivacyAuthAdapters({db,projectId,auth,appCheck,clock=Date.now}={}){
  if(projectId!=="reflect-ai-staging"||db?.projectId!==projectId||
    auth?.app?.options?.projectId!==projectId||appCheck?.app?.options?.projectId!==projectId||
    typeof auth.verifyIdToken!=="function"||typeof auth.getUser!=="function"||
    typeof appCheck.verifyToken!=="function") throw Error("unsafe-privacy-auth-environment");
  const replay=createAppCheckReplayGuard({db,projectId,clock});
  async function verifyAuth(token){
    return auth.verifyIdToken(token,true);
  }
  async function verifyAppCheck(token){
    const result=await appCheck.verifyToken(token,{consume:true});
    if(result?.appId!==APP_ID||result?.alreadyConsumed!==false)
      throw Error("invalid-privacy-app-check");
    if(await replay.consume(token,result)!==true) throw Error("replayed-privacy-app-check");
    return result;
  }
  async function authorizeAccount(principal){
    if(typeof principal?.uid!=="string"||!UID.test(principal.uid)) return false;
    try{
      const user=await auth.getUser(principal.uid);
      // Guests and unverified email accounts retain access to their own
      // deletion operation; paid AI eligibility is not a privacy condition.
      return user?.uid===principal.uid&&user.disabled===false;
    }catch{return false;}
  }
  return Object.freeze({verifyAuth,verifyAppCheck,authorizeAccount});
}
function createTrustedSessionDeletion({db,projectId,auth,appCheck,deleteField,locallyEnabled=false,clock=Date.now}={}){
  if(projectId!=="reflect-ai-staging"||typeof locallyEnabled!=="boolean")
    throw Error("unsafe-privacy-auth-environment");
  if(!locallyEnabled) return null;
  const adapters=createPrivacyAuthAdapters({db,projectId,auth,appCheck,clock});
  return createSessionDeletionComposition({db,projectId,deleteField,locallyEnabled,clock,...adapters});
}
module.exports={createPrivacyAuthAdapters,createTrustedSessionDeletion};
