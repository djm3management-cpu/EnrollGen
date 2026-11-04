import test from 'node:test';
import assert from 'node:assert/strict';
import {extractResidence,resolveResidence,spokenZips,spokenState} from '../src/paragonResidenceExtraction.js';
const segment=(speaker,text,n)=>({id:String(n),speaker,text,captured_at:new Date(1800000000000+n*1000).toISOString()});
const question=segment('agent','May I have your ZIP code, county and state?',0);
const rows=[{zip:'07001',state_code:'NJ',county_fips:'34023',county_name:'Middlesex'},{zip:'33101',state_code:'FL',county_fips:'12086',county_name:'Miami-Dade'}];
test('customer answer supplies a single validated ZIP/state/county; agent echo and third party do not',()=>{
 const result=extractResidence([question,segment('customer','07001, Middlesex County, New Jersey.',2),segment('agent','So 33101?',3),segment('third_party','33101',4)]);
 assert.equal(result.candidates.length,1);const resolved=resolveResidence(result.candidates[0],rows);assert.equal(resolved.zip,'07001');assert.equal(resolved.state,'NJ');assert.equal(resolved.county,'Middlesex');
});
test('corrections retain chronological candidates and the last clearly stated ZIP',()=>{
 const result=extractResidence([question,segment('customer','My ZIP is 33101. Actually, sorry, 07001 in New Jersey.',2)]);
 assert.deepEqual(result.candidates.map(c=>c.zip),['33101','07001']);assert.equal(result.candidates.at(-1).clear,true);
 assert.equal(spokenState('Florida, sorry New Jersey'),'NJ');
});
test('no ZIP, invalid length, masked phone/MBI, and unrelated numbers are never invented as residence',()=>{
 for(const text of ['I do not know.','1234','123456','[PHONE_REDACTED]','my Medicare number is 07001'])assert.equal(extractResidence([question,segment('customer',text,2)]).candidates.length,0,text);
 assert.equal(resolveResidence({zip:'00000'},rows),null);
 assert.equal(extractResidence([segment('customer','Invoice number 07001',2)]).candidates.length,0);
});
test('spoken digits and split transcript finals are joined; uncertain alternatives are marked unclear',()=>{
 assert.deepEqual(spokenZips('zero seven zero zero one'),['07001']);
 const parsed=extractResidence([question,segment('customer','zero seven',2),segment('customer','zero zero one, New Jersey',3)]);assert.equal(parsed.candidates[0].zip,'07001');
 const uncertain=extractResidence([question,segment('customer','Maybe 07001 or 33101, not sure.',2)]);assert.ok(uncertain.candidates.every(c=>!c.clear));
});
test('cross-state ZIP requires a spoken state or unambiguous county; no state-only fallback',()=>{
 const cross=[{zip:'12345',state_code:'NY',county_name:'One',county_fips:'36001'},{zip:'12345',state_code:'NJ',county_name:'Two',county_fips:'34001'}];
 assert.equal(resolveResidence({zip:'12345'},cross),null);assert.equal(resolveResidence({zip:'12345',state:'NJ'},cross).state,'NJ');assert.equal(resolveResidence({zip:'12345',county_text:'Two County'},cross).state,'NJ');assert.equal(resolveResidence({state:'NJ'},cross),null);
});
test('a later unrelated five-digit number cannot replace the first answer; an explicit correction can',()=>{
 const parsed=extractResidence([question,segment('customer','07001 New Jersey',2),segment('agent','What medicine do you take?',20),segment('customer','Order number 33101',22)]);
 assert.deepEqual(parsed.candidates.map(c=>c.zip),['07001']);
 const corrected=extractResidence([segment('customer','Actually it is 33101 Florida',30)],{source:'transcript',question_at:question.captured_at,answer_at:segment('customer','',2).captured_at});
 assert.equal(corrected.candidates[0].zip,'33101');
 assert.equal(resolveResidence({zip:'07001',state:'FL'},rows).ambiguous,true);
});
