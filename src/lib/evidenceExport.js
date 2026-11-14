import {evidenceRequest} from './evidenceApi.js';
export function auditEvidenceExport(getToken,target){
 return evidenceRequest(getToken,'evidence-export',{...target,action:'export'});
}
