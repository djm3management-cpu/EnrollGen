import { supabase } from './supabase.js';
import { normalizePhoneE164 } from './phone.js';

export async function outboundDncStatus(phone, tenantId) {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) throw new Error('Enter a valid phone number.');
  const { data, error } = await supabase.rpc('outbound_dnc_status', {
    p_phone: normalized, p_tenant_id: tenantId,
  });
  if (error || typeof data !== 'boolean') throw new Error('Do Not Call check unavailable. Please try again.');
  return data;
}
