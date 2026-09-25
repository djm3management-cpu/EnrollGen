const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};
export async function hashKey(key) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function createHandler({ rpc, log = console.log, now = () => performance.now() }) {
  return async request => {
    const start = now();
    let consumer = 'unknown';
    let status = 500;
    let authMethod = 'none';
    const respond = (body, code = 200) => {
      status = code;
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { status: code, headers: cors });
    };
    try {
      if (request.method === 'OPTIONS') {
        consumer = 'preflight';
        return respond({});
      }
      if (!['GET', 'HEAD'].includes(request.method)) return respond({ error: 'Method not allowed' }, 405);
      const url = new URL(request.url);
      const headerKey = request.headers.get('x-api-key');
      const key = headerKey ?? url.searchParams.get('key');
      authMethod = headerKey !== null ? 'header' : key !== null ? 'query' : 'none';
      if (!key || key.length > 512) return respond({ error: 'Unauthorized' }, 401);
      const agentId = url.searchParams.get('agent_id');
      const format = url.searchParams.get('format') || 'json';
      const state = url.searchParams.get('state')?.toUpperCase();
      const minimum = url.searchParams.get('min') ?? '1';
      if (!['json', 'simple', 'text'].includes(format) ||
        (state !== undefined && !/^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/.test(state)) ||
        !/^[1-9][0-9]{0,5}$/.test(minimum)) return respond({ error: 'Invalid availability options' }, 400);
      if (agentId !== null && (!agentId || agentId.length > 128)) return respond({ error: 'Invalid agent_id' }, 400);
      const { data, error } = await rpc({ p_key_hash: await hashKey(key), p_agent_id: agentId });
      if (error || !data) return respond({ error: 'Availability temporarily unavailable' }, 503);
      consumer = data.consumer_name || 'unknown';
      if (!data.authorized) return respond({ error: 'Unauthorized' }, 401);
      // Explicit allowlist protects the public contract if the RPC gains fields.
      let agents = data.feed.agents.map(a => ({
        agent_id: a.agent_id, agent_name: a.agent_name, available: a.available,
        status: a.status, licensed_states: a.licensed_states,
      }));
      if (state) agents = agents.filter(a => a.available && a.licensed_states.includes(state));
      const count = agents.filter(a => a.available).length;
      const available = count >= Number(minimum);
      if (request.method === 'HEAD') return respond(null, available ? 200 : 503);
      if (format === 'simple') return respond({ available, count });
      if (format === 'text') {
        status = 200;
        return new Response(available ? '1' : '0', { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
      }
      if (agentId !== null && !state && !url.searchParams.has('min')) {
        if (!agents.length) return respond({ error: 'Agent not found' }, 404);
        return respond(agents[0]);
      }
      return respond({
        any_available: available,
        available_count: count,
        unavailable_count: agents.length - count,
        total_count: agents.length,
        available_states: [...new Set(agents.filter(a => a.available).flatMap(a => a.licensed_states))].sort(),
        agents,
      });
    } catch {
      return respond({ error: 'Availability temporarily unavailable' }, 503);
    } finally {
      log(JSON.stringify({ event: 'availability_request', consumer,
        status, auth_method: authMethod, latency_ms: Math.round((now() - start) * 100) / 100 }));
    }
  };
}
