import { evidenceRequest } from './evidenceApi.js';
export function loadCallLog(getToken, filters = {}) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value != null && value !== ''));
  return evidenceRequest(getToken, `call-log?${params}`);
}
export async function loadCallLogPages(getToken, filters, cancelled = () => false) {
  const rows = [];
  for (let offset = 0; !cancelled(); offset += 500) {
    const result = await loadCallLog(getToken, { ...filters, offset, limit: 500 });
    rows.push(...result.rows);
    if (result.rows.length < 500) break;
  }
  return rows;
}
