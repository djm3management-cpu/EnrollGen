export function sortTranscript(lines = []) {
  return (Array.isArray(lines)?lines:[]).filter(x=>x&&typeof x==='object').map(x=>({...x}))
    .sort((a,b)=>(a.start_ms==null?Infinity:Number(a.start_ms))-(b.start_ms==null?Infinity:Number(b.start_ms)));
}
// Endpoint coverage is a lower-bound completeness screen, not proof that interior
// silence is lost speech. Persisted capture gaps are required for interior repair.
export function transcriptCoverage(call) {
  const durationMs=Math.max(0,Number(call.call_duration_seconds)||0)*1000;
  const lines=sortTranscript(call.transcript_diarized);
  const endMs=Math.max(0,...lines.filter(x=>x.text?.trim()).map(x=>Number(x.end_ms)||Number(x.start_ms)||0));
  const durationNeedsVerification=durationMs>6*60*60*1000;
  const ratio=durationMs>0?Math.min(1,endMs/durationMs):0;
  const gaps=(call.metadata?.transcription_gaps||[]).filter(g=>Number.isFinite(g.start_ms)&&Number.isFinite(g.end_ms)&&g.end_ms>g.start_ms);
  const missingRanges=[...gaps,...(durationMs>endMs?[{start_ms:endMs,end_ms:durationMs}]:[])].sort((a,b)=>a.start_ms-b.start_ms);
  const merged=[];
  for(const g of missingRanges){const start=Math.max(0,g.start_ms),end=Math.min(durationMs,g.end_ms);if(end<=start)continue;const last=merged.at(-1);if(last&&start<=last.end_ms)last.end_ms=Math.max(last.end_ms,end);else merged.push({start_ms:start,end_ms:end});}
  const missingMs=merged.reduce((n,g)=>n+g.end_ms-g.start_ms,0);
  return {durationMs,endMs,ratio,durationNeedsVerification,complete:!durationNeedsVerification&&durationMs>0&&ratio>=.95&&missingMs/durationMs<=.05,missingRanges:merged,missingMinutes:missingMs/60000};
}
export function evidence(line){return line?{evidence_text:line.text,evidence_timestamp_ms:line.start_ms??null,evidence_end_ms:line.end_ms??line.start_ms,segment_id:line.id||line.segmentId||null}:{};}
