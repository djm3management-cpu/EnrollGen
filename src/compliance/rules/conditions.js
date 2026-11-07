// Only affirmative metadata or explicit beneficiary/current-coverage statements
// establish a condition. An agent listing available products is not evidence.
export function callConditions(call,stages){
 const current=String(call.metadata?.prior_coverage_type||call.metadata?.current_coverage_type||call.current_coverage_type||'');
 const currentAgent=stages.agent.filter(l=>!/[?]|(?:if|do|would|could) you have|are you/i.test(l.text)&&/(?:you (?:have|are (?:on|with))|your current|you(?:'re| are) currently).{0,80}(?:medigap|medicare supplement|original medicare|advantage)/i.test(l.text)).map(l=>l.text).join(' ');
 const positiveCustomer=stages.lines.filter(l=>l.speaker==='customer'&&/(?:i (?:currently )?have|i(?:'m| am) (?:on|with)|my (?:plan|policy) is|yes.{0,10}(?:medigap|supplement))/i.test(l.text)&&!/(?:don't|do not|no|not).{0,20}(?:have|medigap|supplement)/i.test(l.text)).map(l=>l.text).join(' ');
 const stated=[current,positiveCustomer,currentAgent].join(' ');
 const medigap=/medigap|medicare supplement|med ?supp/i.test(stated)&&!/^(?:none|no medigap|no supplement)$/i.test(current);
 const original=/original medicare|traditional medicare|(?:only|just) (?:medicare )?parts? a (?:and|&) b/i.test(stated)||medigap;
 const maSwitch=/\bMA\b|medicare advantage|MAPD/i.test(current)||/your (?:current|existing).{0,70}(?:medicare advantage|giveback|MAPD)|(?:for your 2026|for 2026)[\s\S]{0,100}for 2027|(?:from|switch).{0,45}(?:humana|aetna|united|devoted).{0,50}to.{0,30}(?:humana|aetna|united|devoted)/i.test(stages.agent.map(l=>l.text).join(' '));
 const meta=call.metadata||{};
 const parse=v=>{if(typeof v==='number'&&Number.isFinite(v))return v;return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)?Date.parse(v):NaN;};
 const end=parse(meta.current_coverage_end_date),start=parse(meta.new_effective_date||call.effective_date);
 const datesGap=Number.isFinite(end)&&Number.isFinite(start)&&start-end>86400000;
 const gap=meta.coverage_gap_established===true||datesGap||stages.agent.some(l=>/(?:you will|you would|there will|you have).{0,35}(?:a gap in coverage|be uninsured|without (?:health )?coverage)/i.test(l.text));
 return {medigap,original,maSwitch,gap};
}
