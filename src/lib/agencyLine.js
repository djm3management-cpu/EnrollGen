// Shared display source for the dialer and enrollment closing. Never use an agent DID.
export const AGENCY_LINE_LABEL = "NGHS MAIN DID";
export const AGENCY_LINE_NUMBER = "+16098065996";
export function formatAgencyPhone(number=AGENCY_LINE_NUMBER){
 const digits=String(number).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
 return /^(\d{10})$/.test(digits)?`(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`:'';
}
