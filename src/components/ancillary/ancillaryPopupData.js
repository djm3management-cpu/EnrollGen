const DAY_MS = 24 * 60 * 60 * 1000;

export const ANCILLARY_TRIGGER_OPTIONS = [
  {
    id: "hospital",
    prompt: "Hospital stay or surgery?",
    product: "Hospital Indemnity plan",
  },
  {
    id: "cancer",
    prompt: "Cancer in family or history?",
    product: "Cancer / Critical Illness plan",
  },
  {
    id: "dental",
    prompt: "Needs dental work?",
    product: "Standalone Dental plan",
  },
  {
    id: "cardiac",
    prompt: "Heart condition or stroke history?",
    product: "Heart Attack & Stroke plan",
  },
  {
    id: "mobility",
    prompt: "Falls or mobility concerns?",
    product: "Hospital Indemnity + Short-Term Care",
  },
];

export const ANCILLARY_PORTAL_PRODUCTS = {
  "hospital-indemnity": {
    id: "hospital-indemnity",
    title: "Hospital Indemnity (GTL)",
    recapName: "Hospital Indemnity Plan",
    carrier: "GTL",
    href: "https://www.gtlic.com/",
    detail: "5 min, no health questions, guaranteed issue",
  },
  dental: {
    id: "dental",
    title: "Standalone Dental",
    recapName: "Standalone Dental",
    carrier: "Delta Dental",
    href: "https://enrollment.ncd.com/544128",
    detail: "3 min, no health questions",
  },
  "critical-illness": {
    id: "critical-illness",
    title: "Cancer or Heart Attack & Stroke",
    recapName: "Cancer / Heart Attack & Stroke",
    carrier: "GTL",
    href: "https://www.gtlic.com/",
    detail: "5-10 min, a few health questions",
  },
};

const DEFAULT_PORTAL_IDS = ["hospital-indemnity", "dental"];

const TRIGGER_PORTAL_MAP = {
  hospital: ["hospital-indemnity"],
  cancer: ["critical-illness"],
  dental: ["dental"],
  cardiac: ["critical-illness"],
  mobility: ["hospital-indemnity"],
};

export const ANCILLARY_POPUP_COPY = {
  A: {
    icon: "target",
    title: "LISTEN FOR GAPS",
    intro:
      "While asking about health and medications, listen for these and tap any that come up:",
    footer:
      "Do not sell yet - just flag what you hear. You'll use this at plan presentation.",
  },
  B: {
    icon: "banknote",
    title: "PLANT THE SEED",
    collapsedLabel: "Ancillary",
    intro:
      "When you get to the inpatient hospital copays in the Summary of Benefits, say:",
    quote: `"So this plan has a [copay amount] per day copay for hospital stays. If you were admitted for 5 days that could be over a thousand dollars out of pocket.

The good news is we can cover that gap for about a dollar a day. I'll show you that option once we finish the plan review - sound good?"`,
    footer: "That's it - 15 seconds, then move on.",
  },
  C: {
    icon: "send",
    title: "AFTER YOU SUBMIT",
    collapsedLabel: "Ancillary",
    intro:
      "Once the Medicare Advantage enrollment is confirmed, transition to ancillary:",
    quote: `"Your plan is confirmed! Remember that hospital benefit we talked about? Let me pull that up for you - only takes about 5 minutes."`,
    notes: [
      "If they say yes - enroll now, same session.",
      "If they want to wait - schedule a 14-day follow-up to revisit.",
    ],
  },
  "D-recap": {
    icon: "clipboard-check",
    title: "RECAP EVERYTHING",
    intro: "Read back all products to the client:",
    footer:
      "Remember to give each product its own carrier name, premium, and effective date. Do not lump them together.",
  },
  "D-lastchance": {
    icon: "circle-alert",
    title: "ONE MORE TRY",
    collapsedLabel: "Ancillary",
    intro: "Before you wrap up:",
    quote: `"One last thing before we go - that hospital benefit I mentioned is about a dollar a day and there are no health questions to answer. Can I get that set up for you real quick?"`,
    footer:
      "If they pass - no pressure. Let them know you'll bring it up at your follow-up call in a couple weeks.",
  },
  E: {
    icon: "phone-call",
    title: "ANCILLARY FOLLOW-UP DUE",
    intro: "Call script:",
    quote: `"Hi [Name], this is [Agent Name] from New Gen Health Solutions. Just checking in - have you received your new plan ID card yet?

Great. I also wanted to circle back on that hospital benefit plan we discussed. Most of my clients end up adding it after they see what the copays look like on their first visit. It's still about $30 a month with no health questions. Want me to get that set up for you?"`,
    notes: [
      "If they enroll - process through the carrier portal (GTL or other).",
      "If they pass again - note it and revisit at Annual Enrollment Period.",
    ],
  },
};

export const ANCILLARY_SEED_MENTIONS = {
  cancer:
    'You can also mention: "I also have something for the cancer concern you mentioned - we\'ll get to that too."',
  dental:
    'You can also mention: "And I have a dental option stronger than what\'s built into this plan."',
  cardiac:
    'You can also mention: "And given your heart history, there\'s a plan that pays a lump sum - I\'ll walk you through it."',
};

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function getPortalProducts(triggersDetected = []) {
  const triggerIds = triggersDetected.length
    ? triggersDetected.flatMap((id) => TRIGGER_PORTAL_MAP[id] || [])
    : DEFAULT_PORTAL_IDS;

  return uniqueById(
    triggerIds
      .map((id) => ANCILLARY_PORTAL_PRODUCTS[id])
      .filter(Boolean)
  );
}

export function getSeedMentions(triggersDetected = []) {
  return triggersDetected
    .map((id) => ANCILLARY_SEED_MENTIONS[id])
    .filter(Boolean);
}

export function getFollowUpDate(baseIso) {
  const base = baseIso ? new Date(baseIso) : new Date();
  if (Number.isNaN(base.getTime())) {
    return null;
  }

  return new Date(base.getTime() + 14 * DAY_MS).toISOString();
}

export function isFollowUpDue(ancillaryState, followUpContext) {
  if (!followUpContext) {
    return false;
  }

  if (
    followUpContext.completed ||
    followUpContext.ancillarySold ||
    ancillaryState.ancillaryEnrolled.length > 0
  ) {
    return false;
  }

  const followUpDate =
    ancillaryState.followUpDate ||
    getFollowUpDate(followUpContext.enrollmentDate);

  if (!followUpDate) {
    return false;
  }

  const followUpTs = new Date(followUpDate).getTime();
  return !Number.isNaN(followUpTs) && Date.now() >= followUpTs;
}

export function getActivePopup(currentCard, ancillaryState, followUpContext) {
  if (isFollowUpDue(ancillaryState, followUpContext)) {
    return "E";
  }

  if (currentCard === 5) return "A";
  if (currentCard === 6) return "B";
  if (currentCard === 7) return "C";
  if (currentCard === 8) {
    return ancillaryState.ancillaryEnrolled.length > 0
      ? "D-recap"
      : "D-lastchance";
  }

  return null;
}

export function buildRecapItems(scriptState, ancillaryState) {
  const primaryPlanName = scriptState?.notes?.planName?.trim();
  const effectiveDate = scriptState?.notes?.effectiveDate?.trim() || null;

  const items = [
    {
      id: "ma-core",
      title: primaryPlanName || "Medicare Advantage Plan",
      carrier: primaryPlanName || "Carrier pending",
      premium: null,
      effectiveDate,
    },
  ];

  ancillaryState.ancillaryEnrolled.forEach((item) => {
    items.push({
      id: item.id,
      title: item.product,
      carrier: item.carrier || "Carrier pending",
      premium: item.premium || null,
      effectiveDate: item.effectiveDate || effectiveDate,
    });
  });

  return items;
}

export function calculateSupplementalTotal(ancillaryEnrolled = []) {
  const numericPremiums = ancillaryEnrolled
    .map((item) => Number.parseFloat(String(item.premium ?? "").replace(/[^0-9.]/g, "")))
    .filter((value) => Number.isFinite(value));

  if (numericPremiums.length === 0) {
    return null;
  }

  return numericPremiums.reduce((sum, value) => sum + value, 0);
}
