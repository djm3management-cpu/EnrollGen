// Historical dial_result payloads originally omitted duration. Never guess a
// connection from a completed status or the mutable routed_agent_id alone.
export function historicalConnection(event, call) {
  const p = event.payload || {};
  if ((p.DialCallStatus || p.dial_status) !== "completed") return { skip: "not_completed" };
  if (String(p.DialBridged).toLowerCase() === "false") return { skip: "not_bridged" };
  const duration = Number(p.DialCallDuration ?? p.dial_duration);
  if (!Number.isInteger(duration) || duration <= 0) return { skip: "missing_positive_duration" };
  if (!call || !call.contact_id || call.tenant_id !== event.tenant_id ||
      call.twilio_call_sid !== event.twilio_call_sid) return { skip: "missing_call_or_contact" };
  const tried = Array.isArray(p.tried) ? p.tried : [];
  const agentId = tried.at(-1);
  if (typeof agentId !== "string" || !agentId) return { skip: "missing_attempt_agent" };
  // Prefer the already recorded answer; old logs otherwise only have their
  // immutable event time (an approximation, explicitly counted in the report).
  const end = new Date(p.Timestamp || event.occurred_at).getTime();
  const answeredAt = call.answered_at ? new Date(call.answered_at).getTime() : end - duration * 1000;
  if (!Number.isFinite(answeredAt)) return { skip: "missing_timestamp" };
  return { contactId: call.contact_id, tenantId: call.tenant_id, agentId,
    connectedAt: new Date(answeredAt).toISOString(), direction: "inbound",
    approximate: !call.answered_at && !p.Timestamp };
}

export async function backfillConnections(db, tenantId, { apply = false } = {}) {
  const counts = { mode: apply ? "apply" : "dry-run", events: 0, qualifying: 0,
    approximate_timestamps: 0, contacts: 0, would_update: 0, updated: 0, skipped: {} };
  const latest = new Map();
  const cutoff = new Date().toISOString();
  let cursor;
  for (;;) {
    let query = db.from("telephony_events").select("id, tenant_id, inbound_call_id, twilio_call_sid, payload, occurred_at")
      .eq("tenant_id", tenantId).eq("event", "dial_result").lte("occurred_at", cutoff)
      .order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data: events, error } = await query;
    if (error) throw new Error(error.message);
    if (!events.length) break;
    const ids = [...new Set(events.map(e => e.inbound_call_id).filter(Boolean))];
    const { data: calls, error: callError } = ids.length
      ? await db.from("inbound_calls").select("id, tenant_id, contact_id, twilio_call_sid, answered_at")
        .eq("tenant_id", tenantId).in("id", ids) : { data: [] };
    if (callError) throw new Error(callError.message);
    const byId = new Map(calls.map(c => [c.id, c]));
    for (const event of events) {
      counts.events++;
      const candidate = historicalConnection(event, byId.get(event.inbound_call_id));
      if (candidate.skip) {
        counts.skipped[candidate.skip] = (counts.skipped[candidate.skip] || 0) + 1;
        continue;
      }
      counts.qualifying++;
      if (candidate.approximate) counts.approximate_timestamps++;
      const previous = latest.get(candidate.contactId);
      if (!previous || candidate.connectedAt > previous.connectedAt) latest.set(candidate.contactId, candidate);
    }
    cursor = events.at(-1).id;
  }
  counts.contacts = latest.size;
  for (const c of latest.values()) {
    const { data: contact, error } = await db.from("contacts").select("last_connected_at")
      .eq("tenant_id", tenantId).eq("id", c.contactId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!contact || (contact.last_connected_at && new Date(contact.last_connected_at) >= new Date(c.connectedAt))) continue;
    counts.would_update++;
    if (apply) {
      const { data: changed, error: updateError } = await db.rpc("advance_contact_connection", {
        p_contact_id: c.contactId, p_tenant_id: tenantId, p_agent_id: c.agentId,
        p_connected_at: c.connectedAt, p_direction: c.direction,
      });
      if (updateError) throw new Error(updateError.message);
      if (changed) counts.updated++;
    }
  }
  return counts;
}
