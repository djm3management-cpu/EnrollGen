import {readFile,writeFile} from 'node:fs/promises';
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
const header=`# Full rubric inventory\n\nDraft inventory, not a certified legal rubric. Source: 162 current intents (138 Medicare, 24 annuity); production snapshot template: 138 MA items; unapplied migration 140 creates a 135-item successor. Active source: 159 intents (84 deterministic, 75 judgment), with 3 retired definitions retained for history. The requested 167/143 counts do not match current source. The database retains 148 intent rows, including historical entries.\n\nCounts below include every stored item on scorecards created since October 1, including previous scorecard versions. A blank/zero count means no matching stored observation; it is not a new pass or failure. Annuity items have no active MA template points.\n\nCMS reference: [CMS-4212-F published rule](https://www.govinfo.gov/content/pkg/FR-2026-04-06/html/2026-06600.htm). No current standalone 2027 MCMG edition was established during this task; the per-rule legal check remains incomplete.\n\n`;
const lines=[header,'| Rule / DB intent ID | Category / check | Points | Bucket / decision | AUTO-FAIL old / new | Product / direction | N/A / pass / partial / fail | Script candidates | CY2027 review |','|---|---|---|---|---|---|---|---|---|'];
for(const r of rows){const m=mapping.find(m=>m.id===r.id);lines.push(`| ${escape(r.id)} / ${escape(r.database_intent_id)} | ${escape(r.category)}: ${escape(r.description)} | ${r.points.length?r.points.join(','):'No active item'} | ${r.bucket} / ${r.decision} | ${!!r.source_auto_fail} / ${!!r.effective_auto_fail} | ${escape(r.product)} / ${escape(r.direction)} | ${(r.counts.na||0)+(r.counts.not_applicable||0)} / ${r.counts.pass||0} / ${r.counts.partial||0} / ${r.counts.fail||0} | ${m?.matches.length||0} candidate source lines | ${legal(r)} |`);}
await writeFile('docs/compliance-overhaul/rubric-inventory.md',lines.join('\n')+'\n');
const buckets=rows.reduce((a,r)=>{(a[r.bucket]??=[]).push(r.id);return a;},{});
await writeFile('docs/compliance-overhaul/rule-buckets.md','# Rule buckets, cy2027-overhaul-draft-2\n\n159 active rules: 84 deterministic and 75 judgment. Three approved retirements are retained below for historical lookup only. Production snapshot: 138 MA template items; unapplied migration 140 creates 135 future items.\n\n'+Object.entries(buckets).map(([bucket,ids])=>`## ${bucket} (${ids.length})\n\n`+ids.map(id=>`- ${id}`).join('\n')).join('\n\n')+'\n');
console.log(JSON.stringify({rules:rows.length,buckets:Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length]))}));
