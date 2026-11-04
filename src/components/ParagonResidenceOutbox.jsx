import {useEffect} from 'react';
import {useAppAuth} from '../context/AuthContext';
import {createResidenceOutbox,residenceScope} from '../lib/paragonResidence.js';
export default function ParagonResidenceOutbox(){
 const {getToken,user,organization}=useAppAuth();const scope=residenceScope(user,organization);
 useEffect(()=>{
  if(!user?.id)return;
  let outbox;
  try { outbox=createResidenceOutbox({storage:window.localStorage,getToken,scope}); } catch { return; }
  const flush=()=>{void outbox.flush().catch(()=>{});};
  flush();const timer=setInterval(flush,3000);
  window.addEventListener('online',flush);window.addEventListener('paragon-residence-outbox',flush);
  return()=>{clearInterval(timer);window.removeEventListener('online',flush);window.removeEventListener('paragon-residence-outbox',flush);};
 },[getToken,scope,user?.id]);
 return null;
}
