import AppToast from './AppToast';
import {useEffect,useRef,useState} from 'react';
import {useAppAuth} from '../context/AuthContext';
import {getActiveSessionMetadata} from '../hooks/useSessionTracker';
import {observePostCallStatus,postCallFailureMessage} from '../lib/postCallStatus.js';

export default function PostCallStatusAlert() {
  const {getToken}=useAppAuth();
  const lastSession=useRef(null);
  const [message,setMessage]=useState('');
  const allowMissingEndpoint=import.meta.env.DEV && ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
  useEffect(()=>observePostCallStatus({getToken,allowMissingEndpoint,
    getSessionId:()=>{
      const id=getActiveSessionMetadata().sessionId;
      if (id) lastSession.current=id;
      return lastSession.current;
    },
    onStatus:job=>setMessage(postCallFailureMessage(job)),
    onError:error=>setMessage(`Unable to check post-call status. ${error.message}`),
  }),[getToken,allowMissingEndpoint]);
  return message ? <AppToast message={message} tone="error" onDismiss={() => setMessage('')} /> : null;
}
