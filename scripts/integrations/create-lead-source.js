import {args,database,checked,randomKey,hash,requiredName} from './common.js';
import {validateFieldMap} from '../../integrations/payloads.js';
import {validateUrl} from '../../integrations/transport.js';
const a=args({name:{type:'string'},type:{type:'string'},number:{type:'string'},'postback-url':{type:'string'},'report-emails':{type:'string'},'field-map':{type:'string'},tenant:{type:'string'},aggregator:{type:'string'},'external-id':{type:'string'},'unsigned-postback':{type:'boolean'},list:{type:'boolean'},deactivate:{type:'boolean'}});
const db=database();const tenant=a.tenant || process.env.DEFAULT_TENANT_ID || '00000000-0000-4000-8000-000000000001';
if(a.list){console.log(await checked(db.from('lead_sources').select('id,name,type,active,twilio_number,external_id,parent_source_id,report_emails').eq('tenant_id',tenant)));}
else {
 const name=requiredName(a.name);
 if(a.deactivate){console.log(await checked(db.from('lead_sources').update({active:false}).eq('tenant_id',tenant).eq('name',name).select('name,active')));}
 else {
  if(!['aggregator','publisher','direct'].includes(a.type))throw Error('--type must be aggregator, publisher or direct');
  if(a['external-id'] && !/^[\w .:@+-]{1,128}$/.test(a['external-id']))throw Error('Invalid publisher external ID');
  if(a.number && !/^\+[1-9]\d{7,14}$/.test(a.number))throw Error('--number must be E.164');
  if(a['postback-url'])validateUrl(a['postback-url']);
  const map=validateFieldMap(a['field-map']?JSON.parse(a['field-map']):{});
  const emails=(a['report-emails']||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(emails.some(s=>!/^\S+@\S+\.\S+$/.test(s)))throw Error('Invalid report email');
  let parent=null;
  if(a.aggregator){parent=await checked(db.from('lead_sources').select('id').eq('tenant_id',tenant).eq('name',a.aggregator).eq('type','aggregator').eq('active',true).single());}
  if(a.type==='publisher' && !parent)throw Error('Publisher requires --aggregator NAME');
  const pingKey=a.type==='aggregator'?randomKey():null;
  const secret=a['postback-url'] && !a['unsigned-postback']?randomKey():null;
  const row=await checked(db.from('lead_sources').insert({tenant_id:tenant,name,type:a.type,twilio_number:a.number||null,
    parent_source_id:parent?.id||null,external_id:a['external-id']||null,postback_url:a['postback-url']||null,
    postback_secret:secret,postback_field_map:map,report_emails:emails,ping_key_hash:pingKey?hash(pingKey):null}).select('id,name').single());
  console.log(JSON.stringify({...row,...(pingKey?{ping_api_key:pingKey}:{}),...(secret?{postback_secret:secret}:{})}));
 }
}
