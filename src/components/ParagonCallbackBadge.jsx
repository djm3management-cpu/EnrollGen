import {useEffect,useState} from 'react';
import {useAppAuth} from '../context/AuthContext';
import {evidenceRequest} from '../lib/evidenceApi';
import {FOLLOW_UPS_UPDATED} from '../lib/followUps';
import {PARAGON_CALLBACK_PATH} from '../lib/paragonCallbacks';
export default function ParagonCallbackBadge(){
 const {getToken,user,organization}=useAppAuth();
 const identity=`${user?.id||''}:${organization?.id||''}`;
 const [state,setState]=useState({identity:'',count:0});
 useEffect(()=>{
  let cancelled=false,busy=false;
  const refresh=async()=>{
   if(busy)return;busy=true;
   try{
    const result=await evidenceRequest(getToken,'paragon-zip-confirm?summary=1');
    if(!Number.isSafeInteger(result?.count)||result.count<0)throw Error('Invalid callback count');
    if(!cancelled)setState({identity,count:result.count});
   }catch{if(!cancelled)setState({identity,count:0});}finally{busy=false;}
  };
  void refresh();const timer=window.setInterval(refresh,30000);
  window.addEventListener('focus',refresh);window.addEventListener(FOLLOW_UPS_UPDATED,refresh);
  return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener(FOLLOW_UPS_UPDATED,refresh);};
 },[getToken,identity]);
 const count=state.identity===identity?state.count:0;
 return count>0?<a className="contacts-mini-btn" href={PARAGON_CALLBACK_PATH}>{count} Paragon {count===1?'callback':'callbacks'}</a>:null;
}
