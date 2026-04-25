export const CARRIER_REFERENCE = [
  {
    carrier: "Devoted Health",
    products: ["MA", "MAPD"],
    states: [
      "FL",
      "AL",
      "AR",
      "IN",
      "KY",
      "MO",
      "NC",
      "NJ",
      "OH",
      "PA",
      "TN",
      "TX",
    ],
    plans: [
      {
        name: "Devoted Giveback",
        type: "HMO",
        highlights: [
          "Part B premium reduction",
          "$0 premium",
          "OTC allowance",
        ],
        network: "HMO — must use in-network providers",
        notes: "Primary NGHS carrier. Majority of MA book.",
      },
    ],
    portal: "https://providers.devoted.com",
    phone: "1-800-338-6833",
  },
  {
    carrier: "Aetna",
    products: ["MA", "MAPD", "Med Sup"],
    states: ["FL", "NJ", "PA", "GA", "VA", "TX", "OH"],
    plans: [
      {
        name: "Aetna Medicare Eagle",
        type: "HMO/PPO",
        highlights: [
          "Broad network",
          "Dental/vision/hearing included",
        ],
        network: "Varies by plan — HMO and PPO options",
        notes: "Co-Op: $150 per new MAPD enrollment",
      },
    ],
    portal: "https://www.aetnamedicare.com",
    phone: "1-888-267-2323",
  },
  {
    carrier: "UnitedHealthcare",
    products: ["MA", "MAPD", "Med Sup", "DSNP"],
    states: ["FL", "NJ", "PA", "GA", "VA", "TX", "NC", "OH", "TN", "IN"],
    plans: [
      {
        name: "UHC Dual Complete",
        type: "DSNP HMO",
        highlights: [
          "$0 premium",
          "OTC + food allowance",
          "Transportation",
        ],
        network: "HMO — Optum network",
        notes: "Strong DSNP product for dual-eligible members",
      },
    ],
    portal: "https://www.uhcprovider.com",
    phone: "1-877-842-3210",
  },
  {
    carrier: "Elevance / Anthem",
    products: ["MA", "MAPD"],
    states: ["VA", "GA", "IN", "OH", "KY"],
    plans: [
      {
        name: "Anthem Blue Cross MediBlue",
        type: "HMO/PPO",
        highlights: [
          "SilverSneakers",
          "Dental/vision",
          "Nurse line",
        ],
        network: "Varies by plan",
        notes: "Co-Op: $125 per new MAPD enrollment",
      },
    ],
    portal: "https://www.anthem.com/medicare",
    phone: "1-855-817-5785",
  },
  {
    carrier: "Cigna / HealthSpring",
    products: ["MA", "MAPD"],
    states: ["FL", "TN", "AL", "TX", "GA", "NC", "SC"],
    plans: [
      {
        name: "Cigna Preferred Medicare",
        type: "HMO",
        highlights: [
          "Dental/vision/hearing",
          "OTC allowance",
        ],
        network: "HMO",
        notes:
          "Co-Op: $225 per new MAPD enrollment. HealthSpring plans being suppressed in some markets.",
      },
    ],
    portal: "https://www.cigna.com/medicare",
    phone: "1-800-668-3813",
  },
  {
    carrier: "Zing Health",
    products: ["MA", "MAPD"],
    states: ["FL", "IN", "MI", "IL"],
    plans: [
      {
        name: "Zing Essential",
        type: "HMO",
        highlights: [
          "$0 premium",
          "Grocery allowance",
          "Transportation",
        ],
        network: "HMO",
        notes: "Co-Op: $200 per new MAPD enrollment",
      },
    ],
    portal: "https://www.myzinghealth.com",
    phone: "1-866-946-4458",
  },
];

export const CARRIER_PRODUCT_FILTERS = [
  { id: "All", label: "All", match: () => true },
  {
    id: "MA",
    label: "MA",
    match: (carrier) =>
      carrier.products.some((product) => /^(MA|MAPD|DSNP)$/i.test(product)),
  },
  {
    id: "Med Sup",
    label: "Med Sup",
    match: (carrier) =>
      carrier.products.some((product) => /med\s*sup/i.test(product)),
  },
  {
    id: "ACA",
    label: "ACA",
    match: (carrier) =>
      carrier.products.some((product) => /aca/i.test(product)),
  },
  {
    id: "U65",
    label: "U65",
    match: (carrier) =>
      carrier.products.some((product) => /u65/i.test(product)),
  },
];
