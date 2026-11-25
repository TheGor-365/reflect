"use strict";
// Internal authorization candidate only. No HTTP route, deletion, job or fence.
// Verifiers must be trusted server adapters, not caller-provided claims.
const {APP_ID}=require("./provenanceRetentionDeletionHttp.cjs");
const {createPrivacyAuthAdapters}=require("./provenanceRetentionDeletionAuth.cjs");
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const MAX_AUTH_AGE_SECONDS=300;
const tokenOk=(value,min)=>typeof value==="string"&&value.length>=min&&value.length<=8192;
function createAccountDeletionAuthorization({projectId,locallyEnabled=false,verifyAuth,verifyAppCheck,authorizeAccount,authorizeGuest=null,clock=Date.now}={}){
 if(typeof locallyEnabled!=="boolean")throw Error("unsafe-account-deletion-auth");
 if(!locallyEnabled)return null;
 if((authorizeGuest!==null&&typeof authorizeGuest!=="function")||projectId!=="reflect-ai-staging"||[verifyAuth,verifyAppCheck,authorizeAccount,clock].some(fn=>typeof fn!=="function"))
   throw Error("unsafe-account-deletion-auth");
 async function authorize({body,idToken,appCheckToken}={}){
   if(!body||Object.getPrototypeOf(body)!==Object.prototype||
      Object.keys(body).join(",")!=="confirmed"||body.confirmed!==true)
     throw Error("invalid-account-deletion-request");
   if(!tokenOk(idToken,23)||!tokenOk(appCheckToken,20))throw Error("account-deletion-unauthenticated");
   let principal,uid,authTime,provider,issuedAt;
   const fresh=()=>{
     const ms=clock();
     if(!Number.isSafeInteger(ms)||ms<0||!Number.isSafeInteger(authTime)||authTime<0)return false;
     const age=Math.floor(ms/1000)-authTime;
     return age>=0&&age<=MAX_AUTH_AGE_SECONDS;
   };
   try{
     principal=await verifyAuth(idToken);
     uid=principal?.uid;authTime=principal?.auth_time;
     provider=principal?.firebase?.sign_in_provider;
     issuedAt=principal?.iat;
     if(typeof uid!=="string"||!UID.test(uid)||typeof provider!=="string"||!provider||
        !Number.isSafeInteger(authTime)||authTime<0)throw Error("invalid");
   }catch{throw Error("account-deletion-unauthenticated");}
   // Guest deletion must have its own verified identity policy; do not
   // silently force registration or allow an old anonymous token.
   if(provider==="anonymous"&&!authorizeGuest)throw Error("account-deletion-guest-policy-required");
   const freshGuest=()=>{
     const ms=clock();
     if(!Number.isSafeInteger(ms)||ms<0||!Number.isSafeInteger(issuedAt)||issuedAt<authTime)return false;
     const age=Math.floor(ms/1000)-issuedAt;
     return age>=0&&age<=MAX_AUTH_AGE_SECONDS;
   };
   if(provider==="anonymous"&&!freshGuest())throw Error("account-deletion-reauthentication-required");
   if(provider!=="anonymous"&&!fresh())throw Error("account-deletion-reauthentication-required");
   try{
     const app=await verifyAppCheck(appCheckToken);
     if(app?.appId!==APP_ID||app?.alreadyConsumed!==false)throw Error("invalid");
   }catch{throw Error("account-deletion-unauthenticated");}
   try{
     if(await authorizeAccount(Object.freeze({uid}))!==true)throw Error("denied");
   }catch{throw Error("account-deletion-permission-denied");}
   if(provider==="anonymous"){
     try{
       if(await authorizeGuest(Object.freeze({uid,authTime}))!==true)throw Error("denied");
     }catch{throw Error("account-deletion-permission-denied");}
        if(!freshGuest())throw Error("account-deletion-reauthentication-required");
   }else if(!fresh())throw Error("account-deletion-reauthentication-required");
   return Object.freeze({uid});
 }
 return Object.freeze({authorize});
}
function createTrustedAccountDeletionAuthorization({db,projectId,auth,appCheck,locallyEnabled=false,allowGuest=false,clock=Date.now}={}){
 if(typeof allowGuest!=="boolean")throw Error("unsafe-account-deletion-auth");
 if(typeof locallyEnabled!=="boolean")throw Error("unsafe-account-deletion-auth");
 if(!locallyEnabled)return null;
 const adapters=createPrivacyAuthAdapters({db,projectId,auth,appCheck,clock});
 const authorizeGuest=allowGuest?async({uid})=>{
   const user=await auth.getUser(uid);
   return user?.uid===uid&&user.disabled===false&&Array.isArray(user.providerData)&&
     user.providerData.length===0&&!user.email&&!user.phoneNumber;
 }:null;
 return createAccountDeletionAuthorization({projectId,locallyEnabled:true,clock,...adapters,authorizeGuest});
}
module.exports={createAccountDeletionAuthorization,createTrustedAccountDeletionAuthorization,MAX_AUTH_AGE_SECONDS};
