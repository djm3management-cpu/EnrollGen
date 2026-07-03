export const STATE_SEP_TYPE_META = {
  PAP: { label: "PAP", color: "var(--chart-4)" },
  DST: { label: "DST", color: "var(--status-pending)" },
  INT: { label: "INT", color: "var(--info)" },
  CSNP: { label: "CSNP", color: "var(--status-live)" },
};

export const STATE_NAME_MAP = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

export const STATE_FEMA_END_DATES = {
  AL: "5/31",
  AR: "4/30",
  FL: "6/30",
  KY: "4/30",
  MO: "4/30",
  NC: "4/30",
  NJ: "10/31",
  PA: "4/30",
  TN: "4/30",
  TX: "4/30",
  VA: "4/30",
  OH: "6/30",
  WA: "5/31",
  WI: "12/31",
  NM: "8/31",
  WY: "10/31",
  SC: "4/30",
  LA: "4/30",
  WV: "4/30",
  NY: "5/31",
};

export const INT_MANDATORY_QUESTIONS = [
  "Do you currently receive home healthcare or assistance with activities of daily living? If yes, election is not available.",
  "Do you currently reside in a nursing home or long term care facility? If yes, election is not available.",
  "Do you currently see behavioral health professionals? If yes, ensure those providers are covered under the D-SNP plan.",
];

export const INT_MANDATORY_DISCLOSURE =
  "By selecting this election, your care will be coordinated between both Medicare and Medicaid under [carrier name]. This means your Medicaid carrier will change to align with your Medicare Advantage plan. This integration helps simplify your healthcare experience by reducing confusion, streamlining access to your benefits, and ensuring a more seamless and efficient coordination of your care.";

const AUTO_ENROLL_INT_STATES = new Set(["FL", "NJ", "VA"]);

function getPapPlay(stateCode) {
  const statePlay = {
    AL: [
      "Call the AAA together at 1-800-243-5463 to request the application.",
      "Approval takes up to 30 days, so set a callback now and work the SEP after approval.",
    ],
    IN: [
      "Walk the member through the 7-minute e-app now.",
      "Approval takes 4-6 weeks, so set a callback and work the SEP once Hoosier RX is approved.",
    ],
    MO: [
      "Walk the member through the 15-minute e-app now.",
      "Approval usually takes about 3 weeks, so set a callback and work the SEP after approval.",
    ],
    NJ: [
      "Walk the member through the 20-minute e-app now so the PAP application is in motion.",
      "Set a callback for approval confirmation, then use that approval to work the SEP into MA enrollment.",
    ],
    PA: [
      "Walk the member through the 10-minute e-app or call together at 1-800-225-7223.",
      "Set a callback for approval confirmation, then use the PAP approval to work the SEP into MA enrollment.",
    ],
  };

  return (
    statePlay[stateCode] ?? [
      "Help the member apply now, either by phone or through the state's e-app.",
      "Once approved, their SEP activates and you can work the Medicare Advantage enrollment. Set a follow-up for approval.",
    ]
  );
}

function getIntPlay(stateCode) {
  if (AUTO_ENROLL_INT_STATES.has(stateCode)) {
    return [
      "Member has full Medicaid and you are moving them into a D-SNP that covers both Medicare and Medicaid.",
      "Confirm QMB+, SLMB+, or FBDE, ask the 3 mandatory questions, read the disclosure, then enroll.",
      "The plan will auto-enroll them into the aligned Medicaid MCO.",
    ];
  }

  return [
    "Member has full Medicaid and you are moving them into a D-SNP, but this state does not auto-enroll the Medicaid MCO.",
    "Ask which MCO they have first. If it does not match the D-SNP carrier, call the Medicaid line together and switch it before enrolling.",
    "Then confirm Medicaid level, ask the 3 mandatory questions, read the disclosure, and enroll.",
  ];
}

function getDstPlay() {
  return [
    "Member missed an enrollment period because of a FEMA-declared disaster in their area.",
    "Verify the county on FEMA.gov and confirm they had another valid election period they could not use because of the disaster.",
    "Use election code SEP-DST on the application.",
  ];
}

function getCsnpPlay() {
  return [
    "Member may qualify for a Chronic Special Needs Plan based on a listed chronic condition.",
    "Check Sunfire for an available C-SNP in their area and confirm the condition matches the plan requirements.",
    "Be ready to collect provider documentation if the carrier needs diagnosis confirmation.",
  ];
}

const DST_ONLY_NOTES = [
  "DST only. No state-specific programs.",
  "Check FEMA.gov for active disaster declarations in this area.",
];

const STATE_NAME_TO_CODE_MAP = Object.fromEntries(
  Object.entries(STATE_NAME_MAP).map(([stateCode, stateName]) => [
    stateName.toUpperCase(),
    stateCode,
  ])
);

function withStateMeta(stateCode, config) {
  return {
    stateCode,
    stateName: STATE_NAME_MAP[stateCode],
    dominantType: "DST",
    notes: [],
    sections: [],
    ...config,
  };
}

function createDstOnlyState(stateCode, femaEnd) {
  return withStateMeta(stateCode, {
    sepTypes: ["DST"],
    dominantType: "DST",
    femaEnd,
    notes: DST_ONLY_NOTES,
  });
}

function createDstSection(stateCode) {
  return {
    id: `${stateCode.toLowerCase()}-dst`,
    title: "FEMA Disaster SEP",
    type: "DST",
    content: {
      play: getDstPlay(),
      restrictions: [
        "Verify the member's county is included in the active FEMA declaration.",
        "Confirm they had another valid election period during the incident.",
        "Confirm they could not use that election period because of the disaster.",
      ],
      application: ["Use election code SEP-DST on the application."],
    },
  };
}

function createCsnpSection(stateCode) {
  return {
    id: `${stateCode.toLowerCase()}-csnp`,
    title: "C-SNP Enrollment",
    type: "CSNP",
    content: {
      play: getCsnpPlay(),
      restrictions: [
        "Verify the member has a qualifying chronic condition that matches an available C-SNP.",
        "Use Sunfire to confirm the plan exists in the member's area.",
      ],
      tips: ["Provider documentation may be needed to confirm the diagnosis."],
    },
  };
}

function enrichStateInfo(stateInfo) {
  if (!stateInfo) {
    return stateInfo;
  }

  const existingSectionTypes = new Set(stateInfo.sections.map((section) => section.type));
  const sections = [...stateInfo.sections];

  if (
    stateInfo.sepTypes.includes("DST") &&
    stateInfo.femaEnd &&
    !existingSectionTypes.has("DST")
  ) {
    sections.push(createDstSection(stateInfo.stateCode));
  }

  if (stateInfo.sepTypes.includes("CSNP") && !existingSectionTypes.has("CSNP")) {
    sections.push(createCsnpSection(stateInfo.stateCode));
  }

  return {
    ...stateInfo,
    sections,
  };
}

export const STATE_SEP_DATA = {
  AL: withStateMeta("AL", {
    sepTypes: ["PAP", "DST"],
    dominantType: "PAP",
    femaEnd: "5/31",
    sections: [
      {
        id: "al-senior-rx",
        title: "Senior RX",
        type: "PAP",
        content: {
          play: getPapPlay("AL"),
          qualifications: [
            "Must be an Alabama resident and meet one of the qualification paths below.",
            "Path A: Age 55+, chronic medical condition, no or limited Rx drug insurance, and within income limits.",
            "Path B: Any age with a disability, applied and awaiting SSA, doctor declaration of disability, or in the 24-month Medicare waiting period.",
          ],
          application: [
            "Member must contact the local Area Agency on Aging (AAA) / ADRC to request the application.",
            "Approval time can take up to 30 days.",
          ],
          phoneNumbers: [
            {
              label: "AAA / ADRC",
              value: "1-800-243-5463",
              note: "1-800-AGE-LINE",
            },
          ],
          tips: ["Call with the member to request the application."],
        },
      },
    ],
  }),
  AR: createDstOnlyState("AR", "4/30"),
  FL: withStateMeta("FL", {
    sepTypes: ["DST", "INT"],
    dominantType: "INT",
    femaEnd: "6/30",
    sections: [
      {
        id: "fl-int-election",
        title: "INT Election",
        type: "INT",
        content: {
          play: getIntPlay("FL"),
          carriers: ["Careplus", "Humana", "Preferred", "Aetna", "UHC", "Cigna", "Simply"],
          restrictions: [
            "Only for members with QMB+, SLMB+, or FBDE level of Medicaid.",
            "Use the HIDE or FIDE filter in Sunfire or look for INT Eligible labeling.",
            "Full Dual Eligible benes can change HIDE/FIDE D-SNPs monthly regardless of Medicaid carrier.",
            "Once enrolled in an eligible D-SNP, the member loses Medicaid coverage and the D-SNP covers Medicaid benefits.",
            "Florida is an auto-enroll state. Plans will auto-enroll the member into the aligned MCO.",
          ],
          checklist: INT_MANDATORY_QUESTIONS,
          disclosure: INT_MANDATORY_DISCLOSURE,
        },
      },
    ],
  }),
  IN: withStateMeta("IN", {
    sepTypes: ["PAP"],
    dominantType: "PAP",
    femaEnd: null,
    sections: [
      {
        id: "in-hoosier-rx",
        title: "Hoosier RX",
        type: "PAP",
        content: {
          play: getPapPlay("IN"),
          qualifications: [
            "Indiana resident.",
            "Age 65+.",
            "Income at or below $22,830 single / $30,900 married.",
            "Not eligible for Full Medicare Extra Help.",
            "Must be enrolled in a Part D plan that works with HoosierRx.",
          ],
          application: ["7-minute E-App.", "Approval usually runs 4-6 weeks."],
          tips: [
            "Only enter required fields marked with *.",
            "Read the final disclosure and ask permission to e-sign on the member's behalf.",
          ],
        },
      },
    ],
  }),
  KY: withStateMeta("KY", {
    sepTypes: ["INT", "CSNP", "DST"],
    dominantType: "INT",
    femaEnd: "4/30",
    sections: [
      {
        id: "ky-int-election",
        title: "INT Election",
        type: "INT",
        content: {
          play: getIntPlay("KY"),
          carriers: ["Aetna", "UHC", "Humana", "Wellcare"],
          restrictions: [
            "Only for members with QMB+, SLMB+, or FBDE level of Medicaid.",
            "Kentucky is not an auto-enroll state. The member must switch Medicaid MCO to match the D-SNP carrier.",
            "Ask early in the call which Medicaid / MCO the member currently has.",
          ],
          phoneNumbers: [
            {
              label: "Medicaid Choice",
              value: "1-800-505-5678",
              note: "Mon-Fri 8:30am-8:00pm | Sat 10:00am-6:00pm",
            },
            {
              label: "TTY",
              value: "1-888-329-1541",
            },
          ],
          tips: [
            "Open enrollment options include the first 90 days after enrollment, annual anniversary, redetermination, or just cause.",
          ],
          checklist: INT_MANDATORY_QUESTIONS,
          disclosure: INT_MANDATORY_DISCLOSURE,
        },
      },
    ],
  }),
  MO: withStateMeta("MO", {
    sepTypes: ["PAP", "DST"],
    dominantType: "PAP",
    femaEnd: "4/30",
    sections: [
      {
        id: "mo-mo-rx",
        title: "MO RX",
        type: "PAP",
        content: {
          play: getPapPlay("MO"),
          qualifications: [
            "Missouri resident.",
            "Age 60+.",
            "Must meet income limits.",
          ],
          application: [
            "15-minute E-App.",
            "Approval typically takes about 3 weeks.",
          ],
          tips: ["Use the online portal for the fastest processing."],
        },
      },
    ],
  }),
  NC: createDstOnlyState("NC", "4/30"),
  NJ: withStateMeta("NJ", {
    sepTypes: ["DST", "INT", "PAP", "CSNP"],
    dominantType: "INT",
    femaEnd: "10/31",
    sections: [
      {
        id: "nj-pap",
        title: "Senior Gold / PAAD",
        type: "PAP",
        content: {
          play: getPapPlay("NJ"),
          programs: [
            {
              title: "Senior Gold",
              items: [
                "NJ resident.",
                "Age 65+.",
                "Must meet income requirements.",
              ],
            },
            {
              title: "PAAD",
              items: [
                "NJ resident.",
                "Age 65+.",
                "Must meet income requirements.",
              ],
            },
          ],
          application: ["20-minute E-App."],
          tips: [
            "One of the more comprehensive state PAP programs and can significantly reduce Rx costs.",
          ],
        },
      },
      {
        id: "nj-int-election",
        title: "INT Election",
        type: "INT",
        content: {
          play: getIntPlay("NJ"),
          carriers: ["Wellcare", "Wellpoint", "Aetna", "UHC"],
          restrictions: [
            "Only for members with QMB+, SLMB+, or FBDE level of Medicaid.",
            "NJ is an auto-enroll state. The member auto-enrolls into the aligned MCO.",
          ],
          warnings: ["Do not use INT if the member is enrolled in the PACE program."],
          checklist: INT_MANDATORY_QUESTIONS,
          disclosure: INT_MANDATORY_DISCLOSURE,
        },
      },
    ],
  }),
  PA: withStateMeta("PA", {
    sepTypes: ["PAP", "DST"],
    dominantType: "PAP",
    femaEnd: "4/30",
    sections: [
      {
        id: "pa-pace-pacenet",
        title: "PACE / PACENET",
        type: "PAP",
        content: {
          play: getPapPlay("PA"),
          qualifications: [
            "Age 65+.",
            "PA resident for at least 90 days.",
            "Cannot be enrolled in the DHS Medicaid prescription benefit.",
          ],
          programs: [
            {
              title: "PACE Income Limits",
              items: [
                "Single: $14,500 or less.",
                "Married: $17,700 or less.",
              ],
            },
            {
              title: "PACENET Income Limits",
              items: [
                "Single: $14,501-$33,500.",
                "Married: $17,701-$41,500.",
              ],
            },
          ],
          warnings: [
            "Having Medicaid does not automatically mean they have Medicaid Rx benefits. Ask whether prescriptions are filled through Medicaid or Medicare Part D.",
          ],
          application: ["10-minute E-App or call with the member."],
          phoneNumbers: [
            {
              label: "PACE / PACENET",
              value: "1-800-225-7223",
            },
          ],
          tips: [
            "Click Other on the dropdown and continue.",
            "Leave the driver's license field empty.",
            "Read the Certification and Authorization statements and ask the member to agree before signing on their behalf.",
          ],
        },
      },
    ],
  }),
  TN: createDstOnlyState("TN", "4/30"),
  TX: withStateMeta("TX", {
    sepTypes: ["DST", "INT", "CSNP"],
    dominantType: "INT",
    femaEnd: "4/30",
    sections: [
      {
        id: "tx-int-election",
        title: "INT Election",
        type: "INT",
        content: {
          play: getIntPlay("TX"),
          carriers: ["Aetna", "UHC", "Wellcare", "Anthem"],
          restrictions: [
            "Only for members with QMB+, SLMB+, or FBDE level of Medicaid.",
            "Texas is not an auto-enroll state. The member must switch Medicaid MCO.",
          ],
          phoneNumbers: [
            {
              label: "TX Star+Plus Medicaid",
              value: "1-877-447-2714",
              note: "After language: press 2 for Medicaid, 6 for STAR+PLUS, then 3 for an agent.",
            },
          ],
          tips: [
            "A common just cause reason is wanting the Medicaid MCO coordinated with the Medicare carrier.",
          ],
          checklist: INT_MANDATORY_QUESTIONS,
          disclosure: INT_MANDATORY_DISCLOSURE,
        },
      },
    ],
  }),
  VA: withStateMeta("VA", {
    sepTypes: ["DST", "INT", "CSNP"],
    dominantType: "INT",
    femaEnd: "4/30",
    sections: [
      {
        id: "va-int-election",
        title: "INT Election",
        type: "INT",
        content: {
          play: getIntPlay("VA"),
          restrictions: [
            "VA is an auto-enroll state. Plans will auto-enroll the member into the aligned MCO.",
            "Only for members with QMB+, SLMB+, or FBDE level of Medicaid.",
          ],
          checklist: INT_MANDATORY_QUESTIONS,
          disclosure: INT_MANDATORY_DISCLOSURE,
        },
      },
    ],
  }),
};

export function resolveStateCode(input) {
  const normalized = input.trim().toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  if (STATE_NAME_MAP[normalized]) {
    return normalized;
  }

  return STATE_NAME_TO_CODE_MAP[normalized] ?? null;
}

export function getStateSepInfo(stateCode) {
  if (!stateCode || !STATE_NAME_MAP[stateCode]) {
    return null;
  }

  if (STATE_SEP_DATA[stateCode]) {
    return enrichStateInfo(STATE_SEP_DATA[stateCode]);
  }

  return enrichStateInfo(
    withStateMeta(stateCode, {
      sepTypes: ["DST"],
      dominantType: "DST",
      femaEnd: STATE_FEMA_END_DATES[stateCode] ?? null,
      notes: DST_ONLY_NOTES,
    })
  );
}
