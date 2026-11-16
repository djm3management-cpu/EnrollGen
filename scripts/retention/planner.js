import {createHash} from 'node:crypto';
import {TABLE_CLASS} from './inventory.js';
import {afterPeriod,validateRetention} from '../../telephony/src/lib/retentionPolicy.js';
export const quote = name => '"' + name.replaceAll('"','""') + '"';
export const keyOf = (table, row, keys) => table + ':' + JSON.stringify(keys.map(k=>row[k]));
const scalars = value => value && typeof value === 'object' ? Object.values(value).flatMap(scalars) : value === null || value === undefined ? [] : [String(value)];
const increment = (counts, group) => { counts[group] = (counts[group] || 0) + 1; };
const identityFields = ['id'];
const aliasesFor = table => [...identityFields, ...(table === 'call_records' || table === 'inbound_calls' ? ['twilio_call_sid'] : []), ...(table === 'recording_ingestion' ? ['recording_sid','storage_path'] : []), ...(['recording_download_tickets','recording_compliance_tickets'].includes(table) ? ['grant_id'] : []), ...(table === 'recording_call_scopes' ? ['call_sid'] : [])];
export function planRetention({tables,primaryKeys,foreignKeys=[],holds=[],roster=[],tenantId}, policyInput, now) {
  const policy = validateRetention(policyInput), time = new Date(now).getTime();
  if (!Number.isFinite(time)) throw Error('Invalid retention time');
  const nodes = [], byKey = new Map(), aliases = new Map();
  for (const [table,rows] of Object.entries(tables)) for (const row of rows) {
    const keys = primaryKeys[table];
    if (!keys?.length) continue; // Unknown/non-keyed data is never deleted.
    const node = {table,row,keys,key:keyOf(table,row,keys),group:TABLE_CLASS[table],refs:new Set(),links:new Set()};
    nodes.push(node); byKey.set(node.key,node);
    if (node.group) for (const field of aliasesFor(table)) if (row[field]) {
      const value = String(row[field]);
      for (const alias of [value,'sha256:'+createHash('sha256').update(value).digest('hex')]) {
        if (!aliases.has(alias)) aliases.set(alias,[]);
        aliases.get(alias).push(node);
      }
    }
  }
  const connect = (source,target) => {
    if (source === target || !target) return;
    source.refs.add(target.key); source.links.add(target.key); target.links.add(source.key);
  };
  // References include real FKs and soft/JSON references (including audit UUIDs,
  // provider SIDs and object paths). No free text is returned or persisted.
  for (const node of nodes) {
    for (const value of scalars(['call_records','inbound_calls'].includes(node.table) ? Object.fromEntries(Object.entries(node.row).filter(([k])=>!['recording_storage_path','recording_url'].includes(k))) : node.table==='admin_action_log' && /^recording_purge_/.test(node.row.action) ? {...node.row,target_id:null} : node.row)) for (const target of aliases.get(value) || []) connect(node,target);
    for (const fk of foreignKeys.filter(f=>f.source === node.table)) {
      const target = nodes.find(n=>n.table === fk.target && fk.columns.every((c,i)=>
        node.row[c] !== null && node.row[c] !== undefined && String(node.row[c]) === String(n.row[fk.targetColumns[i]])));
      if (target && (target.group || target.table === 'contacts')) connect(node,target);
    }
  }
  const agentAliases = new Map();
  for (const a of roster) {
    const values = ['id','enrolled_id','agent_slug','clerk_user_id'].map(k=>a[k]).filter(Boolean).map(String);
    for (const value of values) agentAliases.set(value,new Set([...(agentAliases.get(value)||[]),...values]));
  }
  const held = new Set();
  for (const h of holds.filter(h=>!h.released_at)) {
    const agents = agentAliases.get(String(h.target_id)) || new Set([String(h.target_id)]);
    for (const n of nodes) {
      if (n.row.tenant_id && n.row.tenant_id !== h.tenant_id) continue;
      if ((h.target_type === 'contact' && (n.row.contact_id === h.target_id || n.table === 'contacts' && n.row.id === h.target_id)) ||
          (h.target_type === 'call' && n.table === 'call_records' && n.row.id === h.target_id) ||
          (h.target_type === 'agent' && scalars(n.row).some(value=>agents.has(value)))) held.add(n.key);
    }
  }
  // A complaint is also checked directly, so an interrupted historical backfill
  // cannot make a flagged contact purgeable before its hold is inserted.
  for (const n of nodes) if (n.table === 'contacts' && (n.row.complaint_open || n.row.status === 'complaint')) held.add(n.key);
  const spread = (set, field) => {
    const queue = [...set];
    for (let i=0;i<queue.length;i++) for (const ref of byKey.get(queue[i])?.[field] || []) {
      if (!set.has(ref)) { set.add(ref); queue.push(ref); }
    }
  };
  spread(held,'links');
  // Resolve call ancestry, independent of table iteration order. Operational
  // rows keep their own 90-day clock unless an in-period evidence row refers to them.
  const relatedCalls = node => {
    const found = new Set(), seen = new Set(), queue = [node.key];
    for (let i=0;i<queue.length;i++) {
      if (seen.has(queue[i])) continue;
      seen.add(queue[i]); const n = byKey.get(queue[i]);
      if (n?.table === 'call_records') found.add(n);
      for (const ref of n?.refs || []) if (byKey.get(ref)?.group !== 'contact') queue.push(ref);
    }
    return [...found];
  };
  const enrolled = call => call.row.retention_enrollment_evidence || call.row.enrollment_completed || call.row.app_written || call.row.enrollment_confirmation_number || call.row.enrollment_code || call.row.sunfire_code ||
    ['enrolled','enrolled_pending_verification','partial_enrollment','sale_ancillary'].includes(call.row.call_outcome) ||
    nodes.some(n=>n.table === 'enrollment_intakes' && n.row.call_id === call.row.id && !n.row.is_test_enrollment);
  const callClass = (call,audio) => enrolled(call) ? (audio?'enrollmentRecordingYears':'enrollmentTranscriptYears') :
    (call.row.soa_on_file || call.row.soa_date) ? 'scopeOfAppointmentYears' :
    ['service','general_service','customer_service'].includes(call.row.call_type) && !call.row.retention_marketing_evidence ? 'serviceCallYears' :
    policy.reducedMarketingRule && (!['MA','PDP'].includes(call.row.product_type) || !['sales','marketing'].includes(call.row.call_type)) ?
    (audio?'enrollmentRecordingYears':'enrollmentTranscriptYears') : (audio?'marketingRecordingYears':'marketingTranscriptYears');
  for (const n of nodes) {
    let field, unit = 'years';
    const audio = n.group === 'recording';
    if (n.group === 'audit' || n.table === 'telephony_events' && ['session_lock','session_unlock','session_unlock_failed'].includes(n.row.event)) {
      field='evidenceAuditYears'; n.dataClass='evidenceAudit';
    } else if (n.group === 'operational') { field='operationalDays'; unit='days'; n.dataClass='operational'; }
    else if (n.group === 'textConsent') { field='textConsentYears'; n.dataClass='textConsent'; }
    else if (n.group === 'enrollment') { field='enrollmentYears'; n.dataClass='enrollment'; }
    else if (n.group === 'contact') { field='contactReviewYears'; n.dataClass='contactReview'; }
    else if (n.group === 'call' || audio) {
      const calls = relatedCalls(n);
      const own = n.table === 'call_records' ? n : null;
      const candidates = own ? [own] : calls;
      const fields = candidates.map(c=>callClass(c,audio));
      field = fields.sort((a,b)=>policy[b]-policy[a])[0] || (audio?'enrollmentRecordingYears':'enrollmentTranscriptYears');
      n.dataClass = field.replace(/Years$/,'');
      n.marketingRecording = audio && field === 'marketingRecordingYears';
      n.containsConsent = candidates.some(c=>c.row.ptc_on_file || c.row.ptc_date);
      // From the immutable call date. Unbound legacy evidence retains ten years
      // from its stored anchor, never inferred from mutable browser content.
      n.callAnchor = candidates.length ? Math.max(...candidates.map(c=>new Date(c.row.retention_started_at).getTime())) : null;
    }
    n.expires = tenantId && n.row.tenant_id && n.row.tenant_id !== tenantId ? Infinity : field ? afterPeriod(n.callAnchor || n.row.retention_started_at || (['evidence_access_log','admin_action_log'].includes(n.table) ? n.row.occurred_at : null),policy[field],unit) : Infinity;
    if (n.table === 'call_records' && (n.row.soa_on_file || n.row.soa_date)) n.expires=Math.max(n.expires,afterPeriod(n.row.retention_started_at,policy.scopeOfAppointmentYears));
    if (n.containsConsent) {
      const floor=afterPeriod(n.callAnchor || n.row.retention_started_at,policy.textConsentYears);
      if(floor>n.expires){n.expires=floor;n.dataClass='textConsent';}
    }
    if (n.table === 'recording_ingestion' && n.row.retention_until) n.expires=Math.max(n.expires,new Date(n.row.retention_until).getTime());
    // Unknown external artifact locations cannot be silently orphaned.
    const ownsAudio=['recording_ingestion','call_records','inbound_calls'].includes(n.table);
    n.hasObject = !!(ownsAudio && (n.row.storage_path || n.row.recording_storage_path || n.row.recording_url || n.row.recording_sid) ||
      n.table === 'message_media' && (n.row.storage_path || n.row.media_url) ||
      n.table === 'call_records' && Object.keys(n.row.metadata || {}).some(k=>/path|pdf|url/i.test(k)));
  }
  for (const n of nodes) if (n.group === 'recording' && n.marketingRecording &&
      policy.marketingRecordingYears < policy.marketingTranscriptYears) {
    const calls=relatedCalls(n);
    n.needsTranscript=!calls.length || calls.some(call=>afterPeriod(call.row.retention_started_at,policy.marketingTranscriptYears)>=time && !nodes.some(t=>t.table==='call_transcripts' &&
      t.row.call_record_id===call.row.id && t.row.retention_certified_at && t.row.transcript_text?.trim() && t.expires>=time));
  }
  // A live enrollment or individually referenced audit of a call protects
  // that call's linked evidence/ledgers, including derivatives without an FK
  // pointing back from the call row. Ordinary call pointers do not defeat the
  // explicit reduced audio/transcript split.
  for(const source of nodes)if(source.expires>=time && ['enrollment_intakes','evidence_access_log'].includes(source.table)) {
    const calls=[...source.refs].filter(k=>byKey.get(k)?.table==='call_records');
    for(const target of nodes)if(target.group && target.group!=='contact' && relatedCalls(target).some(c=>calls.includes(c.key)))connect(source,target);
  }
  // Contacts are excluded from the reference roots: keeping a contact forever
  // must not keep every historical message forever. Unknown data is a root.
  const protectedRefs = new Set(nodes.filter(n=>n.group !== 'contact' && (n.expires >= time || held.has(n.key) || n.needsTranscript)).map(n=>n.key));
  spread(protectedRefs,'refs');
  const counts={}, skippedByHold={}, skippedByReference={}, selected=[], reviews=[];
  for (const n of nodes) {
    if (!n.group || !(n.expires < time)) continue;
    if (held.has(n.key)) { increment(skippedByHold,n.dataClass); continue; }
    if (n.group === 'contact') {
      const linked=new Set([n.key]),queue=[n.key];
      for(let i=0;i<queue.length;i++)for(const key of byKey.get(queue[i])?.links||[])if(!linked.has(key)){linked.add(key);queue.push(key);}
      const dates=[...linked].map(key=>byKey.get(key)?.row).filter(Boolean).map(r=>new Date(r.retention_last_activity_at||r.updated_at||r.occurred_at||r.retention_started_at||r.created_at).getTime()).filter(Number.isFinite);
      const last=Math.max(...dates);
      if (afterPeriod(last,policy.contactReviewYears)<time) reviews.push(n);
      continue;
    }
    if (protectedRefs.has(n.key)) { increment(skippedByReference,n.dataClass); continue; }
    increment(counts,n.dataClass); selected.push(n);
  }
  return {nodes,selected,reviews,counts,skippedByHold,skippedByReference,held};
}
