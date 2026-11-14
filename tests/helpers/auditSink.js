// Explicit synthetic audit sink for isolated provider/transport unit tests.
// Database authorization/immutability is exercised against the fresh bootstrap.
export function auditSink(base={}) {
 const records=[];
 return {...base,records,from(table){
  if(table==='evidence_access_log')return {async insert(row){records.push(row);return {error:null};}};
  return base.from(table);
 }};
}
