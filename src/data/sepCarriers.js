/*
  Carrier configuration for the SEP Lookup Tool.
  Includes brand colors and product lines. Carrier names and color badges
  render locally; third-party logo hotlinks are intentionally not used.
  Internal use only — New Gen Health Solutions.
*/

export const CARRIERS = {
  uhc: {
    name: "UnitedHealthcare",
    abbr: "UHC",
    color: "var(--info)",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  aetna: {
    name: "Aetna (CVS Health)",
    abbr: "Aetna",
    color: "var(--chart-4)",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  bcbs: {
    name: "Blue Cross Blue Shield",
    abbr: "BCBS",
    color: "var(--info)",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  cigna: {
    name: "Cigna Healthcare",
    abbr: "Cigna",
    color: "var(--accent)",
    products: ["MA", "MAPD", "PDP"],
  },
  humana: {
    name: "Humana",
    abbr: "Humana",
    color: "var(--status-live)",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  wellcare: {
    name: "Wellcare (Centene)",
    abbr: "Wellcare",
    color: "var(--info)",
    products: ["MA", "MAPD", "PDP"],
  },
  molina: {
    name: "Molina Healthcare",
    abbr: "Molina",
    color: "var(--danger)",
    products: ["MA", "MAPD"],
  },
  devoted: {
    name: "Devoted Health",
    abbr: "Devoted",
    color: "var(--warning)",
    products: ["MA", "MAPD"],
  },
  alignment: {
    name: "Alignment Health",
    abbr: "Alignment",
    color: "var(--status-live)",
    products: ["MA", "MAPD"],
  },
  kaiser: {
    name: "Kaiser Permanente",
    abbr: "Kaiser",
    color: "var(--info)",
    products: ["MA", "MAPD"],
  },
  mutual: {
    name: "Mutual of Omaha",
    abbr: "MutualOmaha",
    color: "var(--text-secondary)",
    products: ["Medigap"],
  },
};
