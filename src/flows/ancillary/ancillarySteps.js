import { SUB_PRODUCT } from "./ancillaryConstants";

export const ANCILLARY_STEPS = {
  [SUB_PRODUCT.HIP]: [
    {
      id: "hip-intro-transition",
      title: "Intro / Transition",
      content:
        "As I mentioned, your plan has out-of-pocket costs for hospital stays. Let me show you how we can protect you from those.",
      substeps: [],
    },
    {
      id: "hip-need-build",
      title: "Need Build",
      content:
        "If you had a hospital stay of [X] days at [COPAY] per day, that's [TOTAL] out of pocket. A hospital indemnity plan pays you a fixed cash benefit for each day you're hospitalized. The money goes directly to you.",
      substeps: [],
    },
    {
      id: "hip-present-options",
      title: "Present Options",
      content:
        "Option 1: MA plan only, full copayments. Option 2: Add hospital benefit to cover [COPAY]/day copays. Option 3: Hospital benefit plus ambulance rider. Which fits your needs and budget?",
      substeps: ["Always present 2-3 options before asking for the decision."],
    },
    {
      id: "hip-riders",
      title: "Riders",
      content:
        "Ambulance rider: pays [AMOUNT] per ambulance ride. Skilled Nursing rider: covers daily copays after day 20. Cancer rider: helps with coinsurance on chemo/radiation.",
      substeps: [
        "Ambulance rider: $200-$300 per ride benefit.",
        "Skilled Nursing rider: daily copay support after day 20.",
        "Cancer rider: helps offset chemo/radiation coinsurance.",
      ],
    },
    {
      id: "hip-close",
      title: "Close",
      content:
        "This plan pays you directly and you can use the money however you need. As long as you keep paying your premium, you're covered. Let me get your application started.",
      substeps: [],
    },
  ],

  [SUB_PRODUCT.FE]: [
    {
      id: "fe-opening",
      title: "Opening",
      content:
        "Hi [NAME], I'm [AGENT], a licensed agent in your state. I'm reaching out about the senior benefit life insurance you requested information on. Can I have 2 minutes to explain how this works?",
      substeps: [],
    },
    {
      id: "fe-need-build",
      title: "Need Build",
      content:
        "These benefits help [STATE] residents leave tax-free money to cover final expenses: funeral costs, medical bills, outstanding debt. Have you given thought to how your family would handle those?",
      substeps: [],
    },
    {
      id: "fe-health-prequal",
      title: "Health Pre-Qual",
      content:
        "I need to ask a few basic health questions. No medical exam required. DOB? Tobacco in past year? Heart attack, cancer, stroke in past 2 years? Uncontrolled diabetes? Hospitalized past 12 months?",
      substeps: [],
    },
    {
      id: "fe-present-options",
      title: "Present 3 Options",
      content:
        "[CARRIER] offers: $10K at [PRICE]/mo, $15K at [PRICE]/mo, $20K at [PRICE]/mo. Which works best for you, your family, and your budget?",
      substeps: ["Always show three face amounts before asking for the choice."],
    },
    {
      id: "fe-key-benefits",
      title: "Key Benefits",
      content:
        "Day 1 full coverage. Can never be cancelled. Premium never increases. Benefit is tax-free to your beneficiary.",
      substeps: [
        "Contrast against guaranteed acceptance products only when relevant.",
        "Do not imply approval until underwriting or e-app confirms it.",
      ],
    },
    {
      id: "fe-close",
      title: "Close",
      content:
        "Let's complete the enrollment. Congratulations, you're approved for [AMOUNT]. Your beneficiary [NAME] will receive the full benefit tax-free.",
      substeps: [],
    },
  ],

  [SUB_PRODUCT.DVH]: [
    {
      id: "dvh-fact-find",
      title: "Fact Find",
      content:
        "Do you regularly visit the dentist or eye doctor? Do you have coverage for those visits? Who is your dental/vision plan with?",
      substeps: [],
    },
    {
      id: "dvh-need-build",
      title: "Need Build",
      content:
        "Original Medicare and supplement plans don't cover routine dental, vision, or hearing. Cleanings, fillings, eye exams, glasses, hearing tests, hearing aids -- all out of pocket.",
      substeps: [],
    },
    {
      id: "dvh-present",
      title: "Present",
      content:
        "This plan covers routine dental, eye exams, lenses, and hearing exams. Premium is [PRICE]/mo, no underwriting. Coverage starts [DATE]. Network savings for reduced provider fees.",
      substeps: [],
    },
    {
      id: "dvh-waiting-periods",
      title: "Disclose Waiting Periods",
      content:
        "Preventive dental: covered year 1. Major dental (crowns, dentures): typically 50% after 12 months. Hearing aids: may have 12-month wait.",
      substeps: [
        "Eye exams and lenses are usually year 1 benefits.",
        "Major dental and hearing aid waits vary by carrier.",
      ],
    },
    {
      id: "dvh-close",
      title: "Close",
      content:
        "No health questions required. Want to add this coverage today?",
      substeps: [],
    },
  ],
};

export function getAncillarySteps(subProduct) {
  return ANCILLARY_STEPS[subProduct] || [];
}
