#!/usr/bin/env node
'use strict';
/**
 * Guard for Reflect's OWNER-RUN Firebase Hosting staging release.
 * Inspects config only. Never deploys, reads secrets into logs, or contacts AI.
 */
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const PROJECT='reflect-ai-staging';
const SITE='reflect-ai-staging';
const APP='1:599679789981:web:d4d8743dbff0fe40af1d74';
const RAILWAY='https://reflect-ai-api-staging.up.railway.app';
const NAMESPACE='reflect-8fdc8';
function readEnvFile(name){
  const filename=path.join(ROOT,name);
  if(!fs.existsSync(filename))return {};
  const out={};
  for(const line of fs.readFileSync(filename,'utf8').split(/\r?\n/)){
    if(!line||/^\s*#/.test(line))continue;
    const m=line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if(!m)continue;
    let value=m[2].trim();
    if((value.startsWith("'")&&value.endsWith("'")) ||
       (value.startsWith('"')&&value.endsWith('"'))){
      value=value.slice(1,-1);
    }else value=value.split(/\s+#/)[0].trim();
    out[m[1]]=value;
  }
  return out;
}
function loadEffectiveEnv(){
  // Vite's dotenv order for --mode staging; inherited shell vars win.
  return {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.local'),
    ...readEnvFile('.env.staging'),
    ...readEnvFile('.env.staging.local'),
    ...process.env
  };
}
const fail=message=>{throw new Error(message);};
const assert=(condition,message)=>{if(!condition)fail(message);};
function checkConfig(env,config){
  const errors=[];
  const push=(condition,message)=>{if(!condition)errors.push(message);};
  push(config&&typeof config==='object'&&config.hosting?.site===SITE,
    'Hosting target must be the isolated reflect-ai-staging site.');
  push(config?.hosting?.public==='dist','Only dist can be published as Hosting public.');
  push(!Object.hasOwn(config||{},'firestore')&&!Object.hasOwn(config||{},'functions')&&
    !Object.hasOwn(config||{},'storage'),
    'Hosting config must not contain Firestore/Functions/Storage deployment targets.');
  let firebase=null;
  try{firebase=JSON.parse(env.VITE_FIREBASE_CONFIG||'');}
  catch{errors.push('VITE_FIREBASE_CONFIG must be valid public Firebase JSON.');}
  push(firebase?.projectId===PROJECT,'Public Firebase project must be reflect-ai-staging.');
  push(firebase?.appId===APP,'Public Firebase appId differs from the isolated staging app.');
  push(firebase?.authDomain==='reflect-ai-staging.firebaseapp.com',
    'Auth domain is not the isolated staging Auth project.');
  push(firebase?.messagingSenderId==='599679789981',
    'Public messaging sender is not the isolated staging project.');
  push(typeof firebase?.apiKey==='string'&&firebase.apiKey.length>=15 &&
    !/FIREBASE_PUBLIC|PASTE|YOUR_|CHANGE_ME/i.test(firebase.apiKey),
    'Public Firebase Web apiKey must be configured locally (not printed).');
  push(env.VITE_APP_ID===NAMESPACE,'Firestore namespace must be reflect-8fdc8.');
  push(env.VITE_AI_STAGING_PROJECT_ID===PROJECT,
    'VITE_AI_STAGING_PROJECT_ID must be reflect-ai-staging.');
  push(env.VITE_USE_FIREBASE_EMULATORS==='false',
    'Do not build the Hosting release with Firebase emulators enabled.');
  push(env.VITE_ENABLE_STAGING_APP_CHECK==='true',
    'Staging App Check must be enabled.');
  push(typeof env.VITE_APP_CHECK_SITE_KEY==='string' &&
    env.VITE_APP_CHECK_SITE_KEY.length>15 &&
    !/PASTE|YOUR_|CHANGE_ME/i.test(env.VITE_APP_CHECK_SITE_KEY),
    'A configured public Enterprise App Check site key is required.');
  push(env.VITE_ENABLE_REFLECT_CLOUD_AI==='false',
    'Firebase callable AI must remain OFF: Railway is the signed staging provider.');
  push(env.VITE_ENABLE_REFLECT_RAILWAY_AI==='true',
    'Keep the existing signed Railway AI client ON for compatibility testing.');
  push(env.VITE_ENABLE_REFLECT_RAILWAY_PRECHECK==='false',
    'Do not mix normal AI transport and one-shot precheck mode.');
  push(env.VITE_REFLECT_RAILWAY_AI_ORIGIN===RAILWAY,
    'The Railway AI origin must equal the approved staging domain.');
  push(env.VITE_ENABLE_REFLECT_CONTEXT_PREVIEW==='false',
    'Private history Preview must remain OFF in this release.');
  push(env.VITE_ENABLE_REFLECT_PREVIEW_GATE5_QA==='false',
    'Gate 5 signed replay QA must remain OFF in the general product build.');
  // Consent management UI is independent of provider history transfer.
  push(['true','false'].includes(env.VITE_ENABLE_REFLECT_CONTEXT_CONSENT),
    'Set the existing context-consent UI flag explicitly true/false.');
  for(const key of Object.keys(env).filter(k=>k.startsWith('VITE_'))){
    if(/(SECRET|PRIVATE|SERVICE_ACCOUNT|XAI_KEY|ADMIN_TOKEN|PASSWORD)/i.test(key)){
      errors.push('Secret-named VITE_ variable detected: remove before building.');
    }
  }
  return errors;
}
function checkGit(expected){
  assert(/^[a-f0-9]{40}$/i.test(expected||''),
    'Provide REFLECT_STAGING_EXPECTED_SHA = the exact verified release commit.');
  const git=(...args)=>cp.execFileSync('git',args,{
    cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']
  }).trim();
  const actual=git('rev-parse','HEAD');
  assert(actual===expected,
    'Local checkout does not equal the exact approved release SHA. STOP.');
  assert(git('status','--porcelain')==='',
    'Worktree is dirty. STOP and inspect; do not reset/delete unrelated changes.');
  assert(git('check-ignore','.env.staging.local')==='.env.staging.local',
    'Local Firebase Web configuration file must be Git-ignored.');
  return actual;
}
function checkBundle(){
  const dist=path.join(ROOT,'dist');
  assert(fs.existsSync(path.join(dist,'index.html')),
    'No built dist/index.html. Run npm run build -- --mode staging first.');
  const jsDir=path.join(dist,'assets');
  assert(fs.existsSync(jsDir),'Missing Vite assets directory.');
  const js=fs.readdirSync(jsDir).filter(name=>name.endsWith('.js'));
  assert(js.length>0,'Missing JS application bundle.');
  const strings=js.map(file=>fs.readFileSync(path.join(jsDir,file),'utf8'));
  const all=strings.join('\n');
  assert(all.includes(PROJECT),'Built JS does not contain the staging Firebase project.');
  assert(all.includes(RAILWAY),'Built JS lacks the approved Railway AI endpoint.');
  assert(!/BEGIN (?:RSA )?PRIVATE KEY/.test(all) &&
    !/REFLECT_FIREBASE_SERVICE_ACCOUNT_JSON/.test(all) &&
    !/REFLECT_XAI_KEY/.test(all),
    'Private credential marker detected in public bundle. STOP.');
  assert(!/["']projectId["']\s*:\s*["']reflect-8fdc8["']/.test(all) &&
    !all.includes('reflect-8fdc8.firebaseapp.com'),
    'Production Firebase configuration marker detected in bundle. STOP.');
  // Prints only safe metadata, not Firebase config, App Check or credentials.
  return {assets:js.length,jsBytes:strings.reduce((n,s)=>n+Buffer.byteLength(s),0),
    bundleDigest:crypto.createHash('sha256').update(all).digest('hex').slice(0,16)};
}
function main(args=process.argv.slice(2)){
  const env=loadEffectiveEnv();
  const config=JSON.parse(fs.readFileSync(path.join(ROOT,'firebase.staging.json'),'utf8'));
  const errors=checkConfig(env,config);
  if(errors.length)fail('STOP: Staging guard rejected configuration:\n'+
    errors.map(e=>' - '+e).join('\n'));
  const actual=checkGit(env.REFLECT_STAGING_EXPECTED_SHA);
  const summary=args.includes('--post-build')?checkBundle():null;
  const site='https://reflect-ai-staging.web.app';
  process.stdout.write(
    '[STAGING GUARD PASS] Git HEAD '+actual+'\n'+
    'Project: '+PROJECT+' | Hosting: '+site+' | Railway origin allowlisted\n'+
    'App Check ON | context Preview OFF | Gate 5 QA OFF | no deployment performed\n'+
    (summary?'Bundle: '+summary.assets+' JS assets, '+
      summary.jsBytes+' bytes, SHA-256 prefix '+summary.bundleDigest+'\n':'')
  );
}
if(require.main===module){
  try{main();}catch(error){
    process.stderr.write('[STAGING GUARD FAIL] '+error.message+'\n');
    process.exitCode=1;
  }
}
module.exports={checkConfig,checkBundle,loadEffectiveEnv,checkGit,main};
