export default function UnderwritingChecker({ highlighted = false, onAcknowledgeHighlight }) {
  return <section className={`private-plan-section${highlighted ? ' is-highlighted' : ''}`}>
    <div className="private-plan-section-head"><h3>Underwriting verification</h3></div>
    <p>Underwriting lookbacks and eligibility are not established by the supplied sources: verify with carrier. Use the current carrier application. Do not infer acceptance or rejection from these benefit summaries.</p>
    {highlighted ? <button type="button" className="private-plan-open-btn" onClick={onAcknowledgeHighlight}>Acknowledge</button> : null}
  </section>;
}
