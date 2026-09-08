import { useMemo, useState } from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import { buildDashboard, DASHBOARD_RANGES, formatMetric, metricDelta } from '../lib/dashboardMetrics';
import { CALL_OUTCOME_LABELS, callOutcomeLabel } from '../lib/postCallPipeline';

const METRICS = [['calls', 'Calls Today'], ['sales', 'Sales Today'], ['conversion', 'Conversion Rate'], ['duration', 'Avg Call Duration'], ['compliance', 'Compliance Score']];
const TICKER_LABELS = { calls: 'CALLS', sales: 'SALES', conversion: 'CVR', duration: 'AVG DUR', compliance: 'COMPLIANCE' };
const THRESHOLD = 85;
const W = 640, H = 220, LEFT = 54, RIGHT = 18, TOP = 28, BOTTOM = 38;

function TimelineChart({ buckets, compliance = false, hourly = false }) {
  const maximum = compliance ? 100 : Math.max(4, ...buckets.map(bucket => bucket.calls));
  const ceiling = compliance ? 100 : Math.ceil(maximum / 4) * 4;
  const width = W - LEFT - RIGHT, height = H - TOP - BOTTOM;
  const x = index => LEFT + width * (index + 0.5) / buckets.length;
  const y = value => TOP + height * (1 - value / ceiling);
  const label = date => hourly ? date.toLocaleTimeString([], { hour: 'numeric' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const key = compliance ? 'compliance' : 'sales';
  const paths = [];
  let segment = [];
  buckets.forEach((bucket, index) => {
    if (bucket[key] == null) { if (segment.length) paths.push(segment.join(' ')); segment = []; }
    else segment.push(`${segment.length ? 'L' : 'M'} ${x(index)} ${y(bucket[key])}`);
  });
  if (segment.length) paths.push(segment.join(' '));
  const empty = buckets.every(bucket => compliance ? bucket.compliance == null : bucket.calls === 0);
  return <>
    <svg className="agent-dash-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={compliance ? 'Daily compliance score, 0 to 100 percent' : 'Call counts as bars and sales counts as a line'}>
      <text x={LEFT} y="14" className="agent-dash-axis-title">{compliance ? 'SCORE (%)' : 'CALLS / SALES (COUNT)'}</text>
      {[0, 1, 2, 3, 4].map(tick => <g key={tick}>
        <line className="agent-dash-gridline" x1={LEFT} x2={W - RIGHT} y1={y(ceiling * tick / 4)} y2={y(ceiling * tick / 4)} />
        <text x={LEFT - 10} y={y(ceiling * tick / 4) + 4} textAnchor="end">{ceiling * tick / 4}{compliance ? '%' : ''}</text>
      </g>)}
      {compliance && <g className="agent-dash-reference"><line x1={LEFT} x2={W - RIGHT} y1={y(THRESHOLD)} y2={y(THRESHOLD)} /><text x={W - RIGHT} y={y(THRESHOLD) - 5} textAnchor="end">{THRESHOLD}% reference</text></g>}
      {!compliance && buckets.map((bucket, index) => <rect key={index} className="agent-dash-call-bar" x={x(index) - width / buckets.length * 0.28} y={y(bucket.calls)} width={width / buckets.length * 0.56} height={y(0) - y(bucket.calls)}><title>{label(bucket.date)}: {bucket.calls} calls, {bucket.sales} sales</title></rect>)}
      {paths.map((path, index) => <path key={index} className="agent-dash-line" d={path} />)}
      {buckets.map((bucket, index) => <g key={index}>
        {bucket[key] != null && <circle className="agent-dash-point" cx={x(index)} cy={y(bucket[key])} r="3"><title>{label(bucket.date)}: {formatMetric(compliance ? 'compliance' : 'sales', bucket[key])}</title></circle>}
        {(index % Math.max(1, Math.ceil(buckets.length / 6)) === 0 || index === buckets.length - 1) && <text x={x(index)} y={H - 17} textAnchor="middle">{label(bucket.date)}</text>}
      </g>)}
    </svg>
    {empty && <p className="agent-dash-empty">{compliance ? 'No scored calls in this range.' : 'No calls in this range.'}</p>}
  </>;
}

const DISPOSITION_CODES = [...Object.keys(CALL_OUTCOME_LABELS), 'undispositioned'];
const DISPOSITION_COLORS = ['--eg-amber', '--eg-blue', '--eg-purple', '--eg-green', '--eg-red', '--eg-amber-text', '--eg-blue-text', '--eg-purple-text', '--eg-green-text', '--eg-red-text'];

function DispositionChart({ rows }) {
  const [activeCode, setActiveCode] = useState(null);
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  let angle = -Math.PI / 2;
  const slices = rows.map(([code, count]) => {
    const start = angle;
    angle += count / total * Math.PI * 2;
    const point = value => `${110 + 96 * Math.cos(value)} ${110 + 96 * Math.sin(value)}`;
    return {
      code, count,
      label: code === 'undispositioned' ? 'Not dispositioned' : callOutcomeLabel(code),
      percent: (count / total * 100).toFixed(1),
      color: `var(${DISPOSITION_COLORS[Math.max(0, DISPOSITION_CODES.indexOf(code)) % DISPOSITION_COLORS.length]})`,
      path: `M 110 110 L ${point(start)} A 96 96 0 ${angle - start > Math.PI ? 1 : 0} 1 ${point(angle)} Z`,
    };
  });
  return <div className="agent-dash-dispositions">
    <svg className="agent-dash-pie" viewBox="0 0 220 220" role="img" aria-label={total ? `Call disposition pie chart: ${total} calls. Counts and percentages are listed in the legend.` : 'No dispositions in this range'}>
      {!total && <circle cx="110" cy="110" r="96" className="agent-dash-pie-empty" />}
      {slices.map(slice => {
        const props = {
          fill: slice.color, className: 'agent-dash-pie-slice',
          opacity: activeCode && activeCode !== slice.code ? 0.35 : 1,
          onMouseEnter: () => setActiveCode(slice.code), onMouseLeave: () => setActiveCode(null),
        };
        const title = `${slice.label}: ${slice.count} calls (${slice.percent}%)`;
        return slices.length === 1
          ? <circle key={slice.code} cx="110" cy="110" r="96" {...props}><title>{title}</title></circle>
          : <path key={slice.code} d={slice.path} {...props}><title>{title}</title></path>;
      })}
    </svg>
    {total ? <ul className="agent-dash-pie-legend" aria-label="Disposition counts and percentages">
      {slices.map(slice => <li key={slice.code} tabIndex={0}
        onMouseEnter={() => setActiveCode(slice.code)} onMouseLeave={() => setActiveCode(null)}
        onFocus={() => setActiveCode(slice.code)} onBlur={() => setActiveCode(null)}>
        <i style={{ background: slice.color }} aria-hidden="true" />
        <span>{slice.label}</span><strong>{slice.count}</strong><span>{slice.percent}%</span>
      </li>)}
    </ul> : <p className="agent-dash-empty">No dispositions in this range.</p>}
  </div>;
}

export default function AgentDashboard({ userId, onOpenContacts }) {
  const [scope, setScope] = useState('self');
  const data = useDashboardData(userId, scope);
  const scopeLabel = scope === 'agency' ? 'Agency-wide' : scope === 'self' ? data.agentOptions.find(agent => agent.clerkUserId === userId)?.label || 'My data' : data.agentOptions.find(agent => agent.key === scope)?.label || 'Agent';
  const averageLabel = scope === 'self' ? 'Your' : scope === 'agency' ? 'Agency' : 'Agent';
  const [range, setRange] = useState('today');
  const rangeLabel = DASHBOARD_RANGES.find(([value]) => value === range)[1];
  const summary = useMemo(() => buildDashboard(data.calls, range, data.updatedAt || new Date()), [data.calls, data.updatedAt, range]);
  return <div className="agent-dashboard" aria-busy={data.loading}>
    <header className="agent-dash-heading">
      <div className="agent-dash-scope"><h1>Dashboard</h1><label htmlFor="dashboard-scope">VIEW</label>
        <select id="dashboard-scope" value={scope} onChange={event => setScope(event.target.value)} aria-label="Dashboard data scope">
          <option value="agency">Agency-wide</option>
          {data.agentOptions.map(agent => <option key={agent.key} value={agent.clerkUserId === userId ? "self" : agent.key}>{agent.label}{agent.clerkUserId === userId ? ' (you)' : ''}</option>)}
        </select>
      </div>
      <div className="agent-dash-status"><button onClick={onOpenContacts}>{data.loading ? 'Loading' : data.contacts} {scope === 'agency' ? 'agency contacts' : 'assigned contacts'} ↗</button><button onClick={data.refresh} disabled={data.loading}>Refresh</button><span role="status">{data.loading ? 'Loading your activity...' : data.updatedAt ? `Updated ${data.updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Awaiting data'}</span></div>
    </header>
    {data.error && <p className="agent-dash-error" role="alert">{data.error} Use Refresh to retry. {data.updatedAt ? 'Showing the last successful update.' : 'Metrics are unavailable until data loads.'}</p>}
    <section className="agent-dash-metrics" aria-label="Today’s key metrics">
      {METRICS.map(([key, label]) => {
        const value = data.loading || (data.error && !data.updatedAt) ? '--' : formatMetric(key, summary.today[key]);
        const delta = data.loading || (data.error && !data.updatedAt) ? 'Waiting for activity' : metricDelta(key, summary.today[key], summary.baseline[key]).replace('your average', `${averageLabel.toLowerCase()} average`);
        return <span className="agent-dash-metric" key={key} tabIndex={0} title={`${label}: ${delta}`} aria-label={`${label}: ${value}. ${delta}`}>
          <span>{TICKER_LABELS[key]}:</span> <strong>{value}</strong>
        </span>;
      })}
    </section>
    <div className="agent-dash-range-row"><span>{scopeLabel} · ACTIVITY WINDOW</span><div className="agent-dash-ranges" aria-label="Chart time range">{DASHBOARD_RANGES.map(([value, label]) => <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>)}</div></div>
    <div className="agent-dash-panel-grid">
    <section className="agent-dash-panel"><header><h2>Calls vs Sales</h2><span className="agent-dash-legend"><i /> Calls <b /> Sales</span></header><TimelineChart buckets={summary.buckets} hourly={range === 'today'} /></section>
    <section className="agent-dash-panel"><header><h2>Compliance Score Trend</h2><span>Daily average · Reference {THRESHOLD}%</span></header><TimelineChart buckets={summary.daily} compliance /></section>
    <section className="agent-dash-panel"><header><h2>Call Disposition Breakdown</h2><span>{rangeLabel} · {summary.dispositions.reduce((sum, [, count]) => sum + count, 0)} calls</span></header><DispositionChart rows={summary.dispositions} /></section>
    <section className="agent-dash-panel"><header><h2>Today vs {averageLabel} Average</h2><span>Previous 30 complete days</span></header><div className="agent-dash-table-wrap"><table><thead><tr><th>Metric</th><th>Today</th><th>30-day average</th></tr></thead><tbody>{METRICS.map(([key, label]) => <tr key={key}><th scope="row">{label.replace(' Today', '')}</th><td>{data.loading || (data.error && !data.updatedAt) ? '--' : formatMetric(key, summary.today[key])}</td><td>{data.loading || (data.error && !data.updatedAt) ? '--' : formatMetric(key, summary.baseline[key])}</td></tr>)}</tbody></table></div><p className="agent-dash-note">All figures reflect the selected agent or agency. Agency totals include all agency calls and unassigned contacts. Local time · Weeks start Monday. Daily call and sale averages include inactive days. Rates and averages use all qualifying calls. Sales include enrolled and enrolled pending verification; partial enrollments are excluded. Unscored calls are excluded from compliance averages. Reference uses the compliance engine default of 85%.</p></section>
    </div>
  </div>;
}
