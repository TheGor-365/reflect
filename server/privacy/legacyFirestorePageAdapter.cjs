"use strict";
// Demo-only candidate. No production URL, credentials, writes or automatic
// pagination. Firestore may return short pages with continuation tokens.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const LIMIT=25;
const PROJECT="demo-reflect-r139";
const BASE="http://127.0.0.1:19381/v1/projects/"+PROJECT+"/databases/(default)/documents/";
function createLegacyFirestorePageAdapter({locallyEnabled=false,env=process.env,transport=fetch}={}){
 if(typeof locallyEnabled!=="boolean")throw Error("unsafe-legacy-page-adapter");
 if(!locallyEnabled)return null;
 if(env.GCLOUD_PROJECT!==PROJECT||env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:19381"||
    env.REFLECT_R139_EMULATOR!=="1"||env.GOOGLE_APPLICATION_CREDENTIALS||
    typeof transport!=="function")throw Error("unsafe-legacy-page-adapter");
 async function readPage({uid,pageToken=null}={}){
   if(typeof uid!=="string"||!ID.test(uid)||
      (pageToken!==null&&(typeof pageToken!=="string"||!pageToken||pageToken.length>4096)))
     throw Error("invalid-legacy-page-scope");
   const path="_reflectAiPrivate/reflect-8fdc8/attemptOwners/"+uid+"/sessions";
   const url=new URL(BASE+path);
   url.searchParams.set("showMissing","true");
   url.searchParams.set("pageSize",String(LIMIT));
   url.searchParams.append("mask.fieldPaths","__name__");
   if(pageToken!==null)url.searchParams.set("pageToken",pageToken);
   try{
     const response=await transport(url.toString(),{method:"GET",redirect:"error",
       headers:{Authorization:"Bearer owner"},signal:AbortSignal.timeout(10000)});
     if(!response.ok)throw Error("storage");
     const body=await response.json();
     if(!body||typeof body!=="object"||Array.isArray(body))throw Error("invalid");
     const docs=body.documents===undefined?[]:body.documents;
     if(!Array.isArray(docs)||docs.length>LIMIT)throw Error("invalid");
     const prefix="projects/"+PROJECT+"/databases/(default)/documents/"+path+"/";
     const seen=new Set(),targets=[];
     for(const doc of docs){
       if(typeof doc?.name!=="string"||!doc.name.startsWith(prefix))throw Error("invalid");
       const sessionId=doc.name.slice(prefix.length);
       if(!ID.test(sessionId)||seen.has(sessionId))throw Error("invalid");
       seen.add(sessionId);targets.push(Object.freeze({uid,sessionId}));
     }
     const nextPageToken=body.nextPageToken===undefined||body.nextPageToken===""?null:body.nextPageToken;
     if(nextPageToken!==null&&(typeof nextPageToken!=="string"||nextPageToken.length>4096||
         nextPageToken===pageToken))throw Error("invalid");
     return Object.freeze({targets:Object.freeze(targets),nextPageToken});
   }catch{throw Error("legacy-page-unavailable");}
 }
 return Object.freeze({readPage});
}
module.exports={createLegacyFirestorePageAdapter,LIMIT};
