// PY2027 carrier quick-reference popups. Research notes, per-claim sources and
// the pending list live in docs/carrier-popups-2027.md.
//
// Note shape: { text, planSpecific, source }. Wrap emphasis in **double
// asterisks**. Every benefit note sets planSpecific: true and renders a
// "Plan-specific" tag. Dollar amounts appear only in plan-specific notes.

export const CARRIER_POPUP_FOOTER =
  "Verify in the 2027 Summary of Benefits / EOC for the caller's plan and county";

export const CARRIER_POPUP_CHECKED_ON = "2026-10-10";

export const POPUP_STATUS = {
  CURRENT: "2027",
  PENDING: "2027 pending",
};

const SRC = {
  cmsLandscape2026: "https://www.cms.gov/files/zip/cy2026-landscape-202609.zip",
  cmsLandscape2027: "https://www.cms.gov/files/zip/cy2027-landscape-202609-1.zip",
  cmsFinalRule2027:
    "https://www.cms.gov/newsroom/fact-sheets/contract-year-2027-medicare-advantage-part-d-final-rule",
  humanaPartD2027:
    "https://www.humana.com/medicare/medicare-resources/medicare-part-d-changes",
  devotedExpansion: "https://www.devoted.com/resources/new-funding-growth-oct-2026/",
  devotedServiceArea: "https://www.devoted.com/service-area/",
  devotedFoodHome2027: "https://devoted.com/food-and-home/",
  devotedFoodHome2026: "https://devoted.com/2026-food-and-home",
  humanaRelease2027:
    "https://news.humana.com/press-room/press-releases/2026/humana-maintains-affordable-medicare-advantage-plans-and-expands",
  humanaSbH7617127: "https://assets.humana.com/is/content/humana/H7617127000SB27pdf",
  humanaSpendingCard:
    "https://www.humana.com/medicare/medicare-programs/spending-account-card",
  aetnaRelease2027:
    "https://www.cvshealth.com/news/medicare/aetna-2027-medicare-plans-offer-reliable-affordable-access-to-care-member-support.html",
  uhcRelease2027: "https://www.uhc.com/news-articles/newsroom/medicare-advantage-plans-2027",
  uhcUcard2027: "https://www.uhc.com/news-articles/medicare-articles/ucard-changes",
  uhcSar2027:
    "https://www.uhcprovider.com/content/dam/provider/docs/public/health-plans/medicare/2027/2027-MED-ADV-Service-Area-Reductions-Provider-FAQs.pdf",
  wellpointNj: "https://www.wellpoint.com/nj/medicare/medicare-advantage-plans",
  bravenExit:
    "https://www.horizonblue.com/providers/news/news-legal-notices/braven-health-plans-will-not-be-offered-2027",
  bravenTransition: "https://www.bravenhealth.com/2026/members/transition-resources",
  ibxRelease2027: "https://news.ibx.com/benefits-coverage/medicare/2027-medicare-enrollment/",
  cloverRelease2027:
    "https://investors.cloverhealth.com/news-releases/news-release-details/clover-healths-2027-medicare-advantage-plans-emphasize-ppo",
  zingPlans: "https://www.myzinghealth.com/plans",
  healthspringRelease2027:
    "https://www.healthspring.com/newsroom/healthspring-plans-offer-customers-many-options-for-2027",
  wellcareRelease2027:
    "https://investors.centene.com/2026-10-01-Wellcare-Unveils-2027-Medicare-Offerings-Focused-on-Affordability-and-Integrated-Care",
};

const plan = (text, source) => ({ text, planSpecific: true, source });
const info = (text, source) => ({ text, planSpecific: false, source });

// Shared 2027 rule notes reused across carriers.
const SSBCI_2027_NOTE = plan(
  "SSBCI (food, utilities, rent, etc.): eligibility must be **verified before** the benefit is used. 2027 debit cards must verify eligible items in **real time at checkout** and are **limited to the plan year**.",
  SRC.cmsFinalRule2027
);
const PART_D_2027_NOTE = plan(
  "Part D 2027: out-of-pocket cap rises to **$2,400** (was $2,100). The deductible varies by plan, so read it from the plan's SB.",
  SRC.humanaPartD2027
);

export const CARRIER_REFERENCE_POPUPS = [
  {
    id: "devoted",
    label: "Devoted",
    handleLabel: "DEVOTED",
    popupTitle: "DEVOTED HEALTH QUICK REFERENCE",
    aliases: ["devoted", "devoted health"],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "whats-new",
        title: "What's new for 2027",
        notes: [
          info(
            "**New to New Jersey in 2027.** 14 counties: Burlington, Camden, Essex, Gloucester, Hudson, Mercer, Monmouth, Morris, Ocean, Salem, Somerset, Sussex, Union, Warren.",
            SRC.devotedServiceArea
          ),
          info(
            "NJ lineup is **PPO only** (Choice, Choice Giveback, Giveback Extras) plus **PPO C-SNPs**. No NJ HMO or D-SNP.",
            SRC.cmsLandscape2027
          ),
          info(
            "PA grows to 57 counties (adds Bradford, Cameron, Montour, Tioga). New **Giveback Extras** HMOs and C-SNPs. Choice Premium 002 PPO is gone.",
            SRC.cmsLandscape2027
          ),
        ],
      },
      {
        id: "food-home",
        title: "Food & Home Card (SSBCI)",
        notes: [
          plan(
            "Only on **certain plans** and only for **chronically ill members** who meet plan criteria. Check status in **MyDevoted**.",
            SRC.devotedFoodHome2027
          ),
          plan(
            "Covers healthy food at participating stores plus utilities, internet and rent. Loads on the **1st of each month**. **No rollover.**",
            SRC.devotedFoodHome2027
          ),
          plan(
            "2027 change: digital barcode and balance move to the **CVS Flex Benefits app** (2026 used OTC Health Solutions). Swipe as **CREDIT**, not debit.",
            SRC.devotedFoodHome2026
          ),
          SSBCI_2027_NOTE,
        ],
      },
      {
        id: "part-d",
        title: "Part D",
        notes: [PART_D_2027_NOTE],
      },
    ],
  },
  {
    id: "humana",
    label: "Humana",
    handleLabel: "HUMANA",
    popupTitle: "HUMANA QUICK REFERENCE",
    aliases: ["humana"],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "whats-new",
        title: "What's new for 2027",
        notes: [
          info(
            "**C-SNPs expand into Pennsylvania** (HumanaChoice - Diabetes and Heart PPO C-SNP). NJ keeps Humana Gold Plus - Diabetes and Heart (HMO C-SNP).",
            SRC.humanaRelease2027
          ),
          plan(
            "New **$0 in-network routine lab services**. $0 PCP copays and $0 copays on hundreds of drugs apply on **eligible plans** only.",
            SRC.humanaRelease2027
          ),
          info(
            "NJ: all 21 counties (adds Sussex). New **HumanaChoice Giveback H7617-127 (PPO)**.",
            SRC.cmsLandscape2027
          ),
          info(
            "PA: PFFS plans H8145-055/163, Gold Plus H6622-037, HumanaChoice H5525-051 and Giveback H5525-085 are gone. New: Dual Select H6622-103 (D-SNP), Total Complete (HMO), Value Choice (PPO), Essentials Plus Giveback (PPO).",
            SRC.cmsLandscape2027
          ),
          info(
            "MD county exits: Baltimore City, Carroll, Garrett, Worcester.",
            SRC.cmsLandscape2027
          ),
        ],
      },
      {
        id: "example-plan",
        title: "Example: H7617-127 Giveback PPO (NJ)",
        notes: [
          plan(
            "**This plan only:** $0 premium, Part B reduction **up to $26/mo**, $380 medical deductible, Part D $0 for Tiers 1-2 / $700 for Tiers 3-5.",
            SRC.humanaSbH7617127
          ),
          plan(
            "**This plan only:** no OTC allowance listed. Go365 rewards and SilverSneakers are included. Other Humana NJ plans differ.",
            SRC.humanaSbH7617127
          ),
        ],
      },
      {
        id: "card",
        title: "Humana Spending Account Card",
        notes: [
          plan(
            "Holds **up to three** allowances: Healthy Options, OTC and Flex (dental/vision/hearing). Which ones apply depends on the plan.",
            SRC.humanaSpendingCard
          ),
          SSBCI_2027_NOTE,
          PART_D_2027_NOTE,
        ],
      },
    ],
  },
  {
    id: "aetna",
    label: "Aetna",
    handleLabel: "AETNA",
    popupTitle: "AETNA QUICK REFERENCE",
    aliases: ["aetna"],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "whats-new",
        title: "What's new for 2027",
        notes: [
          plan(
            "Every Aetna MA county has **at least one $0-premium plan** and **at least one plan with an OTC allowance**.",
            SRC.aetnaRelease2027
          ),
          plan(
            "**High Value Provider Incentive:** picking a designated high-value PCP adds funds to the Extra Benefits Card on eligible plans. Expanding to 2 more states in 2027.",
            SRC.aetnaRelease2027
          ),
          info(
            "Renewed **HMO focus**: Prime HMO expands in select markets, and C-SNPs reach 6 new states (25 total).",
            SRC.aetnaRelease2027
          ),
          info(
            "**Maryland exit:** no Aetna MA plans in Frederick, Harford or Montgomery for 2027. FL drops Alachua, Baker, Columbia, Levy.",
            SRC.cmsLandscape2027
          ),
          info(
            "NJ: Signature (PPO) and Signature (Regional PPO) are gone. New: **Medicare Enhanced (Regional PPO)**. PA lineup is heavily renamed (Elite PPO, Premier Plus PPO, Signature HMO-POS family, Dual / Full Dual D-SNPs).",
            SRC.cmsLandscape2027
          ),
        ],
      },
      {
        id: "card",
        title: "Extra Benefits Card (CVS Flex Benefits)",
        notes: [
          plan(
            "One card for all card-based allowances on **select plans**. Usable at participating stores including CVS.",
            SRC.aetnaRelease2027
          ),
          plan(
            "All C-SNP and D-SNP members get a **monthly OTC allowance**. Members with a qualifying chronic condition can also use it for groceries, personal care, transportation and utilities.",
            SRC.aetnaRelease2027
          ),
          plan(
            "All plans: $0 Tier 1 at preferred pharmacies, dental/vision/hearing, SilverSneakers basic, annual Signify Healthy Home Visit.",
            SRC.aetnaRelease2027
          ),
          SSBCI_2027_NOTE,
          PART_D_2027_NOTE,
        ],
      },
    ],
  },
  {
    id: "uhc",
    label: "UnitedHealthcare",
    handleLabel: "UHC",
    popupTitle: "UNITEDHEALTHCARE QUICK REFERENCE",
    aliases: ["unitedhealthcare", "united healthcare", "uhc"],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "two-cards",
        title: "NEW 2027: Separate Member ID + UCard",
        notes: [
          info(
            "Members get **two cards in separate mailings** before January 2027: a **Member ID card** and a new **UCard (Mastercard)**.",
            SRC.uhcUcard2027
          ),
          info(
            "Use the **Member ID card** at doctors and pharmacies. The UCard is not needed there. The UCard is only for allowances and rewards.",
            SRC.uhcUcard2027
          ),
          info(
            "Keep using the old UCard **through Dec 31, 2026**, then dispose of it once the new card is activated. Rewards balances carry over. Rewards-only plans mail the UCard after the first reward is earned.",
            SRC.uhcUcard2027
          ),
          info(
            "The same UCard can be kept for up to **3 years**. A digital UCard is available in the UHC app.",
            SRC.uhcUcard2027
          ),
        ],
      },
      {
        id: "credits",
        title: "UCard credits",
        notes: [
          plan(
            "OTC, healthy food and utility credits depend on the plan. **Food and utilities may require eligibility verification.**",
            SRC.uhcUcard2027
          ),
          plan(
            "New: **real-time utility payments** for qualifying D-SNP members. Accepted at 70,000+ stores (Walmart, Dollar General, Target).",
            SRC.uhcRelease2027
          ),
          SSBCI_2027_NOTE,
        ],
      },
      {
        id: "market",
        title: "NJ / PA changes",
        notes: [
          info(
            "**Erickson Advantage** plans (6) end in NJ and PA. PA: UHC Dual Complete PA-V001 becomes **UHC Dual Advantage PA-V1**. New: AARP MA PA-19 (HMO-POS), Complete Care NJ-8 / Support PA-1A (C-SNP).",
            SRC.cmsLandscape2027
          ),
          info(
            "Non-renewal notices are dated **Oct 2, 2026**. Affected members who return to Original Medicare have an SEP **through Feb 28, 2027**.",
            SRC.uhcSar2027
          ),
          info(
            "MD 2027 lineup is **D-SNP and I-SNP only** (3 plans, down from 9).",
            SRC.cmsLandscape2027
          ),
          PART_D_2027_NOTE,
        ],
      },
    ],
  },
  {
    id: "anthem",
    label: "Anthem / Elevance / Wellpoint",
    handleLabel: "ANTHEM",
    popupTitle: "ANTHEM / ELEVANCE QUICK REFERENCE",
    aliases: ["anthem", "elevance", "wellpoint"],
    status: POPUP_STATUS.PENDING,
    sections: [
      {
        id: "footprint",
        title: "2027 footprint (CMS landscape)",
        notes: [
          info(
            "NJ is branded **Wellpoint**: Extra Help (HMO, **new**), Full Dual Advantage (HMO D-SNP), Kidney Care (HMO-POS C-SNP). Full Dual Advantage Secure (HMO-POS D-SNP) is gone.",
            SRC.cmsLandscape2027
          ),
          info(
            "FL shrinks to **SNP-heavy HMOs**: 63 plans in 2026 to 14 in 2027. GA adds Camden, Gordon, Walker, Whitfield.",
            SRC.cmsLandscape2027
          ),
        ],
      },
      {
        id: "card",
        title: "Benefits Prepaid Card (2026 content, 2027 pending)",
        notes: [
          plan(
            "Wellpoint NJ plans list a **Benefits Prepaid Card**. Categories (food, OTC, utilities, DVH flex) depend on the plan.",
            SRC.wellpointNj
          ),
          SSBCI_2027_NOTE,
          info(
            "Members use the **Sydney Health** app for ID cards, Find Care and claims.",
            SRC.wellpointNj
          ),
        ],
      },
    ],
  },
  {
    id: "braven",
    label: "Braven",
    handleLabel: "BRAVEN",
    popupTitle: "BRAVEN HEALTH QUICK REFERENCE",
    aliases: ["braven", "braven health"],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "exit",
        title: "NOT OFFERED IN 2027",
        notes: [
          info(
            "**Braven Health MA plans end Dec 31, 2026.** Do not enroll anyone in Braven for 2027. CMS lists no Braven plans for 2027.",
            SRC.bravenExit
          ),
          info(
            "Members received a **non-renewal letter** in early October. They choose a new plan from **Oct 15** for a Jan 1, 2027 start. A non-renewal SEP applies, so confirm dates from the letter.",
            SRC.bravenTransition
          ),
          info(
            "The **Horizon Managed Care Network continues**. Braven will not cover any service dated in 2027, including already-scheduled procedures.",
            SRC.bravenExit
          ),
        ],
      },
      {
        id: "who",
        title: "Who Braven is (and isn't)",
        notes: [
          info(
            "Braven was an **NJ-only** joint venture of **Horizon BCBSNJ** with Hackensack Meridian and RWJBarnabas. It is **not** Independence Blue Cross (PA). Use the IBC popup for IBX.",
            SRC.bravenExit
          ),
          info(
            "Horizon's own 2027 NJ MA plans are **SNP-only**: Horizon NJ TotalCare (HMO D-SNP), Horizon Specialty Care (HMO C-SNP, 7 north NJ counties).",
            SRC.cmsLandscape2027
          ),
        ],
      },
    ],
  },
  {
    id: "ibc",
    label: "Independence Blue Cross (IBX)",
    handleLabel: "IBC",
    popupTitle: "INDEPENDENCE BLUE CROSS QUICK REFERENCE",
    aliases: [
      "independence blue cross",
      "independence",
      "ibx",
      "ibc",
      "keystone 65",
      "personal choice 65",
      "amerihealth medicare",
    ],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "whats-new",
        title: "What's new for 2027",
        notes: [
          info(
            "**Southeastern PA only**: Bucks, Chester, Delaware, Montgomery, Philadelphia. IBX is a separate BCBS company from Horizon/Braven (NJ).",
            SRC.cmsLandscape2027
          ),
          plan(
            "**New: Keystone 65 Assured HMO**, a **$0-premium** option.",
            SRC.ibxRelease2027
          ),
          plan(
            "**Keystone 65 Select HMO**: low MOOP and **no Part D deductible**.",
            SRC.ibxRelease2027
          ),
          info(
            "Lineup: Keystone 65 HMO and HMO-POS plus Personal Choice 65 PPO. **Personal Choice 65 Plus Rx (PPO) is gone.**",
            SRC.cmsLandscape2027
          ),
        ],
      },
      {
        id: "card",
        title: "IBX Care Card",
        notes: [
          plan(
            "One card for **healthy rewards** (up to $300/yr) and, on **eligible plans**, OTC (up to $300/yr, $75/quarter).",
            SRC.ibxRelease2027
          ),
          plan(
            "$0 copays on select drugs at preferred pharmacies, 100-day supply on select meds, $0 telemedicine. Dental/vision/hearing on **select plans**.",
            SRC.ibxRelease2027
          ),
          PART_D_2027_NOTE,
        ],
      },
      {
        id: "nj-affiliate",
        title: "AmeriHealth (NJ affiliate)",
        notes: [
          info(
            "IBX sells NJ MA as **AmeriHealth Medicare** in 7 counties (Atlantic, Burlington, Camden, Gloucester, Mercer, Middlesex, Ocean). 2027: Classic Rx (HMO, new) and Core (PPO). Enhanced and Ultimate PPO are gone.",
            SRC.cmsLandscape2027
          ),
          info("Sales line: **1-877-393-6733** (TTY 711).", SRC.ibxRelease2027),
        ],
      },
    ],
  },
  {
    id: "clover",
    label: "Clover",
    handleLabel: "CLOVER",
    popupTitle: "CLOVER QUICK REFERENCE",
    aliases: ["clover", "clover health"],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "whats-new",
        title: "What's new for 2027",
        notes: [
          info(
            "**PPO-first carrier; NJ is a core market.** NJ: 20 counties (not Warren). PA: Bucks, Delaware, Philadelphia (PPO).",
            SRC.cmsLandscape2027
          ),
          info(
            "NJ HMOs (Classic, Value) are only in Atlantic, Bergen, Essex, Hudson, Passaic and Union (Value also in Middlesex). Everywhere else, present the **Choice / Choice Giveback / Choice Value / Valor PPOs**.",
            SRC.cmsLandscape2027
          ),
          plan(
            "$0 PCP copays, $0 labs at preferred providers, and routine dental, vision, OTC and gym on all plans. Allowance and giveback amounts vary by plan.",
            SRC.cloverRelease2027
          ),
          plan(
            "**Valor PPO** includes a monthly Part B giveback. Confirm the amount in the plan's SB.",
            SRC.cloverRelease2027
          ),
          plan(
            "NJ Part D deductibles **went up for 2027** on most Clover plans. Quote the exact amount from the SB.",
            SRC.cmsLandscape2027
          ),
        ],
      },
    ],
  },
  {
    id: "zing",
    label: "Zing",
    handleLabel: "ZING",
    popupTitle: "ZING HEALTH QUICK REFERENCE",
    aliases: ["zing", "zing health"],
    status: POPUP_STATUS.PENDING,
    sections: [
      {
        id: "footprint",
        title: "2027 footprint (CMS landscape)",
        notes: [
          info(
            "2027 states: **IL, IN, MI, MS, OH, TN**. **No plans in NJ, PA, DE, MD, FL, GA or VA.**",
            SRC.cmsLandscape2027
          ),
          info(
            "Carrier 2027 benefit documents were not public on myzinghealth.com when checked, so the content below is 2026.",
            SRC.zingPlans
          ),
        ],
      },
      {
        id: "otc",
        title: "OTC Benefit Card (2026 content)",
        notes: [
          plan(
            "Quarterly OTC allowance on participating plans. **No rollover** between quarters.",
            SRC.zingPlans
          ),
          plan(
            "C-SNP options for diabetes and heart conditions in select markets.",
            SRC.zingPlans
          ),
          SSBCI_2027_NOTE,
        ],
      },
    ],
  },
  {
    id: "healthspring",
    label: "Cigna / HealthSpring",
    handleLabel: "CIGNA",
    popupTitle: "HEALTHSPRING QUICK REFERENCE",
    aliases: ["healthspring", "cigna", "cigna medicare"],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "whats-new",
        title: "What's new for 2027",
        notes: [
          info(
            "**NJ cut to 3 counties**: Burlington, Camden, Gloucester (was 20). Plans: HealthSpring Preferred (HMO), True Choice (PPO).",
            SRC.cmsLandscape2027
          ),
          info(
            "Other exits: PA (Crawford, Mercer, Venango), DE (Sussex), FL (12 counties incl. Miami-Dade, Broward, Palm Beach, Duval), GA (Bryan, Chatham, Effingham, Harris, Muscogee, Troup).",
            SRC.cmsLandscape2027
          ),
          info(
            "Formerly Cigna Medicare (HCSC). Broker tools may still say **Cigna**.",
            SRC.healthspringRelease2027
          ),
        ],
      },
      {
        id: "benefits",
        title: "Benefits",
        notes: [
          plan(
            "**Healthy grocery allowance** (quarterly) on all D-SNPs and most C-SNPs for **eligible members**. The amount varies by plan.",
            SRC.healthspringRelease2027
          ),
          plan(
            "Healthy-activity incentives: SNPs up to $500, other MA up to $300 (up $100). New 2027 activities: vaccines, bone density screening, advance care planning.",
            SRC.healthspringRelease2027
          ),
          plan(
            "Dental, vision and hearing on **all MA HMO plans**. PPO coverage varies.",
            SRC.healthspringRelease2027
          ),
          SSBCI_2027_NOTE,
          PART_D_2027_NOTE,
        ],
      },
    ],
  },
  {
    id: "wellcare",
    label: "Wellcare",
    handleLabel: "WELLCARE",
    popupTitle: "WELLCARE QUICK REFERENCE",
    aliases: ["wellcare", "well care"],
    status: POPUP_STATUS.CURRENT,
    sections: [
      {
        id: "whats-new",
        title: "What's new for 2027",
        notes: [
          info(
            "NJ (20 counties, not Hunterdon): **Assist (HMO-POS)**, **Low Premium (HMO-POS)**, **Fidelis Dual Align (HMO D-SNP)**. Giveback, Simple and Patriot Simple are **gone**.",
            SRC.cmsLandscape2027
          ),
          info(
            "PA: Assist and Patriot Giveback are gone. D-SNPs are renamed **Wellcare PA Health & Wellness Dual Liberty Sync / Dual Select**.",
            SRC.cmsLandscape2027
          ),
          info(
            "FL drops from 66 to 36 counties (Panhandle and North FL exits).",
            SRC.cmsLandscape2027
          ),
          plan(
            "New **Brass** and **Amber** dental options on select plans.",
            SRC.wellcareRelease2027
          ),
        ],
      },
      {
        id: "spendables",
        title: "Wellcare Spendables Card",
        notes: [
          plan(
            "Covers OTC items and qualified dental/vision/hearing expenses, depending on the plan.",
            SRC.wellcareRelease2027
          ),
          plan(
            "Healthy food and other SSBCI items are **only for members who meet CMS SSBCI criteria** on plans that offer them.",
            SRC.wellcareRelease2027
          ),
          SSBCI_2027_NOTE,
          PART_D_2027_NOTE,
        ],
      },
    ],
  },
];

export const CARRIER_REFERENCE_POPUPS_BY_ID = Object.fromEntries(
  CARRIER_REFERENCE_POPUPS.map((popup) => [popup.id, popup])
);
