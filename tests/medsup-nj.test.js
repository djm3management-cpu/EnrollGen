import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stateGIRules, resolveMedSupStateGIRules } from '../src/data/medicareReference2026.js';
import { engineBuilders, promptOptions } from './helpers/copilotPrompts.js';
import { buildCachedPrompt } from '../src/lib/llm/prompts.js';

test('legacy DB NJ blanket GI cannot override the reviewed branches; other states are preserved', () => {
  const database = { NJ: { continuousOE: true, note: 'NJ guarantees open enrollment year-round. No medical underwriting.' },
    CT: { note: 'tenant-specific CT reference' } };
  const before = structuredClone(database);
  const resolved = resolveMedSupStateGIRules(database);
  assert.equal(resolved.NJ.continuousOE, false);
  assert.equal(resolved.NJ, stateGIRules.NJ);
  assert.equal(resolved.CT, database.CT);
  assert.deepEqual(database, before);
  assert.deepEqual(resolveMedSupStateGIRules(null), stateGIRules);
});

test('NJ reference distinguishes age boundaries, eligibility basis, protected windows and plan/carrier limits', () => {
  const { age65Plus, disabledAge50To64, underAge50 } = stateGIRules.NJ.branches;
  assert.equal(underAge50.maximumAge + 1, disabledAge50To64.minimumAge);
  assert.equal(disabledAge50To64.maximumAge + 1, age65Plus.minimumAge);
  assert.match(age65Plus.openEnrollment, /both age 65 or older and enrolled in Part B/);
  assert.match(age65Plus.guaranteedIssue, /Federal guaranteed-issue triggers/);
  assert.match(age65Plus.underwriting, /outside open enrollment and applicable federal GI windows/);
  assert.match(disabledAge50To64.eligibilityBasis, /disability/);
  assert.match(disabledAge50To64.access, /age-65 beneficiary for the same policy/);
  assert.match(disabledAge50To64.underwriting, /after the first twelve months/);
  assert.match(disabledAge50To64.openEnrollment, /pre-2020 Plan C rule used a six-month/);
  assert.match(underAge50.carrier, /Horizon BCBSNJ\) only/);
  assert.match(underAge50.plans, /Plan D only.*2020; Plan C.*before 2020/);
  assert.match(stateGIRules.NJ.missingFacts, /verify them before asserting GI/);
});

test('MedSup coaching no longer lists NJ as year-round GI and coaching/Q&A receive the same reviewed context', () => {
  const builders = engineBuilders('MEDSUP');
  const context = { stateGIRules: resolveMedSupStateGIRules({ NJ: { continuousOE: true } }) };
  for (const builder of [builders.buildCoachingSystemPrompt, builders.buildAskSystemPrompt]) {
    const prompt = buildCachedPrompt(builder, { ...promptOptions(), copilotContextJson: JSON.stringify(context) });
    const state = JSON.parse(prompt.contextMessages[0].content.split('\n').slice(1).join('\n')).appState;
    assert.deepEqual(state.stateGIRules.NJ, stateGIRules.NJ);
  }
  const text = builders.buildCoachingSystemPrompt(promptOptions()).staticPrefix;
  assert.ok(!/Year-round GI[^\n]*\bNJ\b/.test(text));
  assert.match(text, /NJ is NOT continuous open enrollment/);
  assert.match(text, /all other states except NJ/);
});

test('036 seed migration contains the identical reviewed NJ object and is scoped to the known legacy entry', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/036_correct_nj_medigap_gi.sql', import.meta.url), 'utf8');
  const json = sql.match(/\$nj\$([\s\S]*?)\$nj\$/)[1];
  assert.deepEqual(JSON.parse(json), stateGIRules.NJ);
  assert.match(sql, /category = 'medicare_reference' AND key = 'state_gi_rules'/);
  assert.match(sql, /metadata #> '\{structured,NJ\}' =/);
  assert.match(sql, /INSERT INTO public.knowledge_updates/);
});
