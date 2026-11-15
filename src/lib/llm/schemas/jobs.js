// Closed objects are accepted by OpenAI strict structured output and local AJV.
const string = {type:'string'};
const number = {type:'number'};
const nullableString = {type:['string','null']};
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const array = items => ({type:'array',items});
const enumeration = values => ({type:'string',enum:values});
const format = (name,schema) => ({type:'json_schema',json_schema:{name,strict:true,schema}});
export function rtsFormat(headers) {
  return format('rts_normalization',object({
    source_format:object({detected_columns:object(Object.fromEntries(headers.map(key=>[key,nullableString]))),row_count:number,
      source_type:enumeration(['SMS_sureLC','Ritter','Savoy','Messer','unknown']),confidence:number}),
    agents_matched:array(object({raw_name:string,raw_npn:nullableString,matched_agent_id:nullableString,
      matched_agent_name:nullableString,match_type:enumeration(['NPN','NAME_FUZZY','UNKNOWN','AGENCY_LEVEL']),confidence:number})),
    carrier_mappings:array(object({raw_carrier_name:string,matched_carrier_id:nullableString,matched_carrier_name:nullableString,
      match_status:enumeration(['MATCHED','NEW']),confidence:number,suggested_name:string})),
    rts_records:array(object({agent_raw_name:string,agent_npn:nullableString,carrier_raw_name:string,
      product_line:enumeration(['Medicare Advantage','Medicare Supplement','PDP','ACA','Life','Annuity','Health','Dental','Vision','Hospital Indemnity','Final Expense','LTC','other']),
      contract_status:enumeration(['ACTIVE','SUBMITTED','INACTIVE','TERMINATED','BLACKOUT','REQUESTED']),
      states:array(object({state:string,sub_status:{type:['string','null'],enum:['APT','JIT','REQ','PENDING',null]}})),
      writing_number:nullableString,certifications:array(object({name:string,status:{type:['string','null'],enum:['complete','incomplete',null]},date:nullableString})),
      termination_date:nullableString,effective_date:nullableString})),
    warnings:array(object({type:enumeration(['UNKNOWN_AGENT','NEW_CARRIER','AMBIGUOUS_STATUS','MISSING_NPN','DUPLICATE_ROW','PARSE_ERROR']),
      message:string,row_index:{type:['number','null']}})),
  }));
}
export const knowledgeUpdateFormat = format('knowledge_update',object({
  changed:{type:'boolean'},summary:string,confidence:{type:'number',minimum:0,maximum:1},updatedContent:string,
}));
