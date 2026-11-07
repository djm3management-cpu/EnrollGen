import {RULE_CATALOG,RULES_VERSION} from '../../src/compliance/rules/catalog.js';
import {ruleHasScriptBasis} from '../../src/compliance/rules/scriptBasis.js';
import {readFile,writeFile} from 'node:fs/promises';
if(RULES_VERSION!=='cy2027-overhaul-draft-2')throw Error('Use cms-only-report.mjs --dry-run for the current inventory.');
const rows=JSON.parse(await readFile('docs/compliance-overhaul/rubric-inventory.json','utf8'));
const mapping=JSON.parse(await readFile('docs/compliance-overhaul/script-mapping.json','utf8'));
const escape=x=>String(x??'Not stored').replaceAll('|','/').replaceAll('\n',' ');
const legal=r=>{
 if(/TPMO/.test(r.id))return 'CY2027 §422.2267(e)(41); complete text and timing. Component items overlap full disclaimer.';
 if(/^SOA_/.test(r.id))return 'CY2027 §§422.2264(c)(3), 422.2274; agreement required, no 48-hour wait. Date/reference checks are not separate blanket mandates.';
 if(r.id==='ELIG_010_ESRD_STATUS_CHECK')return 'Retire as blanket MA eligibility check; distinguish conditional SNP clinical qualification.';
 if(r.id==='CONDUCT_013_NO_COMPARISON_BY_NAME')return 'No blanket carrier-name comparison prohibition established; retire standalone ban.';
 if(r.id==='ENROLL_008_CMS_REVIEW_PERIOD')return 'No blanket spoken CMS review-period requirement established; retired by approved decision; retained only in historical definitions.';
 if(/ANNUITY/i.test(r.category))return 'Annuity/state suitability requirements; CMS CY2027 MA marketing rules do not establish this requirement.';
 if(/RECORD_00[1234]/.test(r.id))return 'Recording/quality facts require recording or capture metadata; transcript-only judgment cannot prove them.';
 if(/CONSENT|RECORDING_DECLINE/.test(r.id))return 'Consent/state law and agency policy must be distinguished from a universal CMS spoken-text mandate.';
 if(/NEEDS_|CONDUCT_006|CONDUCT_007|CONDUCT_008|PLAN_029/.test(r.id))return 'Agency quality item; no standalone universal CY2027 spoken wording requirement verified.';
 return 'CMS/carrier/script applicability needs rule-specific sign-off; source citation is inherited, not certified by this inventory.';
};
const kept=RULE_CATALOG.filter(r=>r.bucket!=='RETIRE');
const header=`# Full rubric inventory

Rules ${RULES_VERSION}: ${kept.length} kept definitions (${kept.filter(r=>r.bucket==='DETERMINISTIC').length} deterministic, ${kept.filter(r=>r.bucket==='JUDGMENT').length} judgment), ${RULE_CATALOG.length-kept.length} excluded. ${kept.filter(r=>ruleHasScriptBasis(r.id,'MA')).length} are supported on MA. The production snapshot still has its original 138-item active MA template; migration 141 proposes 135 and migration 142 proposes the script-backed successor. Neither was applied.

[Exact kept/removed lists and script statements](script-backed-rules.md) are the current grading authority. Candidate keyword matches below are historical research context, not authorization to grade a rule. Counts are original stored item outcomes since October 1, not newly scored outcomes. No new legal mandate is inferred from a generic intent citation.

`;
const lines=[header,'| Rule / DB intent ID | Category / check | Points | Bucket / decision | AUTO-FAIL old / new | Product / direction | N/A / pass / partial / fail | Script candidates | CY2027 review |','|---|---|---|---|---|---|---|---|---|'];
for(const r of rows){const m=mapping.find(m=>m.id===r.id);lines.push(`| ${escape(r.id)} / ${escape(r.database_intent_id)} | ${escape(r.category)}: ${escape(r.description)} | ${r.points.length?r.points.join(','):'No active item'} | ${r.bucket} / ${r.decision} | ${!!r.source_auto_fail} / ${!!r.effective_auto_fail} | ${escape(r.product)} / ${escape(r.direction)} | ${(r.counts.na||0)+(r.counts.not_applicable||0)} / ${r.counts.pass||0} / ${r.counts.partial||0} / ${r.counts.fail||0} | ${m?.matches.length||0} candidate source lines | ${legal(r)} |`);}
await writeFile('docs/compliance-overhaul/rubric-inventory.md',lines.join('\n')+'\n');
const buckets=rows.reduce((a,r)=>{(a[r.bucket]??=[]).push(r.id);return a;},{});
await writeFile('docs/compliance-overhaul/rule-buckets.md',`# Rule buckets, ${RULES_VERSION}

${kept.length} kept rules, ${RULE_CATALOG.length-kept.length} excluded. Product-specific script bases and stages are in [script-backed-rules.md](script-backed-rules.md). Historical scorecards are unchanged.

`+Object.entries(buckets).map(([bucket,ids])=>`## ${bucket} (${ids.length})

`+ids.map(id=>`- ${id}`).join('\n')).join('\n\n')+'\n');
console.log(JSON.stringify({rules:rows.length,buckets:Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length]))}));
