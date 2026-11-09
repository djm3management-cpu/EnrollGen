import {useEffect,useState} from 'react';
import {useAppAuth} from '../context/AuthContext';

// UI visibility only. The server still verifies Clerk and tenant authorization.
export function adminReviewClaims(token){
 try{
  const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  const admin=role=>['admin','org:admin','owner','org:owner'].includes(String(role||'').toLowerCase());
  return Boolean(((payload.org_id||payload.o?.id)&&[payload.org_role,payload.o?.rol].some(admin))
   ||[payload.role,payload.public_metadata?.role,payload.private_metadata?.role,payload.metadata?.role].some(admin)
   ||payload.public_metadata?.isAdmin===true||payload.metadata?.isAdmin===true);
 }catch{return false;}
}

export function useAdminReviewAccess(){
 const {getToken,user,organization,identityLoaded,isSignedIn,sessionExpired}=useAppAuth();
 const identity=`${user?.id||''}:${organization?.id||''}`;
 const ready=Boolean(identityLoaded&&isSignedIn&&!sessionExpired&&user?.id);
 const [access,setAccess]=useState(null);
 useEffect(()=>{
  let stopped=false;setAccess(null);
  if(ready)getToken().then(token=>{if(!stopped)setAccess({identity,allowed:adminReviewClaims(token)});}).catch(()=>{});
  return()=>{stopped=true;};
 },[getToken,identity,ready,user,organization]);
 return {identity,canReview:ready&&access?.identity===identity&&access.allowed===true};
}
