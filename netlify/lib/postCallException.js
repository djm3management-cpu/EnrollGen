import {redactSensitiveText} from '../functions/_redaction.js';

// Preserve diagnostic text and complete stacks, but never log SQL row contents,
// beneficiary identifiers or credentials that a storage exception may contain.
function diagnosticText(value) {
  return redactSensitiveText(String(value))
    .replace(/\bBearer\s+\S+|\bsk-[\w-]+|\bsb_secret_[\w-]+/gi,'[SECRET_REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[TOKEN_REDACTED]')
    .replace(/Failing row contains[^\n]*/gi,'Failing row contains [ROW_REDACTED]');
}
const fields=['name','message','stack','code','status','statusCode','details','detail','hint',
  'error','error_description','cause','errors','originalError','errno','syscall',
  'schema','table','column','constraint','routine','severity'];
export function postCallExceptionDetails(error,seen=new WeakSet()) {
  if(error===null || error===undefined)return error;
  if(typeof error==='string')return diagnosticText(error);
  if(typeof error!=='object')return ['number','boolean'].includes(typeof error)?error:diagnosticText(error);
  if(seen.has(error))return '[CIRCULAR]';
  seen.add(error);
  if(Array.isArray(error))return error.map(item=>postCallExceptionDetails(item,seen));
  const result={};
  for(const field of fields) {
    if(error[field]!==undefined)result[field]=postCallExceptionDetails(error[field],seen);
  }
  return result;
}
