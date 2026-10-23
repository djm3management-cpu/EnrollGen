import { CallDirection, ComplianceChip, DispositionChip, RecordingCell } from '../callLog/CallRowParts';
import { formatCallDateTime, formatCallTime, formatTalk, summarizeContactCalls } from '../../lib/callPresentation';

export default function ContactCallCard({ call }) {
  return <article className="msg-call-recording crm-call-card" aria-label="Call">
    <div className="crm-call-card-head">
      <CallDirection direction={call.direction} />
      <time className="mono" dateTime={call.occurred_at}>{formatCallTime(call.occurred_at)}</time>
      <DispositionChip disposition={call.disposition} />
    </div>
    <dl className="crm-call-meta">
      <div><dt>Agent</dt><dd>{call.agent || '--'}</dd></div>
      <div><dt>Talk</dt><dd className="mono">{formatTalk(call.duration_seconds)}</dd></div>
      <div><dt>Compliance</dt><dd><ComplianceChip score={call.compliance_score} status={call.compliance_status} grade={call.compliance_grade} passFail={call.compliance_pass_fail} /></dd></div>
    </dl>
    <RecordingCell row={call} />
  </article>;
}

export function ContactCallSummary({ calls, loading, error }) {
  const summary = summarizeContactCalls(calls);
  return <section className="crm-call-summary" aria-label="Call summary" aria-busy={loading}>
    <div className="contacts-section-head">CALL SUMMARY</div>
    {error ? <p className="ops-error" role="alert">{error}</p> : <dl className="contacts-meta-list">
      <div><dt>TOTAL CALLS</dt><dd>{loading ? '--' : summary.total}</dd></div>
      <div><dt>LAST DISPOSITION</dt><dd>{summary.lastDisposition ? <DispositionChip disposition={summary.lastDisposition} /> : '--'}</dd></div>
      <div><dt>LAST AGENT</dt><dd>{summary.lastAgent || '--'}</dd></div>
      <div><dt>LAST CALL</dt><dd className="mono">{formatCallDateTime(summary.lastCallTime)}</dd></div>
    </dl>}
  </section>;
}
