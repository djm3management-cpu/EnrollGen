import catalog from './u65PlanCatalog.json' with { type: 'json' };

export const U65_CATALOG = catalog;
export const U65_PLANS = catalog.plans;
export const U65_COVERAGE_GROUPS = catalog.coverageGroups;
export const U65_VERIFY = 'verify with carrier';
export const U65_SOURCE_VERSION = catalog.version;
export function getU65Plan(id) {
  return U65_PLANS.find((plan) => plan.id === id) || null;
}
export function buildU65ProductContext(ids = []) {
  const selected = [...new Set(ids)].map(getU65Plan).filter(Boolean);
  return {
    sourceVersion: U65_SOURCE_VERSION,
    market: catalog.market,
    portal: catalog.portal,
    rule: 'Use only this source catalog for product facts. Never compare premiums across groups. Unknown: verify with carrier. Conflicting: confirm with carrier. Never infer availability, underwriting lookbacks or ACA/MEC status.',
    selectionRequired: selected.length === 0,
    selectedProducts: selected.map((plan) => ({ ...plan, sourceCells: undefined })),
    universalStatements: catalog.universalStatements,
    networkWarnings: catalog.networkWarnings,
  };
}
// Retired database knowledge cannot reintroduce PALIC or blanket NOT-MEC rules.
export function resolveU65Knowledge(fallback, entries = []) {
  const merged = { ...fallback };
  for (const entry of entries) {
    const value = entry.metadata?.structured;
    const key = entry.metadata?.static_key;
    if (entry.metadata?.source_version !== U65_SOURCE_VERSION || !fallback[key] || !value) continue;
    if (['verbatimScript', 'keyPhrasesToListenFor', 'requiredElements', 'commonMistakes', 'redFlags'].every((field) => Array.isArray(value[field]))) merged[key] = value;
  }
  return merged;
}
export function buildU65Quiz(plans = U65_PLANS) {
  return plans.map((plan, index) => ({
    id: plan.id,
    question: `Which statement must the agent give for ${plan.name}?`,
    choices: ['A', 'B', 'C', 'D'].map((key, choiceIndex) => [key,
      choiceIndex === index % 4
        ? plan.requiredStatements.filter((line) => !catalog.universalStatements.includes(line)).join(' ')
        : [
          'The stated OOP limit always caps every medical bill.',
          'Every provider with the network logo participates in this exact product.',
          'The product label proves ACA/MEC status and underwriting eligibility.',
        ][choiceIndex < index % 4 ? choiceIndex : choiceIndex - 1],
    ]),
    answer: ['A', 'B', 'C', 'D'][index % 4],
    explanation: `${plan.requiredStatements.join(' ')} Source: ${plan.source}.`,
  }));
}
export const U65_QUIZ = buildU65Quiz();
export const U65_MEDMAX_QUIZ = buildU65Quiz(U65_PLANS.filter((plan) => plan.name.startsWith('MedMax')));
