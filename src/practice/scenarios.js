// Authored synthetic personas only. No call, contact or transcript is a source.
const good='Ask permission, establish scope and consent in this conversation, clarify needs, verify facts against approved material, respect the decision and explain next steps without pressure.';
const rows=[
 ['current-plan','Happy with current plan','MA','Mara','Content with current coverage and unsure why a review matters.','Understand whether a review is worthwhile.',['Fear of disruption','Wants time to compare']],
 ['doctor','Loyal to a doctor','MA','Oren','Keeping a familiar physician matters more than extras.','Learn how network participation would be checked.',['Distrusts verbal network promises','Also has a specialist']],
 ['price','Price objection','MA','Tavi','Concerned about total out of pocket expenses.','Understand tradeoffs without a savings promise.',['Focuses only on premiums','Worries about hospital expenses']],
 ['guarantee','Wants a guarantee','MA','Lina','Wants certainty that a future procedure would be covered.','Hear a careful explanation of verification and limitations.',['Pushes for a yes or no promise','Confuses application with approval']],
 ['best','Which plan is best','MA','Neri','Asks for the single best plan before sharing needs.','Compare options around individual priorities.',['Thinks all plans are identical','Wants the agent to decide']],
 ['medicaid','Medicare and Medicaid','MA','Sela','Confuses Medicare eligibility with Medicaid assistance.','Understand the distinction and what must be verified.',['Uncertain eligibility','Assumes every benefit applies']],
 ['caregiver','Caregiver for a parent','MA','Ivo','Helping a parent and unclear about decision authority.','Find a respectful path to involve the parent or authorized representative.',['No confirmed authority','Parent has different priorities']],
 ['mail','Wants it mailed','MA','Veda','Prefers written information before considering a change.','Receive clear next steps without being pressured.',['Does not want to provide personal details','Needs family review']],
 ['trust','Distrusts phone sales','MA','Elio','Wary of unsolicited sales conversations.','Understand who is speaking and retain control of the decision.',['Fears scams','May end the conversation if pressured']],
 ['already-enrolled','Already enrolled elsewhere','MA','Rumi','Recently chose coverage elsewhere this year.','Understand whether any discussion is appropriate without an invented election period.',['Unsure when coverage begins','Does not want an unauthorized switch']],
 ['topic','Hard to keep on topic','MA','Ziva','Enjoys conversation and frequently changes the subject.','Feel heard while receiving a clear structured review.',['Avoids eligibility questions','Raises unrelated errands']],
 ['ready','Ready to enroll','MA','Aven','Eager to proceed before the review is complete.','Complete a voluntary, informed rehearsal of enrollment.',['Wants to skip disclosures','Assumes immediate approval']],
 ['income','Predictable retirement income','ANNUITY','Pavo','Interested in retirement income and uncertain about liquidity.','Understand suitability questions and limitations.',['Needs emergency access','Does not understand surrender terms']],
 ['annuity-price','Annuity costs','ANNUITY','Esra','Concerned about charges and committing savings.','Discuss costs and suitability without unsupported returns.',['Fear of losing access','Wants a guaranteed return claim']],
 ['annuity-family','Family review','ANNUITY','Leto','Wants a family member involved before a financial decision.','Take time for a careful voluntary review.',['Distrusts urgency','Unclear time horizon']],
];
export const SCENARIOS=Object.freeze(rows.map(([id,title,product,firstName,situation,goal,hiddenObjections])=>Object.freeze({id,title,product,firstName,situation,goal,hiddenObjections:Object.freeze(hiddenObjections),goodCall:good+' '+goal})));
export const scenarioById=id=>SCENARIOS.find(s=>s.id===id);
export const publicScenarios=()=>SCENARIOS.map(({id,title,product})=>({id,title,product}));
