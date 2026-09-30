const defaults = Object.freeze({ state:'state', phone:'phone', call_id:'call_id' });

export function parseParagonFieldMap(value) {
  if (!value) return defaults;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (typeof parsed[key] === 'string' && /^[A-Za-z][\w.-]{0,63}$/.test(parsed[key])) result[key] = parsed[key];
    }
    return result;
  } catch { return defaults; }
}

export function readParagonPing(fields, fieldMap = defaults) {
  const get = key => fields instanceof URLSearchParams ? fields.get(key) : fields?.[key];
  const state = get(fieldMap.state) || get('state');
  const phone = get(fieldMap.phone) || get('caller_phone') || get('phone');
  const callId = get(fieldMap.call_id) || get('aggregator_call_id') || get('call_id');
  const phoneText = typeof phone === 'string' ? phone.trim() : null;
  const digits = phoneText?.replace(/\D/g,'');
  const normalizedPhone = !phoneText ? null : /^\+[1-9]\d{7,14}$/.test(phoneText) ? phoneText
    : digits?.length===10 ? `+1${digits}` : digits?.length===11 && digits.startsWith('1') ? `+${digits}` : null;
  return {
    state: typeof state === 'string' ? state.trim().toUpperCase() : null,
    phone: normalizedPhone,
    invalidPhone: Boolean(phoneText && !normalizedPhone),
    callId: typeof callId === 'string' ? callId.trim() : null,
  };
}
