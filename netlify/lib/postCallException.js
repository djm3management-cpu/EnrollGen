import {deliveryDiagnostic} from '../../integrations/diagnostics.js';
// Source bodies and provider prose can echo arbitrary names/clinical content.
// Retain bounded machine diagnostics; stack messages and SQL hints are omitted.
export function postCallExceptionDetails(error,seen=new WeakSet()) {
 if(!error || typeof error!=='object')return {message:'request_failed'};
 if(seen.has(error))return '[CIRCULAR]';seen.add(error);
 const result=deliveryDiagnostic(error);
 for(const key of ['status','statusCode'])if(Number.isInteger(error[key]))result[key]=error[key];
 if(error.cause)result.cause=postCallExceptionDetails(error.cause,seen);
 return result;
}
