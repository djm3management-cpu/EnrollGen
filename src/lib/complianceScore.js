export function isUnscoredCompliance(scorecard) {
  return scorecard?.scoring_state==='na' || scorecard?.overall_grade === 'N/A' || ['N/A', 'INSUFFICIENT'].includes(scorecard?.pass_fail);
}

export function complianceItemStatus(item) {
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
 const notApplicable=scorecard?.scoring_state==='na';
 const incomplete=!notApplicable&&(!coverage?.complete||scorecard?.scoring_state==='incomplete'||!!scorecard&&items.length===0);
 const visible=items.filter(i=>filter==='all'?!['na','not_applicable'].includes(i.result):filter==='na'?['na','not_applicable'].includes(i.result):i.result===filter);
 const groups=visible.reduce((a,i)=>{(a[i.category]??=[]).push(i);return a;},{});
 const reviewRequired=items.some(i=>i.result==='review')||[...(scorecard?.risk_flags||[]),...(scorecard?.coaching_notes||[])].some(n=>/manual review required/i.test(n));
 return {incomplete,groups,reviewRequired,score:incomplete||isUnscoredCompliance(scorecard)?null:scorecard?.overall_score??null,status:notApplicable?'N/A':incomplete?'SCORING INCOMPLETE':scorecard?.auto_fail_triggered?'AUTO-FAIL':scorecard?.pass_fail||'PENDING'};
}
