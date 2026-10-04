import { U65_PLANS } from './u65Guidance.js';
export const PRIVATE_PLAN_PLAYBOOK_URL = '/private-plan-playbook.html';
export const PRIVATE_PLAN_CONTEXT_EVENT = 'enrollgen:private-plan-context';
export const PRIVATE_PLAN_RAIL_ID = 'u65-private-plans';
export const PRIVATE_PLAN_PRODUCTS = U65_PLANS.map((plan) => ({ ...plan, shortName: plan.name, startingPremium: 'verify with carrier' }));
export const PRIVATE_PLAN_DECISION_ROWS = [];
export const PRIVATE_PLAN_UNDERWRITING = { guidance: 'verify with carrier' };

export const PRIVATE_PLAN_DENTAL = [
  {
    name: "Solstice DHMO",
    price: "$59.99/mo",
    network: "Solstice Network",
    highlights: [
      "No annual max.",
      "No waiting periods.",
      "$0 preventive care.",
      "Must use network dentist except emergencies.",
    ],
  },
  {
    name: "Cigna DHMO",
    price: "$59.99/mo",
    network: "Cigna Access Plus",
    highlights: [
      "No annual max.",
      "No waiting periods.",
      "$0 preventive care.",
      "Run provider lookup before presenting.",
    ],
  },
  {
    name: "Solstice PPO",
    price: "$89.99/mo",
    network: "In and out of network",
    highlights: [
      "$1,500 annual max.",
      "$50 individual deductible.",
      "Same benefit level in and out of network.",
      "No waiting periods.",
    ],
  },
];

export const PRIVATE_PLAN_DENTAL_FACTS = [
  "Available in 37 states.",
  "No waiting periods.",
  "Age 65+ eligible.",
];
