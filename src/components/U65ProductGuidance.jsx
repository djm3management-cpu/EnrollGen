import { U65_PLANS, U65_COVERAGE_GROUPS, getU65Plan } from '../data/u65Guidance.js';
import { useU65ProductSelection } from '../hooks/useU65ProductSelection.js';

export default function U65ProductGuidance({ selector = true }) {
  const [id, select] = useU65ProductSelection();
  const plan = getU65Plan(id);
  return (
    <section className="private-plan-section">
      <div className="private-plan-section-head"><div>
        <span className="private-plan-kicker">DE · MD · FL agent guidance</span>
        <h3>Product guidance</h3>
      </div></div>
      <p>For higher earners priced out of unsubsidized ACA. Enroll Prime is our current agent portal. Availability: verify with carrier.</p>
      {selector ? <label className="private-plan-dob-field">
        <span>Select the exact plan for Co-Pilot coaching</span>
        <select value={id || ''} onChange={(event) => select(event.target.value)}>
          <option value="">Select a plan</option>
          {U65_COVERAGE_GROUPS.map((group) => <optgroup key={group} label={group}>
            {U65_PLANS.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </optgroup>)}
        </select>
      </label> : null}
      {!plan ? <p>Select a plan before giving product-specific guidance. Unknown facts: verify with carrier.</p> : <>
        <h3>{plan.name}</h3>
        <div className="private-plan-detail-grid">
          {[
            ['Coverage group / plan type', `${plan.group} / ${plan.planType}`],
            ['Network', plan.network], ['Deductible', plan.deductible], ['Stated OOP', plan.oop],
            ['Member coinsurance', plan.coinsurance], ['Hospital', plan.hospital], ['Office limits', plan.office],
            ['Other limits', plan.limits], ['Benefit maximum', plan.benefitMaximum], ['Rx', plan.rx],
            ['Maternity', plan.maternity], ['Waiting periods', plan.waitingPeriods], ['Gap benefit', plan.gap],
            ['ACA/MEC status', plan.acaMecStatus], ['Underwriting lookbacks', plan.underwritingLookbacks],
          ].map(([label, value]) => <div key={label} className="private-plan-detail-row"><span>{label}</span><strong>{value}</strong></div>)}
        </div>
        <div className="private-plan-mini-block"><span className="private-plan-mini-block__label">Required agent statements</span>
          <ul>{plan.requiredStatements.map((statement, index) => <li key={index}>{statement}</li>)}</ul>
        </div>
        <p>Workbook source: {plan.source}. Verify the current effective-date documents before enrollment.</p>
      </>}
    </section>
  );
}
