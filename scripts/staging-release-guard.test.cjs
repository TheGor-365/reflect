'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {checkConfig,checkGit}=require('./staging-release-guard.cjs');
const hosting={hosting:{site:'reflect-ai-staging',public:'dist',
  rewrites:[{source:'**',destination:'/index.html'}]}};
function fixture(){
  return {
    VITE_FIREBASE_CONFIG:JSON.stringify({
      apiKey:'real-like-public-web-key-test-only-123',
      authDomain:'reflect-ai-staging.firebaseapp.com',
      projectId:'reflect-ai-staging',
      appId:'1:599679789981:web:d4d8743dbff0fe40af1d74',
      messagingSenderId:'599679789981'
    }),
    VITE_APP_ID:'reflect-8fdc8',
    VITE_AI_STAGING_PROJECT_ID:'reflect-ai-staging',
    VITE_USE_FIREBASE_EMULATORS:'false',
    VITE_ENABLE_STAGING_APP_CHECK:'true',
    VITE_APP_CHECK_SITE_KEY:'public-site-key-for-testing-000000',
    VITE_ENABLE_REFLECT_CLOUD_AI:'false',
    VITE_ENABLE_REFLECT_RAILWAY_AI:'true',
    VITE_ENABLE_REFLECT_RAILWAY_PRECHECK:'false',
    VITE_REFLECT_RAILWAY_AI_ORIGIN:'https://reflect-ai-api-staging.up.railway.app',
    VITE_ENABLE_REFLECT_CONTEXT_PREVIEW:'false',
    VITE_ENABLE_REFLECT_CONTEXT_CONSENT:'false',
    VITE_ENABLE_REFLECT_PREVIEW_GATE5_QA:'false'
  };
}
test('exact isolated Firebase Hosting and signed Railway config accepted',()=>{
  assert.deepEqual(checkConfig(fixture(),hosting),[]);
});
test('wrong Firebase production project rejected (no fallback)',()=>{
  const env=fixture(),json=JSON.parse(env.VITE_FIREBASE_CONFIG);
  json.projectId='reflect-8fdc8';env.VITE_FIREBASE_CONFIG=JSON.stringify(json);
  assert.match(checkConfig(env,hosting).join('\n'),/Public Firebase project/);
});
test('wrong Web app identity, sender and Auth domain rejected',()=>{
  const env=fixture(),json=JSON.parse(env.VITE_FIREBASE_CONFIG);
  json.appId='1:123:web:another';json.authDomain='reflect-8fdc8.firebaseapp.com';
  json.messagingSenderId='123';env.VITE_FIREBASE_CONFIG=JSON.stringify(json);
  const failures=checkConfig(env,hosting).join('\n');
  assert.match(failures,/appId/);
  assert.match(failures,/Auth domain/);
  assert.match(failures,/messaging sender/);
});
test('unrelated Hosting site and destructive deploy targets are refused',()=>{
  const wrong=structuredClone(hosting);
  wrong.hosting.site='reflect-production';
  wrong.firestore={rules:'rules.txt'};
  wrong.functions={source:'functions'};
  const fail=checkConfig(fixture(),wrong).join('\n');
  assert.match(fail,/isolated/);
  assert.match(fail,/must not contain Firestore\/Functions/);
});
test('App Check cannot be disabled or replaced with a placeholder',()=>{
  const env=fixture();
  env.VITE_ENABLE_STAGING_APP_CHECK='false';
  env.VITE_APP_CHECK_SITE_KEY='PASTE_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY';
  assert.match(checkConfig(env,hosting).join('\n'),/App Check/);
});
test('xAI provider must remain existing Railway-only and signed',()=>{
  const env=fixture();
  env.VITE_REFLECT_RAILWAY_AI_ORIGIN='https://untrusted.example.com';
  env.VITE_ENABLE_REFLECT_CLOUD_AI='true';
  env.VITE_ENABLE_REFLECT_RAILWAY_PRECHECK='true';
  const failures=checkConfig(env,hosting).join('\n');
  assert.match(failures,/Railway AI origin/);
  assert.match(failures,/Firebase callable AI/);
  assert.match(failures,/one-shot precheck/);
});
test('private Context Preview and Gate 5 QA remain OFF',()=>{
  const env=fixture();
  env.VITE_ENABLE_REFLECT_CONTEXT_PREVIEW='true';
  env.VITE_ENABLE_REFLECT_PREVIEW_GATE5_QA='true';
  const failures=checkConfig(env,hosting).join('\n');
  assert.match(failures,/Private history Preview/);
  assert.match(failures,/Gate 5 signed replay QA/);
});
test('a Vite-prefixed server secret marker is rejected',()=>{
  const env=fixture();env.VITE_REFLECT_XAI_KEY='private-secret';
  assert.match(checkConfig(env,hosting).join('\n'),/Secret-named VITE_/);
});
test('missing SHA is always a hard release stop',()=>{
  assert.throws(()=>checkGit(''),/exact verified release commit/);
});
test('no firebase config, malformed config and no public key fail closed',()=>{
  const missing=fixture();delete missing.VITE_FIREBASE_CONFIG;
  assert.notEqual(checkConfig(missing,hosting).length,0);
  const bad=fixture();bad.VITE_FIREBASE_CONFIG='{';
  assert.match(checkConfig(bad,hosting).join('\n'),/valid public Firebase JSON/);
  const placeholder=fixture();const config=JSON.parse(placeholder.VITE_FIREBASE_CONFIG);
  config.apiKey='FIREBASE_PUBLIC_WEB_API_KEY';
  placeholder.VITE_FIREBASE_CONFIG=JSON.stringify(config);
  assert.match(checkConfig(placeholder,hosting).join('\n'),/must be configured locally/);
});
