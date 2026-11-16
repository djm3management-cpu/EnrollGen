import {parseFeatureFlag} from '../../telephony/src/lib/featureFlags.js';
export const PRACTICE_DEFAULTS=Object.freeze({agent_daily:5,agency_daily:50,turns:60,minutes:30});
export const PRACTICE_BOUNDS=Object.freeze({agent_daily:[1,50],agency_daily:[1,500],turns:[1,120],minutes:[1,60]});
export const DIFFICULTIES=Object.freeze(['easy','standard','hard']);
// Application extension uses the shared parser; the phone service is untouched.
export function practiceFeatures(env={}){
 const enabled=parseFeatureFlag(env.PRACTICE_CALLER_ENABLED,'PRACTICE_CALLER_ENABLED');
 const voice=parseFeatureFlag(env.PRACTICE_VOICE_ENABLED,'PRACTICE_VOICE_ENABLED');
 return {PRACTICE_CALLER_ENABLED:enabled,PRACTICE_VOICE_ENABLED:enabled&&voice};
}
export function practiceSettings(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(PRACTICE_DEFAULTS,k)))throw Error('Invalid practice settings');
 const value={...PRACTICE_DEFAULTS,...input};
 for(const [key,[min,max]] of Object.entries(PRACTICE_BOUNDS))if(!Number.isInteger(value[key])||value[key]<min||value[key]>max)throw Error('Invalid practice settings');
 return value;
}
export const PRACTICE_TOKEN_LIMITS=Object.freeze({consumer:24000,scoring:180000,coaching:180000,session:1200000});
