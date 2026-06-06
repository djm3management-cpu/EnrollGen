export const FLOW_TYPE = "ancillary";

export const SUB_PRODUCT = Object.freeze({
  HIP: "hip",
  FE: "fe",
  DVH: "dvh",
  ANNUITY: "annuity",
});

export const ANNUITY_MODE = Object.freeze({
  INBOUND: "inbound",
  OUTBOUND: "outbound",
});

export const ANCILLARY_ACCENT = Object.freeze({
  color: "#3B82F6",
  rgb: "59,130,246",
  soft: "rgba(59,130,246,0.08)",
  border: "rgba(59,130,246,0.28)",
});

export const ANCILLARY_PRODUCT_META = Object.freeze({
  [SUB_PRODUCT.HIP]: {
    label: "Hospital Indemnity",
    shortLabel: "HIP",
    route: "/script/ancillary/hip",
    description: "Cash benefit positioning, rider review, and close.",
  },
  [SUB_PRODUCT.FE]: {
    label: "Final Expense",
    shortLabel: "FE",
    route: "/script/ancillary/fe",
    description: "Senior benefit opening, health pre-qual, and 3-option close.",
  },
  [SUB_PRODUCT.DVH]: {
    label: "Dental / Vision / Hearing",
    shortLabel: "DVH",
    route: "/script/ancillary/dvh",
    description: "Fact find, coverage gap build, waiting periods, and close.",
  },
  [SUB_PRODUCT.ANNUITY]: {
    label: "Annuity",
    shortLabel: "ANN",
    route: "/script/ancillary/annuity",
    description: "NAIC best-interest intake, recommendation, disclosures, and e-app.",
  },
});

export function isAncillarySubProduct(value) {
  return Object.values(SUB_PRODUCT).includes(value);
}
