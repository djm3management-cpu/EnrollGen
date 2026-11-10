import {checked} from '../functions/_evidenceAccess.js';
import {aggregateVersion} from '../../src/compliance/engine/VersionAggregator.js';
export async function prepareVersion(db,call,decision=null,judgmentDetections=null){
 const source=call.compliance_scorecard_id?checked(await db.from('compliance_scorecards').select('*').eq('id',call.compliance_scorecard_id).eq('call_id',call.id).eq('tenant_id',call.tenant_id).single()):{id:null,template_id:null};
 const items=source.id?checked(await db.from('scorecard_items').select('*').eq('scorecard_id',source.id)):[];
 const overrides=checked(await db.from('intent_detections').select('id,manually_overridden').eq('call_id',call.id).eq('manually_overridden',true));
 for(const item of items)if(overrides.some(d=>d.id===item.detection_id))item.decided_by='Admin';
 const target=checked(await db.from('scoring_templates').select('id').eq('product_type',call.product_type).eq('is_active',true).order('version',{ascending:false}).limit(1).single());
 const templateItems=checked(await db.from('scoring_template_items').select('*').eq('template_id',target.id));
 const intents=checked(await db.from('compliance_intents').select('id,intent_code'));
 return aggregateVersion({call,source,items,templateItems,intents,decision,judgmentDetections,targetTemplateId:target.id});
}
export async function saveVersion(db,call,payload,{requestId,userId,decision=null}={}){
 return checked(await db.rpc('save_compliance_version',{p_call_id:call.id,p_tenant_id:call.tenant_id,p_source_id:payload.scorecard.supersedes_id,p_request_id:requestId,p_requested_by:userId,p_payload:payload,p_decision:decision}));
}
