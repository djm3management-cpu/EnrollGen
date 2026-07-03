/*
  Carrier configuration for the SEP Lookup Tool.
  Includes brand colors, product lines, and logo URLs.
  Internal use only — New Gen Health Solutions.
*/

export const CARRIERS = {
  uhc: {
    name: "UnitedHealthcare",
    abbr: "UHC",
    color: "var(--info)",
    logo: "https://logos-world.net/wp-content/uploads/2022/12/UnitedHealthcare-Logo.png",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  aetna: {
    name: "Aetna (CVS Health)",
    abbr: "Aetna",
    color: "var(--chart-4)",
    logo: "https://logos-world.net/wp-content/uploads/2022/02/Aetna-Logo.png",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  bcbs: {
    name: "Blue Cross Blue Shield",
    abbr: "BCBS",
    color: "var(--info)",
    logo: "https://logos-world.net/wp-content/uploads/2023/01/Blue-Cross-Blue-Shield-Logo.png",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  cigna: {
    name: "Cigna Healthcare",
    abbr: "Cigna",
    color: "var(--accent)",
    logo: "https://logos-world.net/wp-content/uploads/2022/01/Cigna-Logo.png",
    products: ["MA", "MAPD", "PDP"],
  },
  humana: {
    name: "Humana",
    abbr: "Humana",
    color: "var(--status-live)",
    logo: "https://logos-world.net/wp-content/uploads/2022/02/Humana-Logo.png",
    products: ["MA", "MAPD", "PDP", "Medigap"],
  },
  wellcare: {
    name: "Wellcare (Centene)",
    abbr: "Wellcare",
    color: "var(--info)",
    logo: "https://logos-world.net/wp-content/uploads/2023/09/WellCare-Logo.png",
    products: ["MA", "MAPD", "PDP"],
  },
  molina: {
    name: "Molina Healthcare",
    abbr: "Molina",
    color: "var(--danger)",
    logo: "https://logos-world.net/wp-content/uploads/2023/09/Molina-Healthcare-Logo.png",
    products: ["MA", "MAPD"],
  },
  devoted: {
    name: "Devoted Health",
    abbr: "Devoted",
    color: "var(--warning)",
    logo: "https://www.devoted.com/static/media/devoted-logo.svg",
    products: ["MA", "MAPD"],
  },
  alignment: {
    name: "Alignment Health",
    abbr: "Alignment",
    color: "var(--status-live)",
    logo: "https://www.alignmenthealthcare.com/hubfs/alignment-health-plan-logo.svg",
    products: ["MA", "MAPD"],
  },
  kaiser: {
    name: "Kaiser Permanente",
    abbr: "Kaiser",
    color: "var(--info)",
    logo: "https://logos-world.net/wp-content/uploads/2023/01/Kaiser-Permanente-Logo.png",
    products: ["MA", "MAPD"],
  },
  mutual: {
    name: "Mutual of Omaha",
    abbr: "MutualOmaha",
    color: "var(--text-secondary)",
    logo: "https://logos-world.net/wp-content/uploads/2023/03/Mutual-of-Omaha-Logo.png",
    products: ["Medigap"],
  },
};
