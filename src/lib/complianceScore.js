export function isUnscoredCompliance(scorecard) {
  return scorecard?.scoring_state==='na' || scorecard?.overall_grade === 'N/A' || ['N/A', 'INSUFFICIENT'].includes(scorecard?.pass_fail);
}

export function complianceItemStatus(item) {
  if(/^Covered by /.test(item?.notes||''))return {label:item.notes,className:'is-neutral',scored:false};
  const result = String(item?.result || '').toLowerCase();
  if (['na', 'not_applicable', 'unscored'].includes(result)) {
    const review = /manual review required/i.test(item?.notes || '');
    return { label: review ? 'REVIEW' : 'N/A', className: review ? 'is-review' : 'is-neutral', scored: false };
  }
  if (result === 'review') return {label:'REVIEW',className:'is-review',scored:false};
  if (result === 'partial') return { label: 'PARTIAL', className: 'is-review', scored: true };
  if (result === 'pass') return { label: 'PASS', className: 'is-pass', scored: true };
  return { label: 'FAIL', className: 'is-fail', scored: true };
}

export function complianceViewModel({scorecard,items=[],coverage,filter='all'}){
 const notApplicable=isUnscoredCompliance(scorecard);
 const incomplete=!notApplicable&&(!coverage?.complete||scorecard?.scoring_state==='incomplete'||!!scorecard&&items.length===0);
 const visible=items.filter(i=>filter==='all'||(filter==='na'?['na','not_applicable','unscored'].includes(i.result):i.result===filter));
 const groups=visible.reduce((a,i)=>{(a[i.category]??=[]).push(i);return a;},{});
 const reviewRequired=items.some(i=>i.result==='review')||[...(scorecard?.risk_flags||[]),...(scorecard?.coaching_notes||[])].some(n=>/manual review required/i.test(n));
 return {incomplete,groups,categoryScores:complianceCategoryScores(items),reviewRequired,score:incomplete||isUnscoredCompliance(scorecard)?null:scorecard?.overall_score??null,status:notApplicable?'N/A':incomplete?'SCORING INCOMPLETE':scorecard?.auto_fail_triggered?'AUTO-FAIL':scorecard?.pass_fail||'PENDING'};
}

// Sum saved points after event deductions; filters never change category totals.
export function complianceCategoryScores(items = []) {
 return items.reduce((groups, item) => {
  const group = groups[item.category] ??= {earned:0, possible:0};
  group.earned += Number(item.points_earned) || 0;
  group.possible += Number(item.points_possible) || 0;
  group.pct = group.possible > 0 ? 100 * group.earned / group.possible : null;
  return groups;
 }, {});
}
