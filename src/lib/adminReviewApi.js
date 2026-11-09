export const COMPLIANCE_UPLOADS_ENDPOINT='/.netlify/functions/compliance-uploads';
export const PARAGON_RESIDENCE_ENDPOINT='/api/paragon-residence';
export function complianceUploadsUrl(enrollmentType='all'){
 if(!['all','test','real'].includes(enrollmentType))throw new Error('Invalid enrollment type.');
 return `${COMPLIANCE_UPLOADS_ENDPOINT}?${new URLSearchParams({enrollment_type:enrollmentType})}`;
}
export function paragonResidenceUrl(offset=0){
 if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid residence page.');
 return `${PARAGON_RESIDENCE_ENDPOINT}?${new URLSearchParams({offset:String(offset)})}`;
}
