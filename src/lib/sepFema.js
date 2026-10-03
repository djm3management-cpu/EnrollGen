/* Authoritative OpenFEMA designated-area feed. Never substitute seed data. */
export const FEMA_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ENDPOINT = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries';

export function countyFipsFromDeclaration(row) {
  const state = String(row.fipsStateCode ?? '');
  const county = String(row.fipsCountyCode ?? '');
  // 000/statewide and tribal areas cannot establish a county designation.
  if (!/^\d{1,2}$/.test(state) || !/^\d{1,3}$/.test(county) || +state === 0 || +county === 0 || +county > 999) return null;
  if (/tribal|reservation/i.test(row.designatedArea || '')) return null;
  return state.padStart(2, '0') + county.padStart(3, '0');
}

export function declarationToDisaster(row, fetchedAt, now = new Date()) {
  const countyFips = countyFipsFromDeclaration(row);
  if (!countyFips || !(row.iaProgramDeclared || row.ihProgramDeclared || row.paProgramDeclared)) return null;
  const declaredDate = row.declarationDate?.slice(0, 10);
  const incidentEnd = row.incidentEndDate?.slice(0, 10) || null;
  if (!declaredDate || !Number.isFinite(Date.parse(declaredDate))) throw new Error('Invalid FEMA declaration date');
  if (incidentEnd && !Number.isFinite(Date.parse(incidentEnd))) throw new Error('Invalid FEMA incident end date');
  const isOngoing = !incidentEnd || incidentEnd > now.toISOString().slice(0, 10);
  const base = new Date((incidentEnd && incidentEnd > declaredDate ? incidentEnd : declaredDate) + 'T00:00:00Z');
  // Last day of the second full calendar month; avoids Jan 31 month overflow.
  const sepEndDate = isOngoing ? null : new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 3, 0)).toISOString().slice(0, 10);
  if (sepEndDate && sepEndDate < now.toISOString().slice(0, 10)) return null;
  const paOnly = !row.iaProgramDeclared && !row.ihProgramDeclared;
  return {
    id: `${row.declarationType}-${row.disasterNumber}-${countyFips}`,
    disasterNumber: row.disasterNumber, declarationType: row.declarationType,
    title: row.declarationTitle || 'Unnamed Disaster', type: row.incidentType || 'Other', state: row.state,
    declaredDate, incidentBegin: row.incidentBeginDate?.slice(0, 10), incidentEnd,
    iaProgram: !!row.iaProgramDeclared, ihProgram: !!row.ihProgramDeclared, paOnly,
    countyFips, counties: [row.designatedArea || countyFips], sepEndDate, isOngoing,
    durationLabel: paOnly ? 'PA only, SEP activates if IA is declared' : 'Incident duration + 2 calendar months',
    source: 'OpenFEMA', verified: true, fetchedAt,
  };
}

async function fetchAllFemaDisasters({ fetchImpl = fetch, now = new Date() } = {}) {
  const checkedAt = now.toISOString();
  const lookback = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);
  const records = [];
  try {
    for (let skip = 0; ; skip += 1000) {
      const params = new URLSearchParams({
        // Includes older declarations still ongoing or recently ended, and amendments.
        $filter: `declarationDate ge '${lookback}' or incidentEndDate ge '${lookback}' or incidentEndDate eq null`,
        $orderby: 'id asc', $top: '1000', $skip: String(skip),
        $select: 'id,disasterNumber,declarationType,declarationDate,incidentType,declarationTitle,state,designatedArea,fipsStateCode,fipsCountyCode,ihProgramDeclared,iaProgramDeclared,paProgramDeclared,incidentBeginDate,incidentEndDate',
      });
      const response = await fetchImpl(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`FEMA API ${response.status}`);
      const data = await response.json();
      const page = data.DisasterDeclarationsSummaries;
      if (!Array.isArray(page)) throw new Error('Invalid FEMA response');
      records.push(...page);
      if (page.length < 1000) break;
    }
    const byCounty = new Map();
    for (const record of records) {
      const disaster = declarationToDisaster(record, checkedAt, now);
      if (disaster) byCounty.set(disaster.id, disaster);
    }
    return { apiFailed: false, disasters: [...byCounty.values()], fetchedAt: checkedAt, checkedAt };
  } catch {
    // Reject partial pages as well as network errors. An empty successful feed is valid.
    return { apiFailed: true, disasters: [], fetchedAt: null, checkedAt };
  }
}

// Concurrent browser surfaces share one complete request, without retaining a
// successful result across subsequent refreshes or falling back after failure.
let pendingFeed = null;
export function fetchLiveFemaDisasters(options) {
  if (options) return fetchAllFemaDisasters(options);
  if (!pendingFeed) pendingFeed = fetchAllFemaDisasters().finally(() => { pendingFeed = null; });
  return pendingFeed;
}

export function matchFemaDisasters(disasters, countyFips, now = new Date()) {
  const fips = new Set(countyFips || []);
  return disasters.filter(d => d.verified === true && d.source === 'OpenFEMA'
    && Number.isFinite(Date.parse(d.fetchedAt)) && now - new Date(d.fetchedAt) <= FEMA_MAX_AGE_MS
    && new Date(d.fetchedAt) <= now && fips.has(d.countyFips)
    && !d.paOnly && (d.iaProgram || d.ihProgram)
    && (d.isOngoing || d.sepEndDate >= now.toISOString().slice(0, 10)));
}

export function femaCountyStatus(feed, countyFips, now = new Date()) {
  if (!feed || feed.apiFailed || !feed.fetchedAt || !Number.isFinite(Date.parse(feed.fetchedAt)) || new Date(feed.fetchedAt) > now || now - new Date(feed.fetchedAt) > FEMA_MAX_AGE_MS || !countyFips?.length) {
    return { label: 'FEMA data unavailable', isUrgent: false };
  }
  const matches = matchFemaDisasters(feed.disasters, countyFips, now);
  if (!matches.length) return null;
  const end = matches.some(d => d.isOngoing) ? 'Open (incident ongoing)' : matches.map(d => d.sepEndDate).sort().at(-1);
  return { label: `FEMA SEP available through ${end} · Data from ${feed.fetchedAt}`, isUrgent: false };
}

// Browser RPC displays must not turn an old DB copy into current evidence.
export function withLiveFemaResult(result, feed, now = new Date()) {
  if (!result || result.error) return result;
  const countyFips = (result.counties || []).map(county => county.county_fips);
  const fresh = countyFips.length > 0 && !feed.apiFailed && feed.fetchedAt && Number.isFinite(Date.parse(feed.fetchedAt))
    && now - new Date(feed.fetchedAt) <= FEMA_MAX_AGE_MS && new Date(feed.fetchedAt) <= now;
  const matches = fresh ? matchFemaDisasters(feed.disasters, countyFips, now) : [];
  const replacement = {
    sep_type: 'Disaster / Emergency SEP', cfr_reference: '42 CFR Sec. 422.62(b)(18)(ii); CMS HPMS memo', available: !!fresh && matches.length > 0,
    period: 'Duration of disaster declaration + 2 calendar months',
    data_status: fresh ? 'live' : 'unavailable', fetched_at: feed.fetchedAt,
    evidence: !fresh ? 'FEMA data unavailable' : `${matches.length ? 'County designated in OpenFEMA; verify beneficiary impact and missed election period.' : 'No active FEMA declaration in this county.'} Data from ${feed.fetchedAt}`,
    disasters: matches.map(d => ({disaster_number: d.disasterNumber, county_fips: d.countyFips,
      title: d.title, type: d.type, declared: d.declaredDate,
      sep_ends: d.isOngoing ? 'Open (incident ongoing)' : d.sepEndDate})),
  };
  return {...result, seps: (result.seps || []).map(s => s.sep_type === replacement.sep_type ? replacement : s)};
}
