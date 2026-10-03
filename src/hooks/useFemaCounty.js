import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchLiveFemaDisasters, femaCountyStatus } from '../lib/sepFema.js';

export function useFemaCounty(zip, stateCode) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const key = `${zip}:${stateCode}`;
    const publish = status => setResult({ key, status });
    setResult(null);
    if (!/^\d{5}$/.test(zip)) return;
    async function refresh() {
      const [feed, counties] = await Promise.all([
        fetchLiveFemaDisasters(),
        supabase.from('zip_county_crosswalk').select('county_fips,state_code').eq('zip', zip),
      ]);
      if (cancelled) return;
      if (counties.error) { publish({ label: 'FEMA data unavailable', isUrgent: false }); return; }
      const fips = (counties.data || []).filter(row => !stateCode || row.state_code === stateCode).map(row => row.county_fips);
      publish(femaCountyStatus(feed, fips) || { label: `No active county FEMA SEP · Data from ${feed.fetchedAt}`, isUrgent: false });
    }
    const run = () => refresh().catch(() => { if (!cancelled) publish({ label: 'FEMA data unavailable', isUrgent: false }); });
    run();
    const interval = window.setInterval(run, 30 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [zip, stateCode]);
  return result?.key === `${zip}:${stateCode}` ? result.status : null;
}
