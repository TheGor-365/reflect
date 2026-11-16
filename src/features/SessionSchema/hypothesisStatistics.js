/**
 * Read-only owner-rating statistics for the Journey panel.
 * Numbers mean "how similar the owner's assessment says an AI hypothesis
 * was to their experience"; NOT calibrated AI accuracy or truth.
 *
 * Input sessions MUST already come from owner-scoped Firestore subscription.
 * This module authorizes neither retrieval nor provider access to the data.
 */
const valid = x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const stampMs = raw=>{
  try {
    if(raw instanceof Date)return Number.isFinite(raw.getTime())?raw.getTime():null;
    if(typeof raw?.toMillis==="function")return raw.toMillis();
    if(Number.isFinite(raw?.seconds))return raw.seconds*1000;
  } catch {/* unknown timestamp */}
  return null;
};
export function summarizeOwnerHypothesisRatings(sessions=[],{
  sessionId="all", period="all", nowMs=Date.now()
}={}){
  const counts=[0,0,0,0,0];
  let reviewable=0, reviewed=0;
  if(!Array.isArray(sessions))return Object.freeze({counts,reviewable,reviewed,
    miss:0,partial:0,match:0});
  const days=period==="7d"?7:period==="30d"?30:null;
  for(const session of sessions){
    if(!valid(session?.id)||(sessionId!=="all"&&session.id!==sessionId))continue;
    const saved=Array.isArray(session.chatHistory)?session.chatHistory:[];
    const reviews=session.hypothesisReviews;
    for(const msg of saved){
      if(msg?.role!=="assistant"||!valid(msg.id)||
        !["reflect.interaction.v1","reflect.interaction.v2"].includes(
          msg.interaction?.version))continue;
      const hypotheses=Array.isArray(msg.interaction.insights)
        ? msg.interaction.insights.slice(0,2):[];
      for(let i=0;i<hypotheses.length;i++){
        if(typeof hypotheses[i]!=="string"||!hypotheses[i].trim())continue;
        const key="h-"+msg.id+"-"+i;
        const review=reviews&&typeof reviews==="object"&&!Array.isArray(reviews)
          ? reviews[key]:null;
        if(days){
          // Period refers to review time, not the time of the AI's hypothesis.
          // Undated ratings cannot be assigned to a time window.
          const at=stampMs(review?.reviewedAt);
          if(at===null||at>nowMs||at<nowMs-days*86400000)continue;
        }
        reviewable++;
        if(!Number.isInteger(review?.grade)||review.grade<0||review.grade>4||
           review.assistantMessageId!==msg.id||
           review.hypothesisIndex!==i)continue;
        counts[review.grade]++;
        reviewed++;
      }
    }
  }
  return Object.freeze({
    counts:Object.freeze(counts),
    reviewed,reviewable,
    miss:counts[0]+counts[1],partial:counts[2],
    match:counts[3]+counts[4]
  });
}
