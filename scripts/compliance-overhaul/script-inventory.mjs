import {writeFile} from 'node:fs/promises';
import {MA_SCRIPT_SECTIONS,MA_CSNP_DISCLOSURE,MA_DSNP_DISCLOSURE,MA_PART_B_REDUCTION} from '../../src/data/maScript2027.js';
import {MEDSUP_SECTIONS} from '../../src/context/MedSupScript.js';
import {ACA_GATES} from '../../src/flows/aca/ACAData.js';
import {U65_GATES,U65_SMALL_BUSINESS_GATES,U65_OPENER_VARIANTS} from '../../src/flows/u65/U65Data.js';
import {RULE_CATALOG} from '../../src/compliance/rules/catalog.js';
const statements=[];
function walk(value,product,path){
 if(typeof value==='string'){
  if(!value.trim())return;
  const matches=RULE_CATALOG.filter(r=>r.pattern?.test(value)).map(r=>r.id);
  statements.push({product,path,text:value,candidate_rules:matches,status:matches.length?'CANDIDATE_MATCH':'UNMAPPED',legal_status:'Script statement, not independently established CMS mandate'});return;
 }
 if(Array.isArray(value))value.forEach((x,i)=>walk(x,product,`${path}[${i}]`));
 else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))if(!['id','key','type','gate','value','title','label','outcome','image','icon'].includes(k))walk(v,product,`${path}.${k}`);
}
walk(MA_SCRIPT_SECTIONS,'MA','MA_SCRIPT_SECTIONS');walk({MA_CSNP_DISCLOSURE,MA_DSNP_DISCLOSURE,MA_PART_B_REDUCTION},'MA','conditional');walk(MEDSUP_SECTIONS,'MEDSUP','MEDSUP_SECTIONS');walk(ACA_GATES,'ACA','ACA_GATES');walk([U65_GATES,U65_SMALL_BUSINESS_GATES,U65_OPENER_VARIANTS],'U65','U65');
await writeFile('docs/compliance-overhaul/script-statements.json',JSON.stringify(statements,null,2),{mode:0o600});
console.log(JSON.stringify({mode:'OFFLINE',statements:statements.length,unmapped:statements.filter(s=>!s.candidate_rules.length).length,products:[...new Set(statements.map(s=>s.product))]}));
