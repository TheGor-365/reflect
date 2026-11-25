"use strict";
// Any existing fence blocks normal owner operations, including malformed
// markers. Read in the same transaction as the protected write.
// No marker creation, deletion, route registration or activation.
const ROOT="_reflectAiPrivate/reflect-8fdc8/accountRevocations";
const ID=/^[A-Za-z0-9_-]{1,128}$/;
function createAccountRevocationFence({db,projectId,locallyEnabled=false}={}){
 if(typeof locallyEnabled!=="boolean")throw Error("unsafe-account-fence");
 if(!locallyEnabled)return null;
 if(projectId!=="reflect-ai-staging"||db?.projectId!==projectId||typeof db.doc!=="function")
   throw Error("unsafe-account-fence");
 async function requireActive(tx,uid){
   if(typeof uid!=="string"||!ID.test(uid)||typeof tx?.get!=="function")
     throw Error("invalid-account-fence-scope");
   let exists;
   try{const snap=await tx.get(db.doc(ROOT+"/"+uid));exists=snap?.exists;}
   catch{throw Error("account-fence-unavailable");}
   if(exists===true)throw Error("account-revoked");
   if(exists!==false)throw Error("account-fence-unavailable");
 }
 return Object.freeze({requireActive});
}
module.exports={createAccountRevocationFence,ROOT};
