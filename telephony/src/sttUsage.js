import { supabase } from './supabase.js';
export async function reportServerSttUsage(row, db = supabase) {
  const { error } = await db.from('usage_records').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}
