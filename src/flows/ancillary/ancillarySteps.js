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
      id: "fe-script",
      title: "Final Expense Script",
      content: `Hi, this is [Your Name], I'm a licensed life insurance advisor. You're calling about Final Expense insurance coverage, correct?
(If yes, continue. If not, thank and end the call before 90 seconds.)

Great -- this is a real policy from top A-rated companies like Mutual of Omaha. It's affordable, but not free -- you do pay a monthly premium based on your age, health, and coverage amount. Does that sound okay?
(If yes, continue. If not, exit the call.)

Just a few quick questions to see what you qualify for -- sound good?
- Are you between the ages of 50 and 80?
- What state are you in?
- Do you have a checking or savings account -- or a Direct Express card?
- Do you have a monthly budget in mind, even just a ballpark?
- And just to make sure I'm not repeating what you've already done, have you applied for life insurance recently with anyone else?

If we find something that fits, we'll go ahead and submit an application to get you approved. That just takes a few minutes -- sound good?`,
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
