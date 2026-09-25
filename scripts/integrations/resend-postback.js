import {args,database,checked} from './common.js';
const a=args({id:{type:'string'},list:{type:'boolean'},'link-issues':{type:'boolean'}});
const db=database();
if(a['link-issues'])console.log(await checked(db.from('integration_link_issues').select('*')));
else if(a.list)console.log(await checked(db.from('integration_deliveries').select('id,source_id,attempts,created_at,expires_at').eq('kind','postback').eq('status','failed')));
else {
 if(!a.id)throw Error('--id DELIVERY_UUID or --list required');
 console.log({requeued:await checked(db.rpc('resend_disposition',{p_id:a.id}))});
}
