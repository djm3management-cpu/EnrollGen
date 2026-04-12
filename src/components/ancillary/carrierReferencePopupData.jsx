export const CARRIER_REFERENCE_POPUPS = [
  {
    id: "devoted",
    label: "Devoted",
    handleLabel: "DEVOTED",
    popupTitle: "DEVOTED HEALTH QUICK REFERENCE",
    aliases: ["devoted", "devoted health"],
    sections: [
      {
        id: "app",
        title: "Section A: MyDevoted App & Portal",
        notes: [
          <>
            Members manage their plan at <strong>my.devoted.com</strong> or via
            the <strong>MyDevoted</strong> app (App Store / Google Play).
          </>,
          <>
            Features: view benefits, check allowances, find providers, digital
            ID cards, track claims, and monitor spending.
          </>,
          <>
            <strong>
              Remind members to download the app during enrollment for immediate
              access to plan details.
            </strong>
          </>,
        ],
      },
      {
        id: "food",
        title: "Section B: Food Card | Monthly Allowance (SSBCI)",
        notes: [
          <>
            Monthly funds load onto a <strong>prepaid Visa card</strong> on the{" "}
            <strong>1st of each month</strong>.
          </>,
          <>Covers healthy food, utilities, rent, and mortgage.</>,
          <>
            Available on <strong>50%+ of Devoted plans</strong> in 2026; the
            amount varies by plan.
          </>,
          <>
            Eligibility follows CMS SSBCI guidelines; members check status in
            the app or on the website.
          </>,
          <>
            <strong>Funds do not roll over</strong> except from Month 1 to
            Month 2 only.
          </>,
          <>Members keep the same prepaid card year to year.</>,
        ],
      },
    ],
  },
  {
    id: "humana",
    label: "Humana",
    handleLabel: "HUMANA",
    popupTitle: "HUMANA QUICK REFERENCE",
    aliases: ["humana"],
    sections: [
      {
        id: "app",
        title: "Section A: MyHumana App & Portal",
        notes: [
          <>
            Members manage plans at <strong>humana.com</strong> or via the{" "}
            <strong>MyHumana</strong> app (App Store / Google Play).
          </>,
          <>
            Features include benefits review, digital ID card, claims tracking,
            provider search, prescription pricing, and pharmacy management
            through <strong>CenterWell Pharmacy</strong>.
          </>,
        ],
      },
      {
        id: "otc",
        title: "Section B: OTC Allowance (Humana Spending Account Card)",
        notes: [
          <>
            Monthly or quarterly allowance is loaded onto a{" "}
            <strong>Humana Spending Account Card</strong>.
          </>,
          <>
            Members can shop at participating retailers including{" "}
            <strong>CenterWell Pharmacy</strong> or order online.
          </>,
          <>
            Covers OTC health items such as pain relievers, cold medicine,
            vitamins, and first aid supplies.
          </>,
          <>
            Members can check the balance by calling the number on the back of
            the card.
          </>,
          <>
            Mail order option: <strong>CenterWell Pharmacy</strong>, fax{" "}
            <strong>800-379-7617</strong>.
          </>,
          <>
            Member Services: <strong>800-457-4708</strong> (TTY:{" "}
            <strong>711</strong>).
          </>,
        ],
      },
      {
        id: "go365",
        title: "Section C: Go365 Wellness Rewards",
        notes: [
          <>
            Eligible MA members can earn rewards for wellness visits,
            screenings, fitness tracking, volunteering, and health education.
          </>,
          <>
            Rewards are redeemed in the <strong>Go365 Mall</strong> for gift
            cards such as Shell and Walmart.
          </>,
          <>
            Members activate rewards at <strong>Go365.com</strong>.
          </>,
          <>
            Rewards have no cash value, expire on{" "}
            <strong>Dec 31 of the plan year</strong>, and do not roll over.
          </>,
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
    sections: [
      {
        id: "portal",
        title: "Section A: Aetna Member Portal & App",
        notes: [
          <>
            Members can manage plan details through the <strong>Aetna member
            portal</strong> and the <strong>Aetna Health</strong> app.
          </>,
          <>
            Use the portal for digital ID cards, claim status, doctor search,
            and extra-benefit balance lookups when the plan supports them.
          </>,
          <>
            Confirm plan-specific extras inside the Summary of Benefits before
            promising any allowance amount.
          </>,
        ],
      },
      {
        id: "extras",
        title: "Section B: OTC / Flex Benefit Reminder",
        notes: [
          <>
            Many Aetna MA plans include OTC, grocery, dental, transport, or
            other supplemental credits, but availability varies heavily by
            county and plan.
          </>,
          <>
            Use the official plan materials to confirm whether balances are
            monthly, quarterly, or annual.
          </>,
          <>
            If the beneficiary asks about card categories, anchor the answer to
            the exact plan, not the carrier generally.
          </>,
        ],
      },
      {
        id: "agent",
        title: "Section C: Agent Workflow",
        notes: [
          <>
            Enrollment and eligibility checks typically route through{" "}
            <strong>Producer World</strong> and connected broker platforms.
          </>,
          <>
            Verify MBI, election code, and any required SEP documentation
            before you submit.
          </>,
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
    sections: [
      {
        id: "ucard",
        title: "Section A: UCard (All-in-One Member Card)",
        notes: [
          <>
            The <strong>UCard</strong> combines member ID, benefits card, and
            OTC shopping card in one card.
          </>,
          <>
            Members activate at <strong>activate.uhc.com</strong> or through
            the <strong>UHC app</strong> (App Store / Google Play).
          </>,
          <>
            UCard Hub lets members check balance, shop online, find
            participating stores, and track rewards.
          </>,
          <>
            The UHC app includes an in-store product scanner to confirm
            eligible items at checkout.
          </>,
          <>
            There are <strong>65,000+ participating stores</strong>, including
            Walmart, Walgreens, Dollar General, and CVS.
          </>,
        ],
      },
      {
        id: "credits",
        title: "Section B: OTC + Food + Utilities Credit",
        notes: [
          <>Credits load monthly or quarterly depending on the plan.</>,
          <>
            OTC credit is available to all eligible members with no condition
            verification required.
          </>,
          <>
            <strong>2026 SSBCI change:</strong> healthy food and utility bill
            credits now require a verified qualifying chronic condition such as
            diabetes, cardiovascular disease, CHF, high blood pressure, or high
            cholesterol.
          </>,
          <>
            UHC has already verified <strong>95% of eligible D-SNP members</strong>.
          </>,
          <>
            Verification status does <strong>not</strong> transfer if the member
            switches carriers.
          </>,
          <>
            Members can check verification status in the UHC app or member
            site.
          </>,
        ],
      },
      {
        id: "fitness",
        title: "Section C: Renew Active Fitness",
        notes: [
          <>
            <strong>Renew Active</strong> is UHC&apos;s fitness program and has
            replaced SilverSneakers on many plans.
          </>,
          <>
            Benefits can include gym membership, online classes, and brain
            health programs through <strong>BrainHQ</strong>.
          </>,
          <>
            Included on select MA plans, so confirm plan-specific availability
            before presenting it.
          </>,
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
    sections: [
      {
        id: "sydney",
        title: "Section A: Sydney Health App & Portal",
        notes: [
          <>
            Members manage plans at <strong>anthem.com</strong> or in the{" "}
            <strong>Sydney Health</strong> app (App Store / Google Play).
          </>,
          <>
            Features include digital ID card, Find Care provider search with
            personalized matching, claims tracking, formulary lookup, and
            Evidence of Coverage access.
          </>,
          <>
            Telehealth is available through <strong>LiveHealth Online</strong>,
            and premium payments are handled through the Anthem member portal.
          </>,
        ],
      },
      {
        id: "prepaid",
        title: "Section B: Prepaid Benefits Card",
        notes: [
          <>
            Most Elevance MA plans include a prepaid benefits card for healthy
            groceries, prepared meals, utilities, internet, phone bills, and
            OTC health products.
          </>,
          <>The amount varies by plan and state.</>,
          <>Members can shop at participating retailers or order online.</>,
        ],
      },
      {
        id: "agent-alert",
        title: "Section C: 2026 Agent Alert",
        notes: [
          <>
            Elevance prioritized <strong>HMO and D-SNP</strong> plans for 2026,
            cut some PPO offerings, and exited standalone Part D.
          </>,
          <>
            Most standard MA plans were pulled from online broker platforms in{" "}
            <strong>May 2025</strong>.
          </>,
          <>Paper enrollment kits may be required.</>,
          <>D-SNP plans remain accessible on digital platforms.</>,
        ],
      },
    ],
  },
  {
    id: "braven",
    label: "Braven",
    handleLabel: "BRAVEN",
    popupTitle: "BRAVEN QUICK REFERENCE",
    aliases: ["braven", "braven health"],
    sections: [
      {
        id: "portal",
        title: "Section A: Member Access",
        notes: [
          <>
            Use Braven member materials and the carrier portal to confirm
            digital ID cards, provider search, and plan documents after
            enrollment.
          </>,
          <>
            Anchor benefit descriptions to the exact county plan because Braven
            extras vary by market and product.
          </>,
        ],
      },
      {
        id: "market",
        title: "Section B: Market Reminder",
        notes: [
          <>
            Braven is commonly presented in New Jersey markets, so verify
            footprint, network, and any Horizon-linked service details before
            positioning the plan.
          </>,
          <>
            Confirm OTC, flex, dental, and transportation language from the SOB
            rather than carrier-level shorthand.
          </>,
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
    sections: [
      {
        id: "portal",
        title: "Section A: Member Portal",
        notes: [
          <>
            Members can use <strong>cloverhealth.com</strong> resources and plan
            materials for provider lookup, claims review, and member support.
          </>,
          <>
            Confirm whether the beneficiary&apos;s plan includes an app, OTC
            program, or rewards feature before presenting it as a standard
            carrier-wide benefit.
          </>,
        ],
      },
      {
        id: "network",
        title: "Section B: Plan Verification Reminder",
        notes: [
          <>
            Clover plan extras, provider participation, and formulary strength
            are market-specific. Stay with the exact plan documents once the
            enrollment decision is made.
          </>,
          <>
            Reconfirm PCPs, specialists, and pharmacies before submission.
          </>,
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
    sections: [
      {
        id: "portal",
        title: "Section A: Member Portal",
        notes: [
          <>
            Members access plans through the <strong>myzinghealth.com</strong>{" "}
            member portal.
          </>,
          <>
            Features include coverage and plan info, claims, EOB access,
            digital forms, and a paperless option.
          </>,
          <>
            Provider search and a prescription drug cost calculator are
            available on the main site.
          </>,
          <>
            Customer Service: <strong>1-866-946-4458</strong> (TTY:{" "}
            <strong>711</strong>).
          </>,
        ],
      },
      {
        id: "otc",
        title: "Section B: OTC Benefit Card",
        notes: [
          <>
            Members receive a quarterly allowance for OTC health items such as
            vitamins, pain relievers, first aid, and cold medicine.
          </>,
          <>
            Members can use the OTC Benefit card app or order through the
            member portal.
          </>,
          <>Benefit is available at participating retailers.</>,
          <>
            Balance does <strong>not</strong> roll over between quarters, so it
            is use-it-or-lose-it.
          </>,
        ],
      },
      {
        id: "focus",
        title: "Section C: Zing Focus Areas",
        notes: [
          <>
            Zing focuses on underserved communities and social determinants of
            health.
          </>,
          <>
            Available in <strong>IL, IN, MI, and OH</strong>, with expansion
            continuing.
          </>,
          <>
            Offers HMO and PPO plans in Michigan plus C-SNP options for
            Diabetes and Heart conditions.
          </>,
          <>
            It is a smaller carrier, so confirm network availability in the
            beneficiary&apos;s county before presenting it.
          </>,
          <>
            Broker support: <strong>brokers@myzinghealth.com</strong> or{" "}
            <strong>1-844-946-4226</strong>.
          </>,
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
    sections: [
      {
        id: "transition",
        title: "Section A: Brand Transition",
        notes: [
          <>
            <strong>Cigna Healthcare Medicare</strong> officially rebranded to{" "}
            <strong>HealthSpring</strong> after HCSC acquired Cigna&apos;s
            Medicare business in <strong>March 2025</strong>.
          </>,
          <>The plans stayed the same, but the brand name changed.</>,
          <>
            Agent portals and enrollment tools may still reference{" "}
            <strong>Cigna</strong> in some places.
          </>,
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
    sections: [
      {
        id: "spendables",
        title: "Section A: Wellcare Spendables Card",
        notes: [
          <>
            Members get a preloaded monthly allowance for OTC items, healthy
            food, utilities, rent, home improvement, and safety items.
          </>,
          <>
            Members can shop in store at participating retailers, online
            through the member portal, or in the{" "}
            <strong>Healthy Benefits+</strong> app.
          </>,
          <>
            Card activation: <strong>1-833-647-9661</strong>.
          </>,
          <>
            Funds do <strong>not</strong> roll over month to month.
          </>,
        ],
      },
      {
        id: "portal",
        title: "Section B: Member Portal & App",
        notes: [
          <>
            Member login is at <strong>go.wellcare.com</strong>.
          </>,
          <>
            The portal centralizes digital ID cards, formulary search,
            provider and pharmacy lookup, and OTC ordering.
          </>,
          <>
            The <strong>Real Time Benefit Tool</strong> is also available
            through the portal.
          </>,
        ],
      },
      {
        id: "dual-align",
        title: "Section C: D-SNP Dual Align Plans (NJ)",
        notes: [
          <>
            Specifically relevant for the NJ market:{" "}
            <strong>Wellcare Fidelis Dual Align HMO D-SNP</strong> coordinates
            Medicare and Medicaid benefits.
          </>,
          <>
            The Spendables card can cover expanded categories for dual-eligible
            members on these plans.
          </>,
        ],
      },
    ],
  },
];

export const CARRIER_REFERENCE_POPUPS_BY_ID = Object.fromEntries(
  CARRIER_REFERENCE_POPUPS.map((popup) => [popup.id, popup])
);
