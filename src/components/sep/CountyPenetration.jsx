import { useEffect, useState } from 'react';
import { supabaseCms } from '../../lib/supabase';
import { countyKey, countyPenetration, fetchCountyPenetration, penetrationColor, penetrationLabel } from '../../lib/countyPenetration';

const countyMaps = import.meta.glob('../../data/countyMaps/*.json');

export function CountyPenetration({ state, selectedCounty, counties = [], onCountySelect }) {
  const [layer, setLayer] = useState('penetration');
  const [data, setData] = useState({ rows: [], month: null });
  const [paths, setPaths] = useState([]);
  const [status, setStatus] = useState({ state: null, loading: true, error: '' });
  useEffect(() => {
    let cancelled = false;
    const loadMap = countyMaps[`../../data/countyMaps/${state}.json`];
    Promise.all([fetchCountyPenetration(supabaseCms, state), loadMap ? loadMap() : Promise.resolve({ default: [] })])
      .then(([next, geometry]) => {
        if (cancelled) return;
        setData(next); setPaths(geometry.default); setStatus({ state, loading: false, error: '' });
      }).catch(() => { if (!cancelled) setStatus({ state, loading: false, error: 'CMS penetration data is unavailable.' }); });
    return () => { cancelled = true; };
  }, [state]);
  const loading = status.state !== state || status.loading;
  const rows = loading || status.error ? [] : data.rows;
  const selected = countyPenetration(rows, selectedCounty);
  const month = !loading && !status.error && data.month ? data.month.slice(0, 7) : null;
  const value = number => number == null ? 'No data' : Number(number).toLocaleString();
  return (
    <section className="card sep-penetration" aria-label={`${state} county penetration`}>
      <div className="sep-cg-header"><span>{state} County Map</span><span className="muted">CMS file month: {month || 'No data'}</span></div>
      <div className="sep-tab-bar">
        <button type="button" className={`tab${layer === 'penetration' ? ' active' : ''}`} onClick={() => setLayer('penetration')}>MA penetration</button>
        <button type="button" className={`tab${layer === 'counties' ? ' active' : ''}`} onClick={() => setLayer('counties')}>Counties</button>
      </div>
      {loading ? <p className="muted">Loading county data...</p> : status.error ? <p role="alert" className="muted">{status.error}</p> : <>
        <svg viewBox="0 0 800 400" className="sep-penetration-map" aria-label="County map">
          {paths.map(path => {
            const row = countyPenetration(rows, path.county, path.fips);
            const county = counties.find(name => countyKey(name) === countyKey(path.county)) || path.county;
            const active = countyKey(selectedCounty) === countyKey(county);
            const select = () => onCountySelect(county);
            return <path key={path.fips} d={path.d} fill={layer === 'penetration' ? penetrationColor(row) : 'var(--bg-elevated)'}
              stroke={active ? 'var(--text-primary)' : 'var(--border-default)'} strokeWidth={active ? 2.5 : 0.6}
              fillRule="evenodd" role="button" tabIndex={0} aria-label={`${path.county}: ${penetrationLabel(row)}`}
              onClick={select} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }}>
              <title>{path.county}: {penetrationLabel(row)}{month ? ` · ${month}` : ''}</title>
            </path>;
          })}
        </svg>
        {!paths.length && <p className="muted">County boundaries: No data</p>}
        <div className="sep-penetration-legend muted">MA penetration: lighter 0% → darker 100% · Unfilled: No data</div>
      </>}
      {selectedCounty && <div className="sep-penetration-detail">
        <strong>{selectedCounty}</strong>
        <span>Medicare eligibles: {value(selected?.eligibles)}</span>
        <span>MA enrollees: {value(selected?.ma_enrollees)}</span>
        <span>Penetration: {penetrationLabel(selected)}</span>
        <span>CMS file month: {month || 'No data'}</span>
      </div>}
      <p className="muted sep-penetration-note">CMS monthly enrollment ÷ Medicare eligibles; the published CMS percentage is shown. Suppressed counts remain unknown. {month === '2026-09' && 'CMS excludes Connecticut and Alaska from the September 2026 file. '}Boundary vintages may differ; unmatched counties show No data.</p>
    </section>
  );
}
