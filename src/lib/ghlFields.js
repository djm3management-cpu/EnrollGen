// Explicit wire contracts. New intake/call fields are private unless reviewed here.
export const GHL_INTAKE_FIELDS = Object.freeze([
  'planType','zip','firstName','lastName','phone','email','state','medicaid',
  'prevCarrier','newCarrier','planName','enrollCode','premium','sunfireCode',
  'effectiveDate','sixtyDayDate','sep','contractId','planId','segmentId',
  'enrollmentId','pcpName','agency','aor','assignedUserId','assignedTo','hra','hraDate','submittedAt',
]);
export const GHL_POST_CALL_FIELDS = Object.freeze([
  'firstName','lastName','phone','email','state','medicaid','prevCarrier','newCarrier',
  'enrollCode','premium','sunfireCode','effectiveDate','sixtyDayDate','sep','agency',
  'aor','assignedUserId','hra','hraDate','submittedAt',
]);
export function allowlistedGhlPayload(payload, fields = GHL_INTAKE_FIELDS) {
  return Object.fromEntries(fields.filter(key => Object.hasOwn(payload, key)).map(key => [key, payload[key]]));
}
