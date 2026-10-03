import { evidenceRequest } from './evidenceApi';
export function recordingTarget(row) {
  return row.attempt_id ? { attempt_id: row.attempt_id } : row.call_record_id ? { call_record_id: row.call_record_id }
    : row.inbound_call_id ? { inbound_call_id: row.inbound_call_id } : { call_record_id: row.id };
}
export function listRecordings(getToken, target) {
  return evidenceRequest(getToken, `recordings?${new URLSearchParams(target)}`);
}
export function recordingMedia(getToken, target, { id, download = false, provider = false } = {}) {
  return evidenceRequest(getToken, 'recordings', { ...target, action: 'media', recording_id: id, download, ...(provider ? { source: 'twilio' } : {}) });
}
export function downloadRecordingUrl(url, filename) {
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.rel = 'noreferrer';
  document.body.appendChild(link); link.click(); link.remove();
}
