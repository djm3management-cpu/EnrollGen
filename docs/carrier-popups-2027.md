# Carrier reference popups for PY2027

Checked on **2026-10-10**. The popup content is in `src/components/ancillary/carrierReferencePopupData.js` and is rendered by `CarrierReferencePopupManager.jsx`. `tests/carrier-popups-2027.test.js` enforces the rules below.

## What changed in the code

- **IBC is split out.** Independence Blue Cross (IBX) now has its own popup (`id: "ibc"`). IBX serves Southeastern PA and sells in NJ as AmeriHealth. Braven Health was an NJ-only joint venture of Horizon BCBSNJ, Hackensack Meridian and RWJBarnabas. The two popups have no aliases in common. There are now 11 carriers.
- The data file is now plain JS (`.js` instead of `.jsx`). Each note is `{ text, planSpecific, source }`:
  - Benefit notes carry `planSpecific: true` and show a **Plan-specific** tag.
  - Every note includes the URL of its source.
  - A dollar amount can only appear in a plan-specific note. The test enforces this.
- Every popup shows a status badge, either `PY2027 · checked 2026-10-10` or `2027 pending · checked 2026-10-10`. Every popup also shows this footer: *"Verify in the 2027 Summary of Benefits / EOC for the caller's plan and county"*.
- Sections now open with **What's new for 2027**, followed by benefit details.
- Removed stale or unverifiable claims:
  - Devoted "Month 1→2 rollover". Both the 2026 and 2027 Devoted pages say no rollover.
  - UHC "95% of D-SNP members verified" and "65,000+ stores". The 2027 figure is 70,000+.
  - Anthem "pulled from broker platforms May 2025".
  - Wellcare rent/home-improvement categories and the activation phone number.
  - Humana fax and phone numbers.
  - Zing state list. It was missing MS and TN.

## Cross-carrier 2027 rules applied

| Rule | Source |
|---|---|
| SSBCI: plans must verify eligibility with objective criteria and post those criteria publicly. Benefit debit cards must verify eligible items through a **real-time identification mechanism at the point of sale** and must be **limited to the specific plan year**. | [CMS CY2027 MA/Part D final rule fact sheet](https://www.cms.gov/newsroom/fact-sheets/contract-year-2027-medicare-advantage-part-d-final-rule) |
| Part D out-of-pocket cap is $2,400 in 2027, up from $2,100. | [Humana: Part D changes 2027](https://www.humana.com/medicare/medicare-resources/medicare-part-d-changes) |
| Part D deductibles: the highest value in the CMS landscape is $700 for 2027, compared with $615 for 2026. Deductibles vary by plan, so the popups never present one as universal. | [CMS CY2027 landscape](https://www.cms.gov/files/zip/cy2027-landscape-202609-1.zip), [CMS CY2026 landscape](https://www.cms.gov/files/zip/cy2026-landscape-202609.zip) |

The county and plan-name diffs below compare the two official CMS landscape files: CY2026 (Sept 2026 release) and CY2027 (`cy2027_landscape_202609.1`). PDP and Cost rows are excluded. The comparison only read the local CY2027 extract. No ingest script or table was touched.

## Per carrier

### Devoted — live (2027)
- **New to NJ.** 14 counties: Burlington, Camden, Essex, Gloucester, Hudson, Mercer, Monmouth, Morris, Ocean, Salem, Somerset, Sussex, Union, Warren. Part of a 5-state, 342-county expansion. Sources: [service area](https://www.devoted.com/service-area/), [Oct 2026 release](https://www.devoted.com/resources/new-funding-growth-oct-2026/).
- NJ plans are PPO and PPO C-SNP only. There are 6 plans, and the CMS landscape lists all 6 at a $0 premium.
- PA grows from 53 to 57 counties (adds Bradford, Cameron, Montour, Tioga). New Giveback Extras HMOs and C-SNPs. C-SNP Premium plans are renamed Enhanced. Choice Premium 002 PPO is dropped. Source: CMS landscape.
- FL adds 11 counties, GA adds 20, VA adds 7. Source: CMS landscape.
- **Food & Home Card (SSBCI):** only on certain plans, and only for chronically ill members who qualify. Members check status in MyDevoted. It loads on the 1st of each month with no rollover. It covers food, utilities, internet and rent. **2027 change:** the companion app is now CVS Flex Benefits (OTC Health Solutions in 2026). Sources: [2027 page](https://devoted.com/food-and-home/), [2026 page](https://devoted.com/2026-food-and-home).

### Humana — live (2027)
- C-SNPs expand into PA, UT and WI. New $0 in-network routine labs. Core benefits are being standardized across the portfolio. Source: [Humana 2027 release, Oct 1 2026](https://news.humana.com/press-room/press-releases/2026/humana-maintains-affordable-medicare-advantage-plans-and-expands).
- NJ: 21 counties (adds Sussex). New plan: HumanaChoice Giveback H7617-127 (PPO).
- PA changes:
  - Dropped: PFFS H8145-055/163, Gold Plus H6622-037, HumanaChoice H5525-051, Giveback H5525-085.
  - Added: Dual Select H6622-103 (D-SNP), Total Complete (HMO), Value Choice (PPO), Essentials Plus Giveback (PPO), HumanaChoice - Diabetes and Heart (PPO C-SNP).
- MD drops Baltimore City, Carroll, Garrett and Worcester. Source: CMS landscape.
- Example from the 2027 SB for H7617-127 (NJ):
  - $0 premium.
  - Part B reduction up to $26/mo.
  - $380 medical deductible.
  - Part D: $0 for Tiers 1–2, $700 for Tiers 3–5.
  - MOOP: $8,250 in-network, $9,000 combined.
  - No OTC allowance listed. Go365 rewards and SilverSneakers are included.
  - Source: [H7617-127 2027 SB](https://assets.humana.com/is/content/humana/H7617127000SB27pdf).
- The Spending Account Card holds up to three allowances: Healthy Options, OTC and Flex (DVH). Source: [Humana](https://www.humana.com/medicare/medicare-programs/spending-account-card).

### Aetna — live (2027)
- Every county with Aetna MA has at least one $0-premium plan and at least one plan with an OTC allowance.
- All plans include $0 Tier 1 at preferred pharmacies, DVH, SilverSneakers basic and a Signify Healthy Home Visit.
- The Extra Benefits Card runs on CVS Flex Benefits.
- The High Value Provider Incentive Program expands to 2 more states.
- Prime HMO expands. C-SNPs reach 6 new states (25 total).
- All C-SNP and D-SNP members get a monthly OTC allowance. Members who qualify as chronically ill can also use it for groceries, personal care, transportation and utilities.
- Source for the bullets above: [Aetna 2027 release, Oct 3 2026](https://www.cvshealth.com/news/medicare/aetna-2027-medicare-plans-offer-reliable-affordable-access-to-care-member-support.html).
- **MD exit:** no Aetna MA plans in Frederick, Harford or Montgomery.
- FL drops Alachua, Baker, Columbia and Levy.
- NJ: Signature PPO and Signature Regional PPO are gone. Enhanced (Regional PPO) is new.
- PA: lineup heavily renamed. Added: Elite PPO, Premier Plus PPO, Signature HMO-POS family, Dual / Full Dual D-SNPs. Dropped: Advantra Premier, Premier, Value Care, PinnacleHealth Prime and the old Dual D-SNPs.
- Source for the footprint changes: CMS landscape.

### UnitedHealthcare — live (2027)
- **New separate Member ID card plus a new UCard (Mastercard).**
  - The cards arrive in separate mailings before January 2027.
  - The Member ID card is used at providers and pharmacies.
  - Members keep using the old UCard through Dec 31, 2026.
  - Rewards balances carry over.
  - Rewards-only plans mail the UCard after the first reward is earned.
  - A UCard can be kept for up to 3 years.
  - Food and utilities may require eligibility verification.
  - Source: [UHC UCard changes](https://www.uhc.com/news-articles/medicare-articles/ucard-changes).
- Real-time utility payments for qualifying D-SNP members. 70,000+ retail locations. $0 PCP, $0 preventive and $0 Tier 1 for all members. Source: [UHC 2027 release, Oct 1 2026](https://www.uhc.com/news-articles/newsroom/medicare-advantage-plans-2027).
- Non-renewal notices are dated Oct 2, 2026. Affected members can enroll Oct 15 – Dec 31 for Jan 1. Members who return to Original Medicare get an SEP through Feb 28, 2027. Source: [UHC 2027 service area reduction FAQ](https://www.uhcprovider.com/content/dam/provider/docs/public/health-plans/medicare/2027/2027-MED-ADV-Service-Area-Reductions-Provider-FAQs.pdf).
- NJ/PA changes (CMS landscape):
  - Erickson Advantage (6 plans) ends.
  - PA Dual Complete V001 becomes Dual Advantage PA-V1.
  - New: AARP MA PA-19 (HMO-POS), Complete Care NJ-8 (C-SNP), Complete Care Support PA-1A (C-SNP).
  - NJ goes from 17 plans to 12. All 21 counties are kept.
- MD 2027 is D-SNP and I-SNP only (3 plans, down from 9). Source: CMS landscape.

### Anthem / Elevance / Wellpoint — **2027 pending** (checked 2026-10-10)
- No Elevance 2027 MA press release or 2027 benefit documents were found on official sites. The [Wellpoint NJ page](https://www.wellpoint.com/nj/medicare/medicare-advantage-plans) is open for 2027 shopping and lists a Benefits Prepaid Card.
- Footprint from the CMS landscape:
  - NJ Wellpoint plans: Extra Help (HMO, new), Full Dual Advantage (HMO D-SNP), Kidney Care (HMO-POS C-SNP). Full Dual Advantage Secure is dropped.
  - FL goes from 63 plans to 14, now mostly SNP and HMO.
  - GA adds 4 counties.
  - No PA, DE or MD plans.

### Braven Health — live (2027 exit)
- **Braven MA plans are not offered in 2027.** Plans end Dec 31, 2026. Members got non-renewal letters in early October and should choose a new plan from Oct 15. The Horizon Managed Care Network continues. Braven won't cover services dated in 2027. Sources: [Horizon notice](https://www.horizonblue.com/providers/news/news-legal-notices/braven-health-plans-will-not-be-offered-2027), [Braven transition page](https://www.bravenhealth.com/2026/members/transition-resources).
  - Both pages block automated fetches (Incapsula). The details above come from their indexed text.
- The CMS CY2027 landscape has **no Braven contract**. In 2026 Braven had 10 plans across all 21 NJ counties.
- Horizon's own 2027 NJ MA plans: Horizon NJ TotalCare (HMO D-SNP, 21 counties) and Horizon Specialty Care (HMO C-SNP, 7 counties).

### Independence Blue Cross (IBX) — live (2027), new entry
- Southeastern PA only: Bucks, Chester, Delaware, Montgomery, Philadelphia.
- New Keystone 65 Assured HMO with a $0 premium.
- Keystone 65 Select HMO has a low MOOP and no Part D deductible.
- IBX Care Card combines up to $300/yr in rewards and up to $300/yr in OTC ($75/quarter) on eligible plans.
- $0 copays on select drugs, 100-day supply on select meds, $0 telemedicine.
- Source for the bullets above: [IBX release, Oct 6 2026](https://news.ibx.com/benefits-coverage/medicare/2027-medicare-enrollment/).
- Personal Choice 65 Plus Rx (PPO) is dropped. Source: CMS landscape.
- NJ affiliate AmeriHealth Medicare (7 counties): Classic Rx (HMO) is new. Enhanced and Ultimate PPO are dropped. Core PPO remains. Source: CMS landscape.

### Clover — live (2027)
- PPO-first. NJ is a core market. Clover lists $0 PCP, $0 labs at preferred providers, and routine dental, vision, OTC and gym on all plans. Valor PPO includes a Part B giveback. Source: [Clover 2027 release](https://investors.cloverhealth.com/news-releases/news-release-details/clover-healths-2027-medicare-advantage-plans-emphasize-ppo).
  - The site returns 403 to automated fetches. The details above come from its indexed text.
- Footprint (CMS landscape):
  - NJ: 20 counties, unchanged. HMOs only in Atlantic, Bergen, Essex, Hudson, Middlesex, Passaic and Union.
  - PA: Bucks, Delaware, Philadelphia.
  - NJ Part D deductibles rose on most plans.

### Zing — **2027 pending** (checked 2026-10-10)
- [myzinghealth.com](https://www.myzinghealth.com/plans) has no 2027 documents yet. The popup keeps the 2026 OTC content under a "2026 content" heading.
- CMS 2027 landscape: IL, IN, MI, MS, OH, TN. **No plans in NJ, PA, DE, MD, FL, GA or VA.**

### HealthSpring (Cigna) — live (2027)
- 450 counties in 24 states. All 2026 $0-premium MA plans are retained.
- DVH on all MA HMOs.
- Quarterly healthy-grocery allowance on all D-SNPs and most C-SNPs for eligible members, ranging $50–$400/quarter by plan.
- Incentives: SNPs up to $500, other MA up to $300 (+$100). New qualifying activities: vaccines, bone density screening, advance care planning.
- Source for the bullets above: [HealthSpring 2027 release, Oct 1 2026](https://www.healthspring.com/newsroom/healthspring-plans-offer-customers-many-options-for-2027).
- **NJ drops from 20 counties to 3:** Burlington, Camden, Gloucester. Plans: Preferred (HMO), True Choice (PPO).
- Other exits:
  - PA: Crawford, Mercer, Venango.
  - DE: Sussex.
  - FL: 12 counties, including Miami-Dade, Broward, Palm Beach and Duval.
  - GA: 6 counties.
- Source for the footprint changes: CMS landscape.

### Wellcare — live (2027)
- The Spendables card covers OTC and qualified DVH expenses. SSBCI healthy foods are only for members who meet CMS criteria. New Brass and Amber dental options. Source: [Wellcare 2027 release, Oct 1 2026](https://investors.centene.com/2026-10-01-Wellcare-Unveils-2027-Medicare-Offerings-Focused-on-Affordability-and-Integrated-Care).
- Footprint (CMS landscape):
  - NJ (20 counties, not Hunterdon): Assist (HMO-POS), Low Premium (HMO-POS), Fidelis Dual Align (HMO D-SNP). Giveback, Simple and Patriot Simple are dropped.
  - PA: Assist and Patriot Giveback are dropped. D-SNPs are renamed "PA Health & Wellness".
  - FL goes from 66 counties to 36.

## Pending list

| Carrier | What is pending | Checked |
|---|---|---|
| Anthem / Elevance / Wellpoint | 2027 carrier benefit documents (card amounts and categories, network notes) | 2026-10-10 |
| Zing | All 2027 carrier documents. Not relevant to NJ/PA/DE/MD/FL/GA/VA in 2027. | 2026-10-10 |
| All carriers | CMS 2027 Part C&D plan crosswalk (old-to-new plan mapping), which is not yet published | 2026-10-10 |

Next AEP refresh: re-check Elevance's newsroom and Wellpoint plan documents, and myzinghealth.com.
