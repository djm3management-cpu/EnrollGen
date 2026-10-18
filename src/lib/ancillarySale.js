export const ANCILLARY_PRODUCT_OPTIONS = [
  { value: 'hospital_indemnity', label: 'Hospital Indemnity' },
  { value: 'dental_vision', label: 'Dental / Vision' },
  { value: 'final_expense', label: 'Final Expense' },
  { value: 'cancer', label: 'Cancer' },
  { value: 'accident', label: 'Accident' },
];

export function ancillarySaleError(outcome, productType) {
  return outcome === 'sale_ancillary' && !ANCILLARY_PRODUCT_OPTIONS.some(option => option.value === productType)
    ? 'Select a product type for Sale - Ancillary.' : '';
}

// Both fields must be saved together, including when changing away from a sale.
export function buildCallOutcomePatch(outcome, productType) {
  const error = ancillarySaleError(outcome, productType);
  if (error) throw new Error(error);
  return { call_outcome: outcome, ancillary_product_type: outcome === 'sale_ancillary' ? productType : null };
}
