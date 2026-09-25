import {args,database,checked,randomKey,hash,requiredName} from './common.js';
import {validateUrl} from '../../integrations/transport.js';
const a=args({name:{type:'string'},'push-url':{type:'string'},'push-format':{type:'string'},'enable-push':{type:'boolean'},revoke:{type:'boolean'},list:{type:'boolean'}});
const db=database();
if(a.list){console.log(await checked(db.from('availability_consumers').select('name,active,created_at,push_enabled,push_format')));}
else {
 const name=requiredName(a.name);
 if(a.revoke){console.log(await checked(db.from('availability_consumers').update({active:false,push_enabled:false}).eq('name',name).select('name,active')));}
 else {
  if(a['push-format'] && !['json','simple'].includes(a['push-format']))throw Error('Invalid push format');
  if(a['push-url'])validateUrl(a['push-url']);
  const existing=await checked(db.from('availability_consumers').select('name,push_url,push_secret,push_format,push_enabled').eq('name',name).maybeSingle());
  const key=existing?null:randomKey();
  const secret=(a['push-url'] || (a['enable-push'] && existing?.push_url)) && !existing?.push_secret ? randomKey():null;
  const patch={push_format:a['push-format'] || existing?.push_format || 'json',...(a['push-url']?{push_url:a['push-url']}:{}),...(secret?{push_secret:secret}:{})};
  if(a['enable-push']){
    if(!(a['push-url']||existing?.push_url))throw Error('--push-url required before enabling push');
    patch.push_enabled=true;
  }
  if(existing)await checked(db.from('availability_consumers').update(patch).eq('name',name));
  else await checked(db.from('availability_consumers').insert({name,key_hash:hash(key),...patch}));
  console.log(JSON.stringify({name,...(key?{api_key:key}:{}),...(secret?{push_secret:secret}:{}),push_enabled:patch.push_enabled ?? existing?.push_enabled ?? false}));
 }
}
