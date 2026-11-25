"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync}=require("node:crypto");
const {getApps}=require("firebase-admin/app");
const {initializePrivacyFirebaseClients}=require("./privacyFirebaseSdk.cjs");
const {createPrivacyDispatcherCandidate}=require("./privacyDispatcherCandidate.cjs");
const {APP_ID,ORIGIN}=require("../privacy/provenanceRetentionDeletionHttp.cjs");
const PROJECT="reflect-ai-staging";
const NAME="reflect-r139-privacy-staging";
if(process.env.REFLECT_R139_OFFLINE_SDK!=="1" ||
   process.env.GOOGLE_APPLICATION_CREDENTIALS ||
   process.env.FIRESTORE_EMULATOR_HOST ||
   process.env.FIREBASE_AUTH_EMULATOR_HOST ||
   process.env.FIREBASE_CONFIG ||
   process.env.REFLECT_FIREBASE_SERVICE_ACCOUNT_JSON)
  throw Error("unsafe offline SDK environment");
// Ephemeral locally generated key; never a Google-issued credential.
// Run only with OS-level network isolation. No SDK request methods invoked.
test("real SDK named app metadata and disposal, then dispatcher compatibility",async()=>{
  const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,
    privateKeyEncoding:{type:"pkcs8",format:"pem"},
    publicKeyEncoding:{type:"spki",format:"pem"}});
  const credential={type:"service_account",project_id:PROJECT,
    client_email:"offline-fixture@example.invalid",private_key:privateKey};
  const clients=await initializePrivacyFirebaseClients({
    locallyEnabled:true,projectId:PROJECT,credential
  });
  try{
    assert.equal(clients.auth.app.name,NAME);
    assert.equal(clients.auth.app,clients.appCheck.app);
    assert.equal(clients.auth.app.options.projectId,PROJECT);
    let metadata;
    try{metadata=clients.db.projectId;}catch{metadata="unavailable";}
    assert.ok(metadata===PROJECT||metadata==="unavailable");
    console.log("R139_REAL_SDK_PROJECT_METADATA="+metadata);
  }finally{await clients.dispose();}
  assert.equal(getApps().some(app=>app.name===NAME),false);
  let runtime;
  try{
    runtime=await createPrivacyDispatcherCandidate({
      locallyEnabled:true,projectId:PROJECT,appId:APP_ID,origin:ORIGIN,
      readCredential:()=>JSON.stringify(credential),
      aiRoute:()=>{throw Error("unexpected AI dispatch");}
    });
    let status;
    await runtime.dispatch({url:"/v1/privacy/session-deletion",method:"OPTIONS",
      headers:{origin:ORIGIN}},{writeHead(code){status=code;},end(){}});
    assert.equal(status,204);
    console.log("R139_REAL_SDK_DISPATCHER_PASS");
  }finally{
    if(runtime)await runtime.dispose();
    assert.equal(getApps().some(app=>app.name===NAME),false);
  }
});
