const words=text=>new Set(String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w.length>2&&!['the','and','you','for','with','that','this','then','their','please'].includes(w)));
const overlap=(a,b)=>{let n=0;for(const w of a)if(b.has(w))n++;return n/Math.max(1,Math.min(a.size,b.size));};
export function suggestionTopic(text,tag='') {
  if(/inhaler|nebulizer|formulary|medication|drug name|dosage/i.test(text))return 'medication_verification';
  if(/provider|doctor|network/i.test(text))return 'provider_network';
  if(/pharmacy|prescription|drug|dose/i.test(text))return 'medication_verification';
  return (/^(next_step|help|tip|info|guidance|coaching|live_help)$/.test(tag)?'':tag) || [...words(text)].sort().slice(0,5).join('_');
}
export function createSuggestionDedupe({now=Date.now,cooldownMs=180000}={}) {
  let history=[];
  return {clear(){history=[];},accept(text,{issueTag='',transcript=''}={}) {
    const at=now(),tokens=words(text),topic=suggestionTopic(text,issueTag),speech=words(transcript);
    for(const prev of history.slice(-12)) {
      const similarity=overlap(tokens,prev.tokens);
      // A new medication/dose or a resolved question can justify an updated tip.
      const delta=[...speech].filter(w=>!prev.speech.has(w));
      const relevant=delta.filter(w=>tokens.has(w)||/\d/.test(w));
      const newEvidence=relevant.length>=2;
      if((similarity>=0.8 || (topic===prev.topic&&at-prev.at<cooldownMs))&&!newEvidence)return false;
    }
    history=[...history.slice(-19),{at,tokens,topic,speech}];return true;
  }};
}
