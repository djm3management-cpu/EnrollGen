import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/data/u65PlanCatalog.json'), 'utf8'));
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const cell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
const fields = [['Plan type','planType'],['Network','network'],['Deductible','deductible'],['Stated OOP','oop'],['Member coinsurance','coinsurance'],['Hospital limits','hospital'],['Office limits','office'],['Other limits','limits'],['Benefit maximum','benefitMaximum'],['Rx','rx'],['Maternity','maternity'],['Waiting periods','waitingPeriods'],['Gap benefit','gap'],['ACA/MEC status','acaMecStatus'],['Underwriting lookbacks','underwritingLookbacks']];

// Preserve the existing playbook stylesheet byte-for-byte.
const file = path.join(root, 'public/private-plan-playbook.html');
const old = fs.readFileSync(file, 'utf8');
const head = old.slice(0, old.indexOf('<body'));
const pages = ['<body><div id="deck">'];
pages.push('<section class="slide slide-content active"><div class="slide-header"><h2>U65 Product Guidance</h2></div><div class="split-right" style="display:block"><h2>DE · MD · FL agents</h2><p class="body-text">Higher earners priced out of unsubsidized ACA. Enroll Prime is the CURRENT agent portal. Select a coverage group, then review a plan. Never compare premiums across groups.</p>');
for (const group of catalog.coverageGroups) {
  pages.push(`<h3 class="subhead">${escape(group)}</h3>`);
  catalog.plans.forEach((plan, index) => {
    if (plan.group === group) pages.push(`<p class="body-text"><a href="#plan-${plan.id}" data-plan="${index + 1}">${escape(plan.name)}</a></p>`);
  });
}
pages.push('</div></section>');
for (const plan of catalog.plans) {
  pages.push(`<section id="plan-${plan.id}" class="slide slide-content"><div class="slide-header"><h2>${escape(plan.name)}</h2><a class="slide-header-badge" href="#" data-plan="0">All plans</a></div><div class="split-right" style="display:block"><h3 class="subhead">${escape(plan.group)}</h3><table class="cmp-table"><tbody>`);
  for (const [label, key] of fields) pages.push(`<tr><th>${label}</th><td>${escape(plan[key])}</td></tr>`);
  pages.push('</tbody></table><h3 class="subhead">Required agent statements</h3><ul>');
  pages.push(...plan.requiredStatements.map((line) => `<li class="body-text">${escape(line)}</li>`));
  pages.push(`</ul><p class="body-text">Workbook source: ${escape(plan.source)}. Effective-date documents: verify with carrier.</p></div></section>`);
}
pages.push(`</div><script>
const slides = [...document.querySelectorAll('.slide')];
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-plan]');
  if (!link) return;
  event.preventDefault();
  slides.forEach((slide, index) => slide.classList.toggle('active', index === Number(link.dataset.plan)));
  location.hash = link.getAttribute('href');
});
function openHash() {
  const match = slides.findIndex((slide) => slide.id && '#' + slide.id === location.hash);
  slides.forEach((slide, index) => slide.classList.toggle('active', index === Math.max(0, match)));
}
window.addEventListener('hashchange', openHash);
openHash();
</script></body></html>`);
fs.writeFileSync(file, head.trimEnd() + '\n' + pages.join('\n') + '\n');

const table = ['# F57 Step 2 — per-product guidance', '', 'All 59 variants in the primary workbook. Coverage groups describe benefit structure, not ACA/MEC certification. Enroll Prime is the current agent portal. DE, MD, FL agents; higher earners priced out of unsubsidized ACA. No cross-group premium comparison or personalized premium quote is presented.', '', 'The source folder contains the workbook and Word document. `U65_Plan_Map.pdf` is missing. Explicit map warnings from the user are retained; the Word document independently supports the First Health/PHCS and Bronze/Silver reference-pricing cautions. The Elite Plus reference-pricing warning also follows the explicit instruction.', '', 'Unknown facts: **verify with carrier**. Conflicting/provisional facts: **confirm with carrier**. ACA/MEC status and underwriting lookbacks are verification fields for every variant. HSA labels do not determine personal contribution eligibility.', '', 'Source file SHA-256:', ''];
for (const source of catalog.sourceFiles) table.push(`- ${source.name}: \`${source.sha256}\``);
for (const group of catalog.coverageGroups) {
  table.push('', `## ${group}`, '', '| Plan | Type / network | Deductible | Stated OOP | Hospital / office / other limits | Rx | Maternity | Waiting periods | Required agent statements | Source |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const plan of catalog.plans.filter((item) => item.group === group)) {
    const values = [plan.name, `${plan.planType}<br>${plan.network}`, plan.deductible, plan.oop, `${plan.hospital}<br>${plan.office}<br>${plan.limits}<br>Maximum: ${plan.benefitMaximum}`, plan.rx, plan.maternity, plan.waitingPeriods, plan.requiredStatements.join('<br>'), `${plan.source}<br>${plan.sourceCells['Source and pages']}`];
    table.push('| ' + values.map(cell).join(' | ') + ' |');
  }
}
table.push('', '## Provenance', '', 'All cell addresses and the complete workbook Sources register are in `src/data/u65PlanCatalog.json`. Source IDs refer to the supplied workbook register, not independently fetched documents. No web facts were added. General opinions and illustrative comparisons were removed. Vault disputed schedule amounts are withheld; cancer exclusions and financial-risk warnings remain. Explicit same-as limit references for AFI and DVP are expanded from the referenced workbook variant.', '');
fs.writeFileSync(path.join(root, 'docs/f57-u65-step2-products.md'), table.join('\n'));
