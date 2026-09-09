import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';

export const engineFiles = {
  MA: 'useCopilotEngine', MEDSUP: 'useMedSupCopilotEngine',
  ACA: 'useAcaCopilotEngine', U65: 'useU65CopilotEngine',
};

// Load the actual pure builders without mounting React, fetching knowledge, or
// duplicating production prompt text in tests.
export function loadPromptBuilders(source) {
  const names = new Set(['buildComplianceContext', 'buildCoachingModeGuidance',
    'buildAudioConstraintBlock', 'OBSERVATION_STAY_TALKING_POINT',
    'buildCoachingSystemPrompt', 'buildAskSystemPrompt']);
  const nodes = parse(source, { sourceType: 'module' }).program.body.filter(node =>
    names.has(node.id?.name || node.declarations?.[0]?.id?.name));
  return vm.runInNewContext(nodes.map(node => source.slice(node.start, node.end)).join('\n')
    + '\n({ buildCoachingSystemPrompt, buildAskSystemPrompt })');
}

export function engineBuilders(engine) {
  return loadPromptBuilders(fs.readFileSync(new URL(`../../src/hooks/${engineFiles[engine]}.js`, import.meta.url), 'utf8'));
}

export function promptOptions(n = 0) {
  return {
    sectionKey: `Section ${n}`, flowOrder: `>>> flow ${n}`, cmsBlock: `CMS ${n}`,
    scriptTemplateBlock: `Tenant template ${n}`, transcriptRefBlock: `RAG ${n}`,
    transcriptReferenceBlock: `RAG ${n}`, reviewMode: n % 2 ? 'periodic' : 'live',
    hasCustomerAudio: !!(n % 2), isSpoken: !!(n % 2),
    recentInterventionText: `Earlier intervention ${n}`, recentTranscript: `Transcript ${n}`,
    recentCustomerSpeech: `Customer ${n}`, copilotContextJson: JSON.stringify({ gate: n }),
    knowledge: Object.fromEntries(['verbatimScript', 'keyPhrasesToListenFor', 'requiredElements',
      'commonMistakes', 'redFlags'].map(key => [key, [`${key} ${n}`]])),
  };
}
