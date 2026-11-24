"use strict";
const SWEEP_PATH="_reflectAiPrivate/reflect-8fdc8/retentionScheduler/sweep";
function validateSweepClaim(claim){
  if(!claim||typeof claim.owner!=="string"||!/^[0-9a-f-]{36}$/.test(claim.owner)||
    !Number.isSafeInteger(claim.fence)||claim.fence<1) throw Error("invalid-sweep-claim");
  return Object.freeze({owner:claim.owner,fence:claim.fence});
}
async function requireSweep(tx,db,claim,clock){
  if(claim===null) return ()=>{};
  const snap=await tx.get(db.doc(SWEEP_PATH));
  const row=snap.exists?snap.data():null;
  const check=()=>{
    const time=clock();
    if(!Number.isSafeInteger(time)||time<0||row?.schemaVersion!==1||
      row.leaseOwner!==claim.owner||row.fence!==claim.fence||
      !Number.isSafeInteger(row.leaseUntilMs)||row.leaseUntilMs<=time)
      throw Error("stale-retention-sweep");
  };
  check();
  return check;
}
module.exports={SWEEP_PATH,validateSweepClaim,requireSweep};
