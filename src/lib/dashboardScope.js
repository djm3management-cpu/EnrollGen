const normalizeName = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export function dashboardAgents(roster, enrolled) {
  const options = roster.map(agent => {
    const matches = enrolled.filter(record => {
      if (record.clerk_user_id && agent.clerk_user_id) return (agent.clerkUserIds || [agent.clerk_user_id]).includes(record.clerk_user_id);
      return normalizeName(record.name) && normalizeName(record.name) === normalizeName(agent.name);
    });
    return {
      key: `roster:${agent.id}`, label: agent.name || agent.agent_slug || 'Agent',
      clerkUserId: agent.clerk_user_id || matches.find(record => record.clerk_user_id)?.clerk_user_id,
      agentIds: matches.map(record => record.id),
      contactSlugs: agent.agent_slug ? [agent.agent_slug] : [],
    };
  });
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function selectDashboardScope(calls, contactCounts, options, scope, userId) {
  if (scope === 'agency') return {
    calls, contacts: Object.values(contactCounts).reduce((sum, count) => sum + count, 0),
  };
  const selected = options.filter(agent => scope === 'self' ? agent.clerkUserId === userId : agent.key === scope);
  const ids = new Set(selected.flatMap(agent => agent.agentIds));
  const slugs = new Set(selected.flatMap(agent => agent.contactSlugs));
  return {
    calls: calls.filter(call => ids.has(call.agent_id)),
    contacts: [...slugs].reduce((sum, slug) => sum + (contactCounts[slug] || 0), 0),
  };
}
