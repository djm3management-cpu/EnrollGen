// Deterministic extraction from persisted, server-attributed customer speech.
// No provider/model call and no changes to the media or compliance pipeline.
const digits={zero:'0',oh:'0',o:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'};
const states='AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming'.split('|').map(s=>s.split(':'));
export function spokenState(text){
 const found=[];
 for(const [code,name] of states){const match=new RegExp('\\b'+name+'\\b','i').exec(text);if(match)found.push({code,index:match.index});}
 for(const [code] of states){const match=new RegExp('\\b'+code+'\\b').exec(text);if(match&&(!['IN','OR','ME','HI','OK'].includes(code)||new RegExp('state (?:of |is )?'+code).test(text)))found.push({code,index:match.index});}
 if(found.length)return found.sort((a,b)=>a.index-b.index).at(-1).code;
 return null;
}
export function spokenZips(text){
 const normalized=String(text).toLowerCase().replace(/\b(zero|oh|o|one|two|three|four|five|six|seven|eight|nine)\b/g,w=>digits[w]);
 const found=[];
 for(const match of normalized.matchAll(/(?<!\d)(?:\d[ -]?){4}\d(?![ -]?\d)/g)){
  const zip=match[0].replace(/\D/g,'');
  if(zip.length===5)found.push(zip);
 }
 return found;
}
export function extractResidence(segments,prior={}){
 const ordered=[...segments].sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at)||String(a.id).localeCompare(String(b.id)));
 const turns=[];
 for(const s of ordered){
  const prev=turns.at(-1);
  if(prev&&prev.speaker===s.speaker&&Date.parse(s.captured_at)-Date.parse(prev.at)<15000){prev.text+=' '+s.text;prev.at=s.captured_at;prev.id=s.id;}
  else turns.push({speaker:s.speaker,text:s.text,at:s.captured_at,id:s.id});
 }
 let questionAt=prior.question_at||null,answerAt=prior.answer_at||null;const candidates=[];
 for(const turn of turns){
  if(turn.speaker==='agent'){
   if(/\b(zip|postal)\b/i.test(turn.text)&&/\b(county|state|where.*live|residen)\b/i.test(turn.text)){if(questionAt!==turn.at)answerAt=null;questionAt=turn.at;}
   continue;
  }
  if(turn.speaker!=='customer')continue;
  const inAnswer=(!answerAt||Date.parse(turn.at)<=Date.parse(answerAt))&&questionAt&&Date.parse(turn.at)>=Date.parse(questionAt)&&Date.parse(turn.at)-Date.parse(questionAt)<=90000;
  const explicit=/\b(my|our|home|residen\w*)\b.{0,35}\b(zip|postal)\b|\b(zip|postal)\b.{0,30}\b(is|actually|sorry|correction)\b/i.test(turn.text);
  const correction=(prior.source==='transcript'||candidates.length>0)&&/\b(actually|correction|sorry|i meant|no[,]? it'?s)\b/i.test(turn.text);
  if(!inAnswer&&!explicit&&!correction)continue;
  if(/\b(phone|member|medicare|policy|social security|date of birth)\b/i.test(turn.text)&&!explicit)continue;
  const zips=spokenZips(turn.text),unclear=/\b(not sure|maybe|either|or|i think)\b/i.test(turn.text);
  if(zips.length&&inAnswer)answerAt=turn.at;
  for(const zip of zips)candidates.push({zip,state:spokenState(turn.text),county_text:turn.text,observed_at:turn.at,segment_id:turn.id,clear:!unclear});
 }
 return {candidates,question_at:questionAt,answer_at:answerAt};
}
export function resolveResidence(candidate,rows){
 let matches=rows.filter(r=>r.zip===candidate.zip);
 let stateConflict=false;
 if(candidate.state){
  const stated=matches.filter(r=>r.state_code===candidate.state);
  if(stated.length)matches=stated;
  else if(new Set(matches.map(r=>r.state_code)).size===1)stateConflict=true;
  else return null;
 }
 if(candidate.county_fips)matches=matches.filter(r=>r.county_fips===candidate.county_fips);
 if(candidate.county_text){
  const text=candidate.county_text.toLowerCase();
  const named=matches.filter(r=>r.county_name&&text.includes(r.county_name.toLowerCase().replace(/ county$/,'')));
  if(named.length)matches=named;
 }
 const codes=[...new Set(matches.map(r=>r.state_code))];
 if(codes.length!==1)return null;
 const counties=[...new Set(matches.map(r=>r.county_name).filter(Boolean))];
 return {zip:candidate.zip,state:codes[0],county:counties.length===1?counties[0]:null,ambiguous:stateConflict,observed_at:candidate.observed_at,segment_id:candidate.segment_id||null};
}
