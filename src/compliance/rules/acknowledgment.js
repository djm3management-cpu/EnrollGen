// PECL response policy is implemented independently of the allowlist. No PECL
// rule becomes gradeable until an exact local script basis has been approved.
const affirmative=/\b(?:yes|yeah|yep|correct|right|i (?:agree|consent|understand|do)|okay|ok|sure|absolutely|uh[ -]?huh|mm[ -]?hmm)\b/i;
const refusal=/\b(?:no|nope|not|don't|do not|disagree|unsure|refuse|decline|can't|cannot)\b/i;
export function acknowledgmentAfter(statement,lines,{pecl=false,overlapMs=500}={}){
 const end=statement.end_ms??statement.start_ms;
 const responses=lines.filter(l=>l.speaker==='customer'&&l.text?.trim()&&l.start_ms>=Math.max(statement.start_ms,end-overlapMs)&&l.end_ms>=end-overlapMs);
 const first=responses[0];
 const deadline=pecl?Math.max(end+30000,first?.start_ms??end+30000):end+20000;
 for(const reply of responses){
  if(reply.start_ms>deadline)break;
  if(refusal.test(reply.text.replace(/\bno (?:problem|worries)\b/ig,'')))return null;
  if(affirmative.test(reply.text))return reply;
  // Non-PECL consent is strict: don't skip an intervening customer response.
  if(!pecl)return null;
 }
 return null;
}
export function beforeSubmission(statement,submission){return submission?statement.end_ms<=submission.start_ms:null;}
